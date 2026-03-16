#!/usr/bin/env node
/**
 * Convert private GitHub repos to public when their last update is after LAST_UPDATE_DATE.
 *
 * Usage:
 *   npm run release
 *
 * Requires .env:
 *   GITHUB_RELEASE_TOKEN   - token with repo scope (and admin on repos to change)
 *   GITHUB_RELEASE_USERNAME - GitHub user or org whose private repos to consider
 *   LAST_UPDATE_DATE       - ISO date (e.g. 2026-03-10); only repos updated after this are changed
 */

import "dotenv/config";
import { runRelease } from "../features/release/index.js";

runRelease().catch((err) => {
  console.error(err);
  process.exit(1);
});
