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

export function cloneRepo(repo: Repo, outDir: string): void {
  const target = join(outDir, repo.name);
  try {
    execSync(`git clone --depth 1 "${repo.clone_url}" "${target}"`, {
      stdio: "inherit",
      shell: SHELL,
    });
    console.log(`[OK] ${repo.name}`);
  } catch (e) {
    console.error(`[FAIL] ${repo.name}: ${e}`);
  }
}
