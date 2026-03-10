import fs from "node:fs";
import path from "node:path";
import { ensureGit, commitIfNeeded, setupRemote, pushRepo } from "./git.js";
import { showCurrentAuthors, rewriteAllAuthors, verifyRewrite } from "./rewrite.js";
import { createGithubRepo } from "./github.js";

export async function processRepository(
  repoPath: string,
  originalName: string
): Promise<boolean> {
  console.log(`\n📁 Processing repository: ${originalName}`);
  console.log(`📁 Full path: ${repoPath}`);
  if (!fs.existsSync(repoPath)) {
    console.error(`❌ Repository path does not exist: ${repoPath}`);
    return false;
  }
  if (!fs.statSync(repoPath).isDirectory()) {
    console.error(`❌ Path is not a directory: ${repoPath}`);
    return false;
  }
  const currentDir = process.cwd();
  try {
    console.log(`📂 Changing to directory: ${repoPath}`);
    process.chdir(repoPath);
    ensureGit(repoPath);
    commitIfNeeded(repoPath);
    showCurrentAuthors(repoPath);
    rewriteAllAuthors(repoPath);
    if (!verifyRewrite(repoPath)) {
      console.error("❌ Verification failed. Skipping - repo NOT created.");
      return false;
    }
    const repoName = await createGithubRepo(originalName);
    if (!repoName) return false;
    setupRemote(repoPath, repoName);
    pushRepo(repoPath);
    console.log(`🎯 Repository successfully processed: ${repoName}\n`);
    return true;
  } catch (error) {
    console.error(
      `❌ Error processing ${originalName}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  } finally {
    process.chdir(currentDir);
  }
}
