import path from "node:path";
import { requireEnv, requireEnvInt, requireEnvBool } from "../../config/index.js";

export type ReplaceConfig = {
  baseDir: string;
  githubUsername: string;
  githubUserEmail: string;
  githubToken: string;
  addCommitDelaySinceLastCommitDays: number;
  autoRemove: boolean;
};

function loadReplaceConfig(): ReplaceConfig {
  const baseDir = path.join(process.cwd(), requireEnv("GITHUB_REPLACE_DIR"));
  return {
    baseDir,
    githubUsername: requireEnv("GITHUB_REPLACE_USERNAME"),
    githubUserEmail: requireEnv("GITHUB_REPLACE_USEREMAIL"),
    githubToken: requireEnv("GITHUB_REPLACE_TOKEN"),
    addCommitDelaySinceLastCommitDays: requireEnvInt(
      "ADD_COMMIT_DELAY_SINCE_LAST_COMMIT_DAYS"
    ),
    autoRemove: requireEnvBool("AUTO_REMOVE"),
  };
}

let cached: ReplaceConfig | null = null;

export function getReplaceConfig(): ReplaceConfig {
  if (!cached) {
    try {
      cached = loadReplaceConfig();
    } catch (err) {
      console.error("❌", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  return cached;
}
