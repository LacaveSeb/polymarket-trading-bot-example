import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { run, SHELL } from "../../lib/shell.js";
import { getReplaceConfig } from "./config.js";
import { getRemoteUrl } from "./github.js";

function addSafeDirectory(repoPath: string): boolean {
  console.log("🔧 Adding safe.directory exception...");
  try {
    const safePath = repoPath.replace(/\\/g, "/");
    execSync(`git config --global --add safe.directory "${safePath}"`, {
      stdio: "inherit",
      shell: SHELL,
    });
    console.log("✅ Safe directory added");
    return true;
  } catch {
    console.log("⚠️ Could not add safe directory, but continuing...");
    return false;
  }
}

export function ensureGit(repoPath: string): void {
  addSafeDirectory(repoPath);
  const gitDir = path.join(repoPath, ".git");
  const { githubUsername, githubUserEmail } = getReplaceConfig();
  if (!fs.existsSync(gitDir)) {
    console.log("🔧 Initializing git repository...");
    run("git init", repoPath);
  } else {
    console.log("✅ Git repository already exists");
  }
  run(`git config user.name "${githubUsername}"`, repoPath);
  run(`git config user.email "${githubUserEmail}"`, repoPath);
}

export function getCurrentBranch(repoPath: string): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
  } catch {
    console.log("⚠️ Could not determine current branch");
    return null;
  }
}

export function getPreferredBranch(repoPath: string): string | null {
  try {
    const branchesOut = execSync("git branch --list --no-color", {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    const branches = branchesOut
      .split(/\r?\n/)
      .map((b) => b.replace(/^\*?\s*/, "").trim())
      .filter(Boolean);
    if (branches.length === 0) return getCurrentBranch(repoPath);
    if (branches.includes("main")) return "main";
    if (branches.includes("master")) return "master";
    return getCurrentBranch(repoPath) || branches[0];
  } catch {
    return getCurrentBranch(repoPath);
  }
}

function getCommitDateLastPlusDays(
  repoPath: string,
  days: number
): string | null {
  try {
    const lastDateStr = execSync("git log -1 --format=%cI", {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    if (!lastDateStr) return null;
    const d = new Date(lastDateStr);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString();
  } catch {
    return null;
  }
}

export function commitIfNeeded(repoPath: string): void {
  const { addCommitDelaySinceLastCommitDays } = getReplaceConfig();
  try {
    const status = execSync("git status --porcelain", {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    if (status) {
      console.log("📝 Changes detected. Committing...");
      run("git add .", repoPath);
      const commitEnv = { ...process.env };
      const dateStr = getCommitDateLastPlusDays(
        repoPath,
        addCommitDelaySinceLastCommitDays
      );
      if (dateStr) {
        commitEnv.GIT_AUTHOR_DATE = dateStr;
        commitEnv.GIT_COMMITTER_DATE = dateStr;
      }
      const commitCmd = `git commit -m "chore: commit changes"`;
      console.log(`[${path.basename(repoPath)}] > ${commitCmd}`);
      execSync(commitCmd, {
        stdio: "inherit",
        cwd: repoPath,
        shell: SHELL,
        env: commitEnv,
      });
    } else {
      console.log("ℹ️ No uncommitted changes");
    }
  } catch {
    console.log("ℹ️ No commits yet or unable to check status");
  }
}

export function setupRemote(repoPath: string, repoName: string): void {
  run("git remote remove origin", repoPath, true);
  run(`git remote add origin ${getRemoteUrl(repoName)}`, repoPath);
}

export function pushRepo(repoPath: string): void {
  console.log("\n🚀 Force pushing to new repository...");
  const branch = getPreferredBranch(repoPath);
  if (!branch) throw new Error("Could not determine a branch to push");
  const currentBranch = getCurrentBranch(repoPath);
  if (currentBranch !== branch) {
    console.log(
      `📌 Checking out preferred branch: ${branch} (was ${currentBranch})`
    );
    run(`git checkout ${branch}`, repoPath);
  }
  console.log(`📤 Pushing branch: ${branch}`);
  run(`git push -u origin ${branch} --force`, repoPath);
  run("git push --tags --force", repoPath, true);
  console.log("✅ Push complete");
}
