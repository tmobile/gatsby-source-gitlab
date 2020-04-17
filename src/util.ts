import fs from "fs";
import { promisify } from "util";
import { join } from "path";

export const cacheDir = (root: string) =>
  join(root, ".cache/gatsby-source-gitlab");

export const readdir = promisify(fs.readdir);
export const readFile = promisify(fs.readFile);
export const stat = promisify(fs.stat);

export async function statSafe(path: string) {
  try {
    return await stat(path);
  } catch (err) {
    return null;
  }
}

export async function isDir(path: string) {
  const stats = await statSafe(path);
  return !!stats && stats.isDirectory();
}

export async function files(...sources: string[]) {
  const result: string[] = [];
  const work: Promise<void>[] = [];
  for (const source of sources) {
    if (await isDir(source)) {
      work.push(
        readdir(source).then((contents) =>
          files(...contents.map((content) => join(source, content))).then(
            (files) => {
              result.push(...files);
            }
          )
        )
      );
    } else {
      result.push(source);
    }
  }
  await Promise.all(work);
  return result;
}
