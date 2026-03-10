import { join } from "node:path";
import { fetchPublicRepos } from "./github-api.js";
import { ensureDir, cloneRepo } from "./clone-repo.js";
import { parseCloneArgs } from "./parse-args.js";

/**
 * Clone all public repositories from a GitHub user to a local directory.
 * Run via: npm run clone
 */
export async function runClone(): Promise<void> {
  const { username, outDir, firstCommitAfter } = parseCloneArgs();
  const token = process.env.GITHUB_TOKEN;

  console.log(`Fetching public repos for: ${username}`);
  const repos = await fetchPublicRepos(username, token, firstCommitAfter);
  if (firstCommitAfter) {
    console.log(
      `Filter: repo created after ${firstCommitAfter.toISOString()}`
    );
  }
  console.log(`Found ${repos.length} public repos.\n`);

  if (repos.length === 0) {
    console.log("Nothing to clone.");
    return;
  }

  const absOut = join(process.cwd(), outDir);
  await ensureDir(absOut);
  console.log(`Cloning into: ${absOut}\n`);

  for (const repo of repos) {
    cloneRepo(repo, absOut);
  }

  console.log(`\nDone. Cloned ${repos.length} repos to ${absOut}`);
}
