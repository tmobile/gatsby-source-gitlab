import { exec, mkdir } from "shelljs";
import { isDir } from "./util";
import { join } from "path";

function executeCommand(command: string) {
  console.log(command);
  const output = exec(command);
  console.log(output.stdout);

  return output.code;
}

//
export async function clone(
  local: string,
  remote: string,
  branch: string = "master",
  depth: number = 1
) {
  const command = (await isDir(join(local, ".git")))
    ? `git pull --depth ${depth}`
    : `git clone --depth ${depth} ${remote} -b ${branch} "${local}"`;
  return executeCommand(command);
}
