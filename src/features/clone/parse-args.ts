import { requireEnv } from "../../config/index.js";
import type { CloneOptions } from "./types.js";

export function parseCloneArgs(): CloneOptions {
  const username =
    process.argv[2]?.trim() ?? requireEnv("GITHUB_CLONE_USERNAME").trim();
  const outDir = process.argv[3] ?? requireEnv("GITHUB_CLONE_DIR");
  const firstCommitDate = requireEnv("FIRST_COMMIT_DATE");
  const firstCommitAfter = new Date(firstCommitDate);

  if (isNaN(firstCommitAfter.getTime())) {
    console.error(
      "Invalid FIRST_COMMIT_DATE (use ISO date e.g. 2024-01-01):",
      firstCommitDate
    );
    process.exit(1);
  }

  if (!username) {
    console.error(
      "Usage: npx tsx src/scripts/clone-all-repos.ts <github-username> [output-dir]"
    );
    console.error(
      "   or set required env: GITHUB_CLONE_USERNAME, GITHUB_CLONE_DIR, FIRST_COMMIT_DATE"
    );
    process.exit(1);
  }

  return { username, outDir, firstCommitAfter };
}
