/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

import {
  SourceNodesArgs,
  NodeInput,
  CreateNodeArgs,
  NodePluginArgs,
  Node,
  PluginOptions,
} from "gatsby";
import {
  GitlabClient,
  GitlabGroup,
  GitlabProject,
  GL_PROJECT_TYPE,
  GL_GROUP_TYPE,
  GitlabConfigItem,
} from "./gitlab";
import { readFile, cacheDir, files } from "./util";
import { clone } from "./git";
import { join } from "path";

const { createFileNode } = require("gatsby-source-filesystem/create-file-node");

export type GitlabGroupNode = NodeInput & Omit<GitlabGroup, "id">;
export type GitlabProjectNode = NodeInput & Omit<GitlabProject, "id">;

interface GitlabGroupsConfig extends PluginOptions {
  token?: string;
  groups?: GitlabConfigItem[];
  projects?: GitlabConfigItem[];
}

const readGitlabToken = async ({ token }: GitlabGroupsConfig) => {
  const result =
    process.env.GITLAB_TOKEN || token || (await readFile("token.txt", "utf8"));
  if (!result)
    throw new Error(
      "Gitlab token not found in GITLAB_TOKEN environment variable, " +
        "plug-in `token` configuration, or in token.txt"
    );
  return result.trim();
};

async function createProjectNode(
  project: GitlabProject,
  parentId: string | null,
  { actions, createContentDigest, createNodeId, store }: NodePluginArgs
): Promise<GitlabProjectNode> {
  const { createNode, createParentChildLink } = actions;

  // Create Project Node
  const result: GitlabProjectNode = {
    ...project,
    id: `${GL_PROJECT_TYPE}-${project.id}`,
    parent:
      parentId ||
      `${GL_GROUP_TYPE}-${
        (project.shared_with_groups[0] || { id: "unknown" }).id
      }`,
    children: [],
    internal: {
      type: GL_PROJECT_TYPE,
      contentDigest: createContentDigest(project),
    },
  };

  createNode(result);

  return result;
}

export async function onCreateNode(args: CreateNodeArgs<GitlabGroupNode>) {
  const { node, actions, store, createNodeId } = args;
  const { createParentChildLink, createNode } = actions;

  switch (node.internal.type) {
    case GL_GROUP_TYPE:
      for (const project of node.projects) {
        const projectNode = await createProjectNode(project, node.id, args);
        createParentChildLink({
          parent: node,
          child: (projectNode as unknown) as Node,
        });
      }
      delete node.projects;
      break;
    case GL_PROJECT_TYPE:
      const projectNode = (node as unknown) as GitlabProjectNode;
      // Clone Files
      if (projectNode.config.cloneDepth && projectNode.default_branch) {
        const cachePath = cacheDir(store.getState().program.directory);
        const repoPath = join(cachePath, projectNode.path_with_namespace);

        await clone(
          repoPath,
          projectNode.ssh_url_to_repo,
          projectNode.default_branch,
          projectNode.config.cloneDepth
        );

        const repoFiles = (await files(repoPath)).filter(
          (path) => !path.includes("/.git/") && !path.includes("\\.git\\")
        );

        const promises: Promise<any>[] = repoFiles.map((repoFilePath) =>
          createFileNode(repoFilePath, createNodeId, {
            name: `gatsby-source-gitlab-${projectNode.id}`,
            path: cachePath,
          }).then((fileNode: any) => {
            // Create the node, as if it were created by the gatsby-source
            // filesystem plugin.
            createNode(
              { ...fileNode, parent: projectNode.id },
              {
                name: `gatsby-source-filesystem`,
              }
            );
            createParentChildLink({
              parent: (projectNode as unknown) as Node,
              child: fileNode,
            });
          })
        );

        await Promise.all(promises);
      }
      break;
    default:
      break;
  }
}

export async function sourceNodes(
  args: SourceNodesArgs,
  options: GitlabGroupsConfig
) {
  const {
    actions: { createNode },
    createContentDigest,
  } = args;

  const gitlab = new GitlabClient(await readGitlabToken(options));

  // Traverse Gitlab Groups

  const createGitlabNodesFromGroup = async (
    group: GitlabGroup
  ): Promise<GitlabGroupNode> => {
    const groupNodeId = `${GL_GROUP_TYPE}-${group.id}`;
    const groupNodeParentId = `${GL_GROUP_TYPE}-${group.parent_id || "root"}`;

    console.log("createGitlabNodesFromGroup", {
      groupNodeId,
      groupNodeParentId,
    });

    const subgroupNodes = await Promise.all(
      (group.subgroups || []).map(createGitlabNodesFromGroup) || []
    );
    delete group.subgroups;

    const result: GitlabGroupNode = {
      ...group,
      id: groupNodeId,
      parent: groupNodeParentId,
      children: subgroupNodes.map((node) => node.id),
      internal: {
        type: GL_GROUP_TYPE,
        contentDigest: createContentDigest(group),
      },
    };

    createNode(result);
    return result;
  };

  const groupWork: Promise<GitlabGroupNode | GitlabProjectNode>[] =
    (options.groups &&
      options.groups.map(async (groupConfig: GitlabConfigItem) =>
        createGitlabNodesFromGroup(await gitlab.group(groupConfig).details())
      )) ||
    [];
  const work = groupWork.concat(
    (options.projects &&
      options.projects.map(async (projectConfig: GitlabConfigItem) =>
        createProjectNode(
          await gitlab.project(projectConfig).details(),
          null,
          args
        )
      )) ||
      []
  );

  console.log("gatsby-node-ex, sourceNodes working...");
  return Promise.all(work);
}
