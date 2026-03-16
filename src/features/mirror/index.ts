import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ensureMirrorRepoExists } from "./github.js";

function getEnv(name: string, required = true): string | undefined {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

function runGit(command: string, cwd: string) {
  execSync(command, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

export async function runMirror(): Promise<void> {
  const baseDir =
    getEnv("GITHUB_MIRROR_DIR", false) || path.resolve("./repos");
  const token = getEnv("GITHUB_MIRROR_TOKEN")!;
  const username = getEnv("GITHUB_MIRROR_USERNAME")!;

  const resolvedBase = path.resolve(baseDir);

  if (!fs.existsSync(resolvedBase) || !fs.statSync(resolvedBase).isDirectory()) {
    throw new Error(`GITHUB_MIRROR_DIR is not a directory: ${resolvedBase}`);
  }

  const entries = fs.readdirSync(resolvedBase, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const repoDir = path.join(resolvedBase, entry.name);
    if (!isGitRepo(repoDir)) continue;

    console.log(`\n=== Processing ${entry.name} ===`);

    // Ensure the remote repo exists (create if needed)
    const remoteRepoName = await ensureMirrorRepoExists(entry.name);
    if (!remoteRepoName) {
      console.error(`Skipping ${entry.name} because remote repo could not be ensured.`);
      continue;
    }

    const remoteUrl = `https://${token}@github.com/${username}/${remoteRepoName}.git`;

    console.log(`Setting origin to: ${remoteUrl}`);

    try {
      runGit(`git remote set-url origin "${remoteUrl}"`, repoDir);
      runGit("git push --force origin HEAD", repoDir);
    } catch (error) {
      console.error(`Failed mirroring ${entry.name}:`, error);
    }
  }
}
