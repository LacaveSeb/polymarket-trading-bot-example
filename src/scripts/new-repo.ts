#!/usr/bin/env node
/**
 * Create a single GitHub repo (or verify it already exists).
 *
 * Usage:
 *   npm run new
 *
 * Requires .env:
 *   GITHUB_MIRROR_TOKEN
 *   GITHUB_MIRROR_USERNAME
 *   NEW_REPO_NAME
 */

import "dotenv/config";
import { ensureMirrorRepoExists } from "../features/mirror/github.js";

async function runNewRepo(): Promise<void> {
  const rawName = process.env.NEW_REPO_NAME?.trim();

  if (!rawName) {
    throw new Error("Missing required env var: NEW_REPO_NAME");
  }

  const createdOrExistingName = await ensureMirrorRepoExists(rawName);

  if (!createdOrExistingName) {
    throw new Error("Failed to create or verify repository.");
  }

  console.log(`Done: ${createdOrExistingName}`);
}

runNewRepo().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
