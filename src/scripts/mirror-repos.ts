#!/usr/bin/env node
/**
 * Update remotes and force-push for all git repos under GITHUB_MIRROR_DIR.
 *
 * Usage:
 *   npm run mirror
 *
 * Requires .env:
 *   GITHUB_MIRROR_DIR     - base directory containing cloned repos (default: ./repos)
 *   GITHUB_MIRROR_TOKEN   - GitHub personal access token with repo access
 *   GITHUB_MIRROR_USERNAME- GitHub username/organization to push to
 */

import "dotenv/config";
import { runMirror } from "../features/mirror/index.js";

runMirror().catch((err) => {
  console.error(err);
  process.exit(1);
});

