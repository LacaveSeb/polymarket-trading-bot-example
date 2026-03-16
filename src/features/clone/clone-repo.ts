import { execSync } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { Repo } from "./types.js";
import { SHELL } from "../../lib/shell.js";

export async function ensureDir(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

function isFullClone(): boolean {
  const v = process.env.FULL_CLONE ?? process.env.GITHUB_CLONE_FULL ?? "";
  if (v === "") return false;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

export function cloneRepo(repo: Repo, outDir: string): void {
  const target = join(outDir, repo.name);
  const depthArg = isFullClone() ? "" : " --depth 1";
  try {
    execSync(`git clone${depthArg} "${repo.clone_url}" "${target}"`, {
      stdio: "inherit",
      shell: SHELL,
    });
    console.log(`[OK] ${repo.name}`);
  } catch (e) {
    console.error(`[FAIL] ${repo.name}: ${e}`);
  }
}
