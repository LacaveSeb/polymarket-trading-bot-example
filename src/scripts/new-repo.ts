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
 *   NEW_REPO_PRIVATE (true|false)
 */

import "dotenv/config";
import { ensureMirrorRepoExists } from "../features/mirror/github.js";

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  throw new Error(`Invalid ${name} value: "${value}". Use true or false.`);
}

async function runNewRepo(): Promise<void> {
  const rawName = process.env.NEW_REPO_NAME?.trim();
  const isPrivate = parseBooleanEnv("NEW_REPO_PRIVATE", true);

  if (!rawName) {
    throw new Error("Missing required env var: NEW_REPO_NAME");
  }

  const createdOrExistingName = await ensureMirrorRepoExists(rawName, isPrivate);

  if (!createdOrExistingName) {
    throw new Error("Failed to create or verify repository.");
  }

  console.log(`Done: ${createdOrExistingName}`);
}

runNewRepo().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
