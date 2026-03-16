import { requireEnv } from "../../config/index.js";

export type ReleaseConfig = {
  githubToken: string;
  /** GitHub username or org whose private repos to consider for release */
  githubUsername: string;
  lastUpdateDate: Date;
};

function parseLastUpdateDate(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("LAST_UPDATE_DATE is empty");
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid LAST_UPDATE_DATE: "${value}"`);
  }
  return date;
}

function loadReleaseConfig(): ReleaseConfig {
  return {
    githubToken: requireEnv("GITHUB_RELEASE_TOKEN"),
    githubUsername: requireEnv("GITHUB_RELEASE_USERNAME").trim(),
    lastUpdateDate: parseLastUpdateDate(requireEnv("LAST_UPDATE_DATE")),
  };
}

let cached: ReleaseConfig | null = null;

export function getReleaseConfig(): ReleaseConfig {
  if (!cached) {
    try {
      cached = loadReleaseConfig();
    } catch (err) {
      console.error("❌", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  return cached;
}
