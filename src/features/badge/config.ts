import { requireEnv, requireEnvInt, requireEnvBool } from "../../config/index.js";

export type BadgeConfig = {
  githubToken: string;
  badgeQuickdraw: boolean;
  badgePairExtraordinaire: number;
  badgePullShark: number;
  badgeYolo: boolean;
};

function loadBadgeConfig(): BadgeConfig {
  const githubToken = requireEnv("GITHUB_BADGE_TOKEN");
  return {
    githubToken,
    badgeQuickdraw: requireEnvBool("BADGE_QUICKDRAW"),
    badgePairExtraordinaire: requireEnvInt("BADGE_PAIR_EXTRAORDINAIRE"),
    badgePullShark: requireEnvInt("BADGE_PULL_SHARK"),
    badgeYolo: requireEnvBool("BADGE_YOLO"),
  };
}

let cached: BadgeConfig | null = null;

export function getBadgeConfig(): BadgeConfig {
  if (!cached) {
    try {
      cached = loadBadgeConfig();
    } catch (err) {
      console.error("❌", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
  return cached;
}
