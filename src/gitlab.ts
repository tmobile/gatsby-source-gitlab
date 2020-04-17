import { GroupDetailSchema, ProjectSchema, Gitlab } from "gitlab";

export const GL_DEFAULT_HOST = "https://gitlab.com/";
export const GL_GROUP_TYPE = "GitlabGroup";
export const GL_PROJECT_TYPE = "GitlabProject";

export type GitlabId = string | number;

export interface GitlabConfigItem {
  host?: string;
  idOrPath: GitlabId;
  cloneDepth?: number;
  meta?: { [key: string]: any };
}

export interface GitlabConfiguredItem {
  config: GitlabConfigItem;
}

export type GitlabProject = ProjectSchema & GitlabConfiguredItem;

export interface GitlabGroup extends GroupDetailSchema, GitlabConfiguredItem {
  subgroups?: GitlabGroup[];
  projects: GitlabProject[];
}

export class GitlabClient {
  private client: Gitlab;

  private static toGitlabProject(
    project: ProjectSchema,
    config: GitlabConfigItem
  ): GitlabProject {
    return {
      ...project,
      config,
    };
  }

  private static toGitlabGroup(
    group: GroupDetailSchema,
    config: GitlabConfigItem
  ): GitlabGroup {
    return {
      ...group,
      projects: (group.projects || []).map((project) =>
        this.toGitlabProject(project, config)
      ),
      config,
    };
  }

  constructor(token: string) {
    this.client = new Gitlab({ token });
  }

  project(config: GitlabConfigItem) {
    const self = this;
    return {
      details: async function (): Promise<GitlabProject> {
        return GitlabClient.toGitlabProject(
          await self.client.Projects.show(config.idOrPath),
          config
        );
      },
    };
  }

  group(config: GitlabConfigItem) {
    const self = this;
    // console.log("Gitlab Group", config);
    return {
      details: async function (): Promise<GitlabGroup> {
        const result = GitlabClient.toGitlabGroup(
          await self.client.Groups.show(config.idOrPath),
          config
        );
        result.subgroups = await this.subgroups();
        return result;
      },

      projects: async function (): Promise<GitlabProject[]> {
        return (
          await self.client.GroupProjects.all(config.idOrPath)
        ).map((project) => GitlabClient.toGitlabProject(project, config));
      },

      subgroups: async function (): Promise<GitlabGroup[]> {
        const subgroups = await self.client.Groups.subgroups(
          config.idOrPath
        ).then((groups) =>
          groups.map((group) => GitlabClient.toGitlabGroup(group, config))
        );

        const loadProjects = Promise.all(
          subgroups.map(async (subgroup) => {
            return self
              .group({ ...config, idOrPath: subgroup.full_path })
              .projects()
              .then((projects) => (subgroup.projects = projects));
          })
        );

        const loadSubgroups = Promise.all(
          subgroups.map(async (subgroup) => {
            return self
              .group({ ...config, idOrPath: subgroup.full_path })
              .subgroups()
              .then((subgroups) => {
                subgroup.subgroups = subgroups;
                return subgroup;
              });
          })
        );

        const [, result] = await Promise.all([loadProjects, loadSubgroups]);
        return result;
      },
    };
  }
}
