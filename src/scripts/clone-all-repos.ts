#!/usr/bin/env node
/**
 * Clone all public repositories from a GitHub user account to a local directory.
 *
 * Usage:
 *   npm run clone
 *   Or: npx tsx src/scripts/clone-all-repos.ts <username> [outputDir]
 *
 * Optional: set GITHUB_TOKEN for higher API rate limits.
 * Optional: set FIRST_COMMIT_DATE (ISO) to only clone repos created after that date.
 */

import "dotenv/config";
import { runClone } from "../features/clone/index.js";

runClone().catch((err) => {
  console.error(err);
  process.exit(1);
});
