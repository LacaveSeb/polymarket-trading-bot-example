import { Octokit } from "@octokit/rest";
import { getBadgeConfig } from "./config.js";

const SANDBOX_REPO_NAME = "script-git-work-badge-sandbox1";

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    const { githubToken } = getBadgeConfig();
    octokit = new Octokit({ auth: githubToken });
  }
  return octokit;
}

export async function getAuthLogin(): Promise<string> { 
  const { data } = await getOctokit().users.getAuthenticated();
  if (!data.login) throw new Error("GitHub API: missing authenticated login");
  return data.login;
}

/**
 * Private repo with auto-initial README, reused across runs.
 */
export async function ensureSandboxRepo(owner: string): Promise<string> {
  const api = getOctokit();
  try {
    await api.repos.createForAuthenticatedUser({
      name: SANDBOX_REPO_NAME,
      private: true,
      auto_init: true,
      description: "Sandbox for npm run badge (GitHub profile achievements)",
    });
    console.log(`📦 Created sandbox repo ${owner}/${SANDBOX_REPO_NAME}`);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 422) {
      console.log(`📦 Using existing sandbox ${owner}/${SANDBOX_REPO_NAME}`);
    } else {
      throw err;
    }
  }
  return SANDBOX_REPO_NAME;
}

/**
 * Close an issue immediately (Quick Draw achievement path).
 */
export async function runQuickdraw(owner: string, repo: string): Promise<void> {
  const api = getOctokit();
  const { data: issue } = await api.issues.create({
    owner,
    repo,
    title: "quickdraw",
    body: "Closed immediately for GitHub Quick Draw.",
  });
  await api.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    state: "closed",
    state_reason: "completed",
  });
  console.log(`   ✅ Quick Draw: opened and closed issue #${issue.number}`);
}

async function getDefaultBranchSha(
  owner: string,
  repo: string
): Promise<{ defaultBranch: string; sha: string }> {
  const api = getOctokit();
  const { data: r } = await api.repos.get({ owner, repo });
  const def = r.default_branch ?? "main";
  const { data: ref } = await api.git.getRef({
    owner,
    repo,
    ref: `heads/${def}`,
  });
  return { defaultBranch: def, sha: ref.object.sha };
}

/**
 * Open a PR with a trivial file change and merge it (Pull Shark / YOLO paths).
 * Optional Co-authored-by trailer for Pair Extraordinaire (needs a second GitHub user to count).
 */
export async function createTrivialMergedPr(
  owner: string,
  repo: string,
  options: { coAuthoredByLine?: string }
): Promise<void> {
  const api = getOctokit();
  const { defaultBranch, sha: baseSha } = await getDefaultBranchSha(owner, repo);
  const branch = `badge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await api.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
  const path = `.badge/${branch}.md`;
  let message = "chore: badge automation";
  if (options.coAuthoredByLine) {
    message += `\n\nCo-authored-by: ${options.coAuthoredByLine}`;
  }
  await api.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(`# badge\n\n${branch}\n`, "utf8").toString("base64"),
    branch,
  });
  const { data: pr } = await api.pulls.create({
    owner,
    repo,
    title: `Badge automation: ${branch}`,
    head: branch,
    base: defaultBranch,
  });
  await api.pulls.merge({
    owner,
    repo,
    pull_number: pr.number,
    merge_method: "merge",
  });
  console.log(`   ✅ Merged PR #${pr.number} (${branch})`);
}
