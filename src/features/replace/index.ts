import fs from "node:fs";
import path from "node:path";
import { getReplaceConfig } from "./config.js";
import { processRepository } from "./process-repo.js";

/**
 * Rewrite git history for repos in BASE_DIR and push to new GitHub repos.
 * Run via: npm run replace
 */
export async function runReplace(): Promise<void> {
  const { baseDir, githubUsername, githubUserEmail, autoRemove } =
    getReplaceConfig();

  console.log("🚀 Starting Git History Rewrite Tool");
  console.log("======================================");
  console.log(`Username: ${githubUsername}`);
  console.log(`Email: ${githubUserEmail}`);
  console.log(`Base Directory: ${baseDir}`);
  console.log("======================================\n");

  if (!fs.existsSync(baseDir)) {
    console.error("❌ BASE_DIR not found:", baseDir);
    return;
  }
  const items = fs.readdirSync(baseDir);
  const repos = items.filter((name) => {
    const fullPath = path.join(baseDir, name);
    const isDir = fs.statSync(fullPath).isDirectory();
    if (isDir) console.log(`   📁 ${name}`);
    return isDir;
  });
  if (repos.length === 0) {
    console.log("❌ No directories found in:", baseDir);
    return;
  }
  console.log(`\n📂 Found ${repos.length} repositories to process:\n`);
  repos.forEach((repo, i) => console.log(`   ${i + 1}. ${repo}`));
  console.log(
    "\n⚠️  WARNING: This will REWRITE HISTORY for all these repositories!"
  );
  if (process.env.SKIP_CONFIRMATION !== "true") {
    console.log("Press Ctrl+C within 5 seconds to cancel...");
    await new Promise((r) => setTimeout(r, 5000));
  }

  let successCount = 0;
  const successRepos: string[] = [];
  const failedRepos: string[] = [];

  for (const repo of repos) {
    console.log("\n" + "🔷".repeat(30));
    console.log(`🔷 Processing: ${repo}`);
    console.log("🔷".repeat(30));
    const success = await processRepository(
      path.join(baseDir, repo),
      repo
    );
    if (success) {
      successCount++;
      successRepos.push(repo);
    } else {
      failedRepos.push(repo);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🏁 ALL DONE");
  console.log("=".repeat(50));
  console.log(`✅ Successful: ${successCount}`);
  if (successRepos.length > 0)
    console.log(`   Success: ${successRepos.join(", ")}`);
  console.log(`❌ Failed: ${failedRepos.length}`);
  if (failedRepos.length > 0)
    console.log(`   Failed repos: ${failedRepos.join(", ")}`);
  console.log("=".repeat(50));

  if (autoRemove && successRepos.length > 0) {
    console.log("\n🗑️  AUTO_REMOVE: removing successful directories...");
    for (const repo of successRepos) {
      const repoPath = path.join(baseDir, repo);
      try {
        fs.rmSync(repoPath, { recursive: true });
        console.log(`   Removed: ${repo}`);
      } catch (err) {
        console.error(
          `   ⚠️ Failed to remove ${repo}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    console.log("✅ Done removing.");
  }
}
