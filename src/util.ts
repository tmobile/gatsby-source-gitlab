/*
 * =========================================================================
 * Copyright 2020 T-Mobile USA, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 * See the LICENSE file for additional language around the disclaimer of
 * warranties. Trademark Disclaimer: Neither the name of “T-Mobile, USA”
 * nor the names of its contributors may be used to endorse or promote
 * products derived from this software without specific prior written
 * permission.
 * =========================================================================
 */

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
