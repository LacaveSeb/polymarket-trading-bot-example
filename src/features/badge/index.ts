import { getBadgeConfig } from "./config.js";
import {
  ensureSandboxRepo,
  getAuthLogin,
  runQuickdraw,
  createTrivialMergedPr,
} from "./github-api.js";

/**
 * Drive GitHub API flows that align with profile achievement patterns (Quick Draw, merged PRs, etc.).
 * Run via: npm run badge
 *
 * Pair Extraordinaire requires co-authored commits with another GitHub user; a placeholder trailer is used
 * unless you change github-api to supply a real co-author line.
 */
export async function runBadge(): Promise<void> {
  const {
    githubToken,
    badgeQuickdraw,
    badgePairExtraordinaire,
    badgePullShark,
    badgeYolo,
  } = getBadgeConfig();

  console.log("🚀 GitHub badge helper");
  console.log("======================");
  console.log(`BADGE_QUICKDRAW: ${badgeQuickdraw}`);
  console.log(`BADGE_PULL_SHARK: ${badgePullShark}`);
  console.log(`BADGE_PAIR_EXTRAORDINAIRE: ${badgePairExtraordinaire}`);
  console.log(`BADGE_YOLO: ${badgeYolo}`);
  console.log("======================\n");

  const owner = await getAuthLogin();
  const repo = await ensureSandboxRepo(owner);

  if (badgeQuickdraw) {
    console.log("🎯 Quick Draw (issue closed within 5 minutes)…");
    await runQuickdraw(owner, repo);
  }

  let mergedPrCount = 0;

  if (badgePullShark > 0) {
    console.log(`\n🦈 Pull Shark: merging ${badgePullShark} trivial PR(s)…`);
    for (let i = 0; i < badgePullShark; i++) {
      await createTrivialMergedPr(owner, repo, {});
      mergedPrCount++;
    }
  }

  if (badgePairExtraordinaire > 0) {
    console.log(
      `\n🤝 Pair Extraordinaire: merging ${badgePairExtraordinaire} PR(s) with Co-authored-by trailer…`
    );
    console.log(
      "   (GitHub only counts a second person if the trailer matches another real GitHub user.)"
    );
    const coAuthor =
      "Octocat <octocat@noreply.github.com>";
    for (let i = 0; i < badgePairExtraordinaire; i++) {
      await createTrivialMergedPr(owner, repo, { coAuthoredByLine: coAuthor });
      mergedPrCount++;
    }
  }

  if (badgeYolo && mergedPrCount === 0) {
    console.log(
      "\n⚡ YOLO: merging one PR without waiting on reviewers (personal sandbox)…"
    );
    await createTrivialMergedPr(owner, repo, {});
  } else if (badgeYolo && mergedPrCount > 0) {
    console.log(
      "\n⚡ YOLO: already satisfied by merged PR(s) above (no extra merge)."
    );
  }

  console.log("\n🏁 Done.");
}
