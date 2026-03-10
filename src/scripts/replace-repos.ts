#!/usr/bin/env node
/**
 * Rewrite git history for repos in BASE_DIR and push to new GitHub repos.
 *
 * Usage: npm run replace
 *
 * Requires: GITHUB_TOKEN, GITHUB_USERNAME, GITHUB_USEREMAIL
 * Optional: BASE_DIR, ADD_COMMIT_DELAY_SINCE_LAST_COMMIT_DAYS, SKIP_CONFIRMATION, AUTO_REMOVE
 */

import "dotenv/config";
import { runReplace } from "../features/replace/index.js";

process.on("SIGINT", () => {
  console.log("\n\n⚠️  Process interrupted by user");
  process.exit(0);
});

runReplace().catch(console.error);
