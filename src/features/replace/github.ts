import { Octokit } from "@octokit/rest";
import { getReplaceConfig } from "./config.js";

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    const { githubToken } = getReplaceConfig();
    octokit = new Octokit({ auth: githubToken });
  }
  return octokit;
}

export function getRemoteUrl(repoName: string): string {
  const { githubUsername, githubToken } = getReplaceConfig();
  return `https://${githubToken}@github.com/${githubUsername}/${repoName}.git`;
}

export async function createGithubRepo(
  originalName: string
): Promise<string | null> {
  const repoName = originalName
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  console.log(`📦 Creating GitHub repo: ${repoName}`);

  try {
    await getOctokit().repos.createForAuthenticatedUser({
      name: repoName,
      private: true,
    });
    console.log("✅ Repo created");
    return repoName;
  } catch (err) {
    console.error(
      "❌ GitHub API error:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
