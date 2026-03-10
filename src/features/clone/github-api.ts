import type { Repo } from "./types.js";

const GITHUB_API = "https://api.github.com";
const PER_PAGE = 100;

export async function fetchPublicRepos(
  username: string,
  token: string | undefined,
  firstCommitAfter: Date | null
): Promise<Repo[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "github-clone-all-script",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const repos: Repo[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${GITHUB_API}/users/${encodeURIComponent(username)}/repos?type=public&per_page=${PER_PAGE}&page=${page}`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as Repo[];
    repos.push(...data.filter((r) => !r.private));

    if (data.length < PER_PAGE) hasMore = false;
    else page++;
  }

  if (firstCommitAfter) {
    const threshold = firstCommitAfter.getTime();
    return repos.filter((r) => new Date(r.created_at).getTime() > threshold);
  }
  return repos;
}
