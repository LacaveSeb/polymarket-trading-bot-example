import { Octokit } from "@octokit/rest";
import { getReleaseConfig } from "./config.js";

let octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (!octokit) {
    const { githubToken } = getReleaseConfig();
    octokit = new Octokit({ auth: githubToken });
  }
  return octokit;
}

export type RepoInfo = {
  owner: string;
  name: string;
  private: boolean;
  updated_at: string;
};

/**
 * List private repos for the authenticated user whose updated_at is after the given date.
 */
export async function listPrivateReposUpdatedAfter(
  since: Date
): Promise<RepoInfo[]> {
  const threshold = since.getTime();
  const repos: RepoInfo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data } = await getOctokit().repos.listForAuthenticatedUser({
      visibility: "private",
      sort: "updated",
      per_page: perPage,
      page,
    });

    for (const r of data) {
      if (!r.private) continue;
      const updatedAt = new Date(r.updated_at!).getTime();
      if (updatedAt > threshold) {
        repos.push({
          owner: r.owner!.login!,
          name: r.name!,
          private: r.private ?? true,
          updated_at: r.updated_at!,
        });
      }
    }

    if (data.length < perPage) break;
    page++;
  }

  return repos;
}

/**
 * Set a repository's visibility to public.
 */
export async function setRepoPublic(owner: string, repo: string): Promise<void> {
  await getOctokit().repos.update({
    owner,
    repo,
    visibility: "public",
  });
}
