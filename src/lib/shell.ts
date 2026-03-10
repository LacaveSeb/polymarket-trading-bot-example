import path from "node:path";
import { execSync } from "node:child_process";

/** Shell for execSync when shell syntax (e.g. pipes, redirects) is needed. */
export const SHELL =
  process.platform === "win32" ? (process.env.COMSPEC || "cmd.exe") : "/bin/sh";

/**
 * Run a command in the given directory. Logs the command.
 * @param ignoreError - If true, catch errors and return false instead of throwing.
 */
export function run(cmd: string, cwd: string, ignoreError = false): boolean {
  console.log(`[${path.basename(cwd)}] > ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd, shell: SHELL });
    return true;
  } catch {
    if (!ignoreError) throw new Error(`Command failed: ${cmd}`);
    return false;
  }
}
