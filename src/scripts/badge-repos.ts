#!/usr/bin/env node
/**
 * GitHub profile achievement–oriented API flows (sandbox repo).
 *
 * Usage: npm run badge
 *
 * Requires: GITHUB_BADGE_TOKEN and BADGE_* vars from .env.
 */

import "dotenv/config";
import { runBadge } from "../features/badge/index.js";

process.on("SIGINT", () => {
  console.log("\n\n⚠️  Process interrupted by user");
  process.exit(0);
});

runBadge().catch(console.error);
