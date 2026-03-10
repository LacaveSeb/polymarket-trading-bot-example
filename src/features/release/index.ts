import { getReleaseConfig } from "./config.js";
import {
  listPrivateReposUpdatedAfter,
  setRepoPublic,
} from "./github-api.js";

export async function runRelease(): Promise<void> {
  const { lastUpdateDate } = getReleaseConfig();

  console.log(
    `🔍 Listing private repos updated after ${lastUpdateDate.toISOString().slice(0, 10)}...`
  );

  const repos = await listPrivateReposUpdatedAfter(lastUpdateDate);

  if (repos.length === 0) {
    console.log("No private repos found with last update after that date.");
    return;
  }

  console.log(`📦 Found ${repos.length} private repo(s) to make public:\n`);
  for (const r of repos) {
    console.log(`   ${r.owner}/${r.name} (updated ${r.updated_at.slice(0, 10)})`);
  }
  console.log("");

  for (const r of repos) {
    try {
      await setRepoPublic(r.owner, r.name);
      console.log(`✅ ${r.owner}/${r.name} → public`);
    } catch (err) {
      console.error(
        `❌ ${r.owner}/${r.name}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
