import { Octokit } from "@octokit/rest";

let octokit: Octokit | null = null;

function getEnv(name: string, required = true): string | undefined {
  const value = process.env[name];
  if (!value && required) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getOctokit(): Octokit {
  if (!octokit) {
    const token = getEnv("GITHUB_MIRROR_TOKEN")!;
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

export async function ensureMirrorRepoExists(
  originalName: string
): Promise<string | null> {
  const username = getEnv("GITHUB_MIRROR_USERNAME")!;

  // Normalize repo name a bit (similar to replace flow)
  const repoName = originalName
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  console.log(`📦 Ensuring GitHub repo exists: ${username}/${repoName}`);

  const client = getOctokit();

  try {
    // Check if repo already exists
    await client.repos.get({
      owner: username,
      repo: repoName,
    });
    console.log("✅ Repo already exists");
    return repoName;
  } catch (err: any) {
    if (err?.status !== 404) {
      console.error(
        "❌ GitHub API error while checking repo:",
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  // Create if not found
  try {
    await client.repos.createForAuthenticatedUser({
      name: repoName,
      private: true,
    });
    console.log("✅ Repo created");
    return repoName;
  } catch (err) {
    console.error(
      "❌ GitHub API error while creating repo:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

