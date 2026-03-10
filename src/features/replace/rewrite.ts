import { execSync } from "node:child_process";
import { run, SHELL } from "../../lib/shell.js";
import { getReplaceConfig } from "./config.js";

export function showCurrentAuthors(repoPath: string): void {
  const { githubUserEmail } = getReplaceConfig();
  console.log("\n📊 Current authors in repository:");
  try {
    const commitCount = execSync("git rev-list --count HEAD 2>nul || echo 0", {
      cwd: repoPath,
      encoding: "utf8",
      shell: SHELL,
    }).trim();
    if (parseInt(commitCount) > 0) {
      const authors = execSync(
        'git log --all --pretty="%an - %ae" | sort -u',
        {
          cwd: repoPath,
          encoding: "utf8",
          shell: SHELL,
        }
      );
      console.log(authors);
    } else {
      console.log("   No commits found in repository");
    }
  } catch {
    console.log("   No commits found or unable to list authors");
  }
}

export function rewriteAllAuthors(repoPath: string): void {
  const { githubUsername, githubUserEmail } = getReplaceConfig();
  console.log(
    "\n🔄 Rewriting ALL commits to your identity using filter-branch..."
  );
  let commitCount = 0;
  try {
    commitCount = parseInt(
      execSync("git rev-list --count HEAD 2>nul || echo 0", {
        cwd: repoPath,
        encoding: "utf8",
        shell: SHELL,
      }).trim()
    );
  } catch {
    console.log("⚠️ No commits found or unable to count commits");
  }

  if (commitCount === 0) {
    console.log("⚠️ No commits to rewrite");
    return;
  }

  console.log(`📊 Total commits to rewrite: ${commitCount}`);
  process.env.FILTER_BRANCH_SQUELCH_WARNING = "1";
  let success = false;

  try {
    console.log("📝 Trying direct command approach...");
    const directCmd = `git filter-branch -f --env-filter "GIT_AUTHOR_NAME='${githubUsername}'; GIT_AUTHOR_EMAIL='${githubUserEmail}'; GIT_COMMITTER_NAME='${githubUsername}'; GIT_COMMITTER_EMAIL='${githubUserEmail}';" HEAD --all`;
    run(directCmd, repoPath);
    success = true;
  } catch {
    console.log("⚠️ Direct approach failed, trying with different quoting...");
    try {
      const cmd2 = `git filter-branch -f --env-filter "GIT_AUTHOR_NAME=${githubUsername} GIT_AUTHOR_EMAIL=${githubUserEmail} GIT_COMMITTER_NAME=${githubUsername} GIT_COMMITTER_EMAIL=${githubUserEmail}" HEAD --all`;
      run(cmd2, repoPath);
      success = true;
    } catch {
      console.log("⚠️ Second approach failed, trying per-branch approach...");
      try {
        const branchesOut = execSync('git branch | sed "s/^..//"', {
          cwd: repoPath,
          encoding: "utf8",
          shell: SHELL,
        });
        let branches = branchesOut.split("\n").filter((b) => b.trim());
        if (branches.length === 0) {
          const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: repoPath,
            encoding: "utf8",
          }).trim();
          if (currentBranch && currentBranch !== "HEAD")
            branches = [currentBranch];
        }
        for (const branch of branches) {
          if (branch) {
            console.log(`🔄 Rewriting branch: ${branch}`);
            try {
              const branchCmd = `git filter-branch -f --env-filter "GIT_AUTHOR_NAME='${githubUsername}'; GIT_AUTHOR_EMAIL='${githubUserEmail}'; GIT_COMMITTER_NAME='${githubUsername}'; GIT_COMMITTER_EMAIL='${githubUserEmail}';" -- ${branch}`;
              run(branchCmd, repoPath);
              success = true;
            } catch {
              console.log(`⚠️ Failed to rewrite branch ${branch}`);
            }
          }
        }
      } catch {
        console.log("❌ All rewrite attempts failed");
      }
    }
  }

  try {
    run(
      "git for-each-ref --format='%(refname)' refs/original/ | xargs -r -n 1 git update-ref -d",
      repoPath,
      true
    );
  } catch {}
  try {
    run("git reflog expire --expire=now --all", repoPath, true);
    run("git gc --prune=now", repoPath, true);
  } catch {
    console.log("⚠️ Cleanup commands failed, but history may still be rewritten");
  }

  if (success) console.log("✅ History rewrite completed");
  else console.log("⚠️ History rewrite may not have completed successfully");
}

export function verifyRewrite(repoPath: string): boolean {
  const { githubUserEmail } = getReplaceConfig();
  console.log("\n🔎 Verifying reachable commit history...");
  try {
    const commitCount = execSync("git rev-list --count HEAD 2>nul || echo 0", {
      cwd: repoPath,
      encoding: "utf8",
      shell: SHELL,
    }).trim();
    if (parseInt(commitCount) === 0) {
      console.log("⚠️ No commits to verify");
      return true;
    }
    const output = execSync('git log --all --pretty="%ae%n%ce"', {
      cwd: repoPath,
      encoding: "utf8",
      shell: SHELL,
    }).toString();
    const emails = [
      ...new Set(output.split("\n").map((e) => e.trim()).filter(Boolean)),
    ];
    console.log("📧 Emails found in history:", emails);
    const invalid = emails.filter((e) => e !== githubUserEmail);
    if (invalid.length > 0) {
      console.log("❌ FAILED - Found unauthorized emails:", invalid);
      console.log("\n🔍 Problem commits:");
      try {
        if (process.platform === "win32") {
          execSync(
            `git log --all --pretty="%h - %an - %ae - %s" | findstr /v "${githubUserEmail}"`,
            { cwd: repoPath, stdio: "inherit", shell: SHELL }
          );
        } else {
          execSync(
            `git log --all --pretty="%h - %an - %ae - %s" | grep -v "${githubUserEmail}"`,
            { cwd: repoPath, stdio: "inherit", shell: SHELL }
          );
        }
      } catch {
        console.log("   No problem commits found");
      }
      return false;
    }
    console.log(
      "✅ 100% CLEAN HISTORY - all commits use your email: " + githubUserEmail
    );
    return true;
  } catch (error) {
    console.log(
      "⚠️ Verification failed:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
