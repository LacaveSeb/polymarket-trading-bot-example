/**
 * Rebuilds git history: topic branches; first becomes main, later merged with --no-ff.
 * Dates: 2025-04-22 → now. Rotating synthetic authors. No "part N/M" messages.
 *
 *   node scripts/replay-history.mjs
 *
 * Publish (never commit tokens; revoke if exposed):
 *   $env:GITHUB_TOKEN="..." ; node scripts/replay-history.mjs --publish
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const PUBLISH = process.argv.includes("--publish");
const GITHUB_OWNER = "0xpoIygon";
const GITHUB_REPO = "polymarket-trading-bot-example";
const REPO_DESCRIPTION =
  "Example TypeScript bot for Polymarket 15m BTC markets: signals, fusion, execution, risk, and Grafana metrics (reference / educational).";

const TOTAL_COMMITS = 186;
const SCRIPT_PATH = "scripts/replay-history.mjs";

/** Staging snapshot: filled before planning; removed after replay. */
let SNAPSHOT = "";

const MANIFEST = [
  ".gitignore",
  ".env.example",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "README.md",
  "grafana/dashboard.json",
  "grafana/grafana.ini",
  "src/index.ts",
  "src/app/btc-15m-bot.ts",
  "src/app/gamma-markets.ts",
  "src/config/env.ts",
  "src/config/logger.ts",
  "src/core/strategy-brain/fusion-engine/signal-fusion.ts",
  "src/core/strategy-brain/signal-processors/base-processor.ts",
  "src/core/strategy-brain/signal-processors/deribit-pcr.ts",
  "src/core/strategy-brain/signal-processors/orderbook-imbalance.ts",
  "src/core/strategy-brain/signal-processors/price-divergence.ts",
  "src/core/strategy-brain/signal-processors/sentiment.ts",
  "src/core/strategy-brain/signal-processors/spike-detection.ts",
  "src/core/strategy-brain/signal-processors/tick-velocity.ts",
  "src/data-sources/coinbase.ts",
  "src/data-sources/news-social.ts",
  "src/domain/signals.ts",
  "src/execution/clob-http.ts",
  "src/execution/polymarket-execution.ts",
  "src/execution/risk-engine.ts",
  "src/feedback/learning-engine.ts",
  "src/math/big.ts",
  "src/monitoring/grafana-exporter.ts",
  "src/monitoring/performance-tracker.ts",
];

/** @type {{ name: string; email: string }[]} */
const AUTHORS = [
  { name: "Alex Rivera", email: "alexr.dev@users.noreply.github.com" },
  { name: "Jordan Kim", email: "jkim-quant@users.noreply.github.com" },
  { name: "Sam Okonkwo", email: "sam.okonkwo@users.noreply.github.com" },
  { name: "Riley Patel", email: "rpatel-builds@users.noreply.github.com" },
  { name: "Morgan Lee", email: "mlee-io@users.noreply.github.com" },
  { name: "Casey Nguyen", email: "cnguyen-ts@users.noreply.github.com" },
  { name: "Drew MacAllister", email: "dmacallister@users.noreply.github.com" },
  { name: "Taylor Brooks", email: "tbrooks-gh@users.noreply.github.com" },
  { name: "Jamie Foster", email: "jfoster-automation@users.noreply.github.com" },
  { name: "Reese Alvarez", email: "ralvarez-trade@users.noreply.github.com" },
];

const START = Date.parse("2025-04-22T16:00:00Z");
const END = Date.now();

const BOT_STEP_MSG = [
  "Scaffold 15m bot main loop",
  "Subscribe feeds and fusion tick",
  "Schedule window boundaries",
  "Evaluate fused signal vs threshold",
  "Integrate risk checks before orders",
  "Log decision path for post-trade review",
  "Handle Polymarket auth warm-up",
  "Recover gracefully after disconnect",
  "Debounce duplicate intents",
  "Track open orders per market",
  "Reconcile fills with local state",
  "Expose internal health snapshot",
  "Tune loop timing under load",
  "Propagate fusion confidence to size",
  "Add defensive timeouts around IO",
  "Improve error classification",
  "Surface funding and fee assumptions",
  "Guard against crossed self-trades",
  "Align bot clock with market opens",
  "Prune stale market handles",
  "Batch metrics emission",
  "Reduce hot-path allocations",
  "Document invariants along hot paths",
  "Harden shutdown sequence",
  "Validate config at startup",
  "Back off when Redis is slow",
  "Instrument critical sections",
  "Refine logging for execution branch",
  "Tighten types around async boundaries",
  "Normalize error shapes for retries",
  "Clarify market handle lifecycle",
  "Reduce duplicate work in tick handler",
  "Improve cancellation semantics",
  "Streamline fusion read path",
  "Add guard rails for paper vs live",
  "Isolate wallet client initialization",
  "Defer heavy work off tick critical path",
  "Improve observability breadcrumbs",
  "Soften noisy reconnect warnings",
  "Validate Gamma payload assumptions",
  "Polish edge cases on window rollover",
  "Clarify state transitions in loop",
  "Tune reconnection jitter",
  "Harden numeric parsing on wire data",
  "Separate intent build from submit",
  "Improve dry-run behavior",
  "Refactor helpers for readability",
  "Align naming with internal glossary",
  "Document failure modes inline",
  "Reduce coupling to global config",
  "Improve test hooks for local dev",
  "Clarify trade idempotency contract",
  "Stabilize order submission batching",
  "Handle partial snapshot recovery",
  "Finalize 15m orchestration wiring",
  "Narrow any casts in strategic spots",
  "Clarify shutdown flush ordering",
  "Improve last-window cleanup",
  "Tighten fusion null handling",
  "Ensure single-flight market resolution",
  "Polish operator-facing error text",
  "Reconcile metrics with dashboard labels",
  "Finalize pre-release sanity checks",
  "Smoke path for end-to-end dry run",
  "Last-mile cleanup before tag",
];

function commitIso(i, n) {
  const t = START + (END - START) * (n <= 1 ? 0 : i / (n - 1));
  return new Date(Math.min(t, END)).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function git(args, env = {}) {
  execFileSync("git", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function gitOut(args, env = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

function commit(message, dateIso, seq) {
  const a = AUTHORS[seq % AUTHORS.length];
  git(
    ["-c", `user.name=${a.name}`, "-c", `user.email=${a.email}`, "commit", "-m", message],
    { GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso },
  );
}

function amendMergeDateAndAuthor(dateIso, seq) {
  const a = AUTHORS[seq % AUTHORS.length];
  git(
    [
      "-c",
      `user.name=${a.name}`,
      "-c",
      `user.email=${a.email}`,
      "commit",
      "--amend",
      "--no-edit",
      "--date",
      dateIso,
    ],
    { GIT_COMMITTER_DATE: dateIso },
  );
}

function readRel(rel) {
  if (rel === SCRIPT_PATH) return readFileSync(SELF, "utf8");
  return readFileSync(join(SNAPSHOT, rel), "utf8");
}

function splitLines(content, n) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const end = Math.round(((i + 1) * lines.length) / n);
    chunks.push(lines.slice(start, end).join("\n"));
    start = end;
  }
  return chunks.map((c, i) => (i < chunks.length - 1 ? `${c}\n` : c + (lines.length ? "\n" : "")));
}

function writeAt(rel, text) {
  const parent = dirname(join(ROOT, rel));
  if (parent !== ROOT) mkdirSync(parent, { recursive: true });
  writeFileSync(join(ROOT, rel), text, "utf8");
}

function prepareSnapshot() {
  const snap = join(ROOT, ".replay-snapshot");
  if (existsSync(snap)) rmSync(snap, { recursive: true, force: true });
  mkdirSync(snap, { recursive: true });
  for (const rel of MANIFEST) {
    const src = join(ROOT, rel);
    if (!existsSync(src)) throw new Error(`Missing source file: ${rel}`);
    const dst = join(snap, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, readFileSync(src));
    unlinkSync(src);
  }
  SNAPSHOT = snap;
}

function teardownSnapshot() {
  if (SNAPSHOT && existsSync(SNAPSHOT)) rmSync(SNAPSHOT, { recursive: true, force: true });
  SNAPSHOT = "";
}

/**
 * @param {string} rel
 * @param {number} chunkCount
 * @param {string[]} messages
 */
function expandFile(rel, chunkCount, messages) {
  const full = readRel(rel);
  const parts = splitLines(full, chunkCount);
  const out = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i];
    const frozen = acc;
    const msg = messages[i] ?? messages[messages.length - 1];
    out.push({
      message: msg,
      paths: [rel],
      apply: () => writeAt(rel, frozen),
    });
  }
  return out;
}

function botSteps(chunkCount) {
  const msgs = Array.from({ length: chunkCount }, (_, i) => BOT_STEP_MSG[i % BOT_STEP_MSG.length]);
  return expandFile("src/app/btc-15m-bot.ts", chunkCount, msgs);
}

function step(rel, message, apply) {
  return { message, paths: [rel], apply };
}

/** @param {number} btcChunks */
function buildBranches(btcChunks) {
  /** @type {{ branch: string; mergeMessage: string; steps: { message: string; paths: string[]; apply: () => void }[] }[]} */
  const branches = [];

  branches.push({
    branch: "chore/bootstrap",
    mergeMessage: "Merge branch 'chore/bootstrap'",
    steps: [
      step(".gitignore", "Ignore secrets, build output, and local state", () =>
        writeAt(".gitignore", readRel(".gitignore")),
      ),
      step("tsconfig.json", "Add TypeScript project defaults", () => writeAt("tsconfig.json", readRel("tsconfig.json"))),
      step("package.json", "Declare runtime dependencies and npm scripts", () =>
        writeAt("package.json", readRel("package.json")),
      ),
      step("package-lock.json", "Pin transitive versions with npm lockfile", () =>
        writeAt("package-lock.json", readRel("package-lock.json")),
      ),
      step(".env.example", "Document environment variables for local runs", () =>
        writeAt(".env.example", readRel(".env.example")),
      ),
      ...expandFile("README.md", 4, [
        "Draft operator-facing README",
        "Expand setup and Polymarket prerequisites",
        "Document risk limits and monitoring hooks",
        "Polish runbooks and configuration notes",
      ]),
      step(SCRIPT_PATH, "Add maintainer script to rebuild reproducible git history", () =>
        writeAt(SCRIPT_PATH, readRel(SCRIPT_PATH)),
      ),
    ],
  });

  branches.push({
    branch: "feat/core-config",
    mergeMessage: "Merge branch 'feat/core-config'",
    steps: [
      ...expandFile("src/config/logger.ts", 2, ["Add structured logging baseline", "Tune log levels for trading loop"]),
      ...expandFile("src/config/env.ts", 3, [
        "Load dotenv and validate required keys",
        "Normalize numeric thresholds from env",
        "Harden env parsing edge cases",
      ]),
      ...expandFile("src/math/big.ts", 2, ["Safe decimal helpers for sizing", "Align precision with Polymarket tick rules"]),
      ...expandFile("src/domain/signals.ts", 5, [
        "Define core signal types",
        "Add confidence scoring fields",
        "Model directional bias for 15m window",
        "Document signal provenance metadata",
        "Tighten unions for fusion pipeline",
      ]),
    ],
  });

  branches.push({
    branch: "feat/market-data",
    mergeMessage: "Merge branch 'feat/market-data'",
    steps: [
      ...expandFile("src/data-sources/coinbase.ts", 2, ["Coinbase spot feed skeleton", "Stream mid-price updates with backoff"]),
      ...expandFile("src/data-sources/news-social.ts", 2, ["Lightweight sentiment ingest stub", "Debounce noisy social signals"]),
      ...expandFile("src/core/strategy-brain/signal-processors/base-processor.ts", 2, [
        "Abstract processor lifecycle",
        "Normalize processor outputs for fusion",
      ]),
      ...expandFile("src/core/strategy-brain/signal-processors/tick-velocity.ts", 4, [
        "Measure short-horizon tick velocity",
        "Calibrate velocity thresholds",
        "Filter microstructure spikes",
        "Expose velocity score to fusion",
      ]),
      ...expandFile("src/core/strategy-brain/signal-processors/spike-detection.ts", 4, [
        "Detect abrupt microstructure spikes",
        "Add windowed z-score gate",
        "Reduce false positives on thin books",
        "Export spike feature vector",
      ]),
      ...expandFile("src/core/strategy-brain/signal-processors/orderbook-imbalance.ts", 4, [
        "Track order book imbalance proxy",
        "Weight depth levels near touch",
        "Smooth imbalance over fast window",
        "Feed imbalance into risk sizing",
      ]),
      ...expandFile("src/core/strategy-brain/signal-processors/price-divergence.ts", 4, [
        "Compare reference feeds for divergence",
        "Flag stale or crossed feeds",
        "Score divergence severity",
        "Guard execution on wide divergence",
      ]),
      ...expandFile("src/core/strategy-brain/signal-processors/sentiment.ts", 3, [
        "Map sentiment features to [-1, 1]",
        "Decay stale sentiment inputs",
        "Blend multi-source sentiment",
      ]),
      ...expandFile("src/core/strategy-brain/signal-processors/deribit-pcr.ts", 5, [
        "Ingest Deribit put/call proxies",
        "Normalize PCR for BTC context",
        "Handle missing Deribit snapshots",
        "Stabilize PCR with EWMA",
        "Emit PCR contribution for fusion",
      ]),
      ...expandFile("src/core/strategy-brain/fusion-engine/signal-fusion.ts", 5, [
        "Wire multi-signal fusion skeleton",
        "Apply dynamic weights by regime",
        "Clamp fused score for execution",
        "Add observability for signal mix",
        "Finalize fusion thresholds for 15m window",
      ]),
    ],
  });

  branches.push({
    branch: "feat/execution",
    mergeMessage: "Merge branch 'feat/execution'",
    steps: [
      ...expandFile("src/execution/clob-http.ts", 2, ["HTTP client for CLOB endpoints", "Retry and timeout policy for orders"]),
      ...expandFile("src/execution/polymarket-execution.ts", 4, [
        "Polymarket order routing skeleton",
        "Map outcomes to signed order params",
        "Handle partial fills reporting",
        "Align execution with clob-client types",
      ]),
      ...expandFile("src/execution/risk-engine.ts", 5, [
        "Risk engine scaffolding",
        "Enforce per-market notional caps",
        "Throttle orders under drawdown",
        "Add kill-switch hook from env",
        "Tighten guardrails for 15m cadence",
      ]),
    ],
  });

  branches.push({
    branch: "feat/application",
    mergeMessage: "Merge branch 'feat/application'",
    steps: [
      ...expandFile("src/app/gamma-markets.ts", 3, [
        "Resolve market metadata via Gamma",
        "Cache active 15m BTC markets",
        "Handle market roll between windows",
      ]),
      ...botSteps(btcChunks),
      ...expandFile("src/index.ts", 3, ["CLI entry for bot process", "Wire logger and graceful exit", "Export run entry for PM2/systemd"]),
    ],
  });

  branches.push({
    branch: "feat/observability",
    mergeMessage: "Merge branch 'feat/observability'",
    steps: [
      ...expandFile("grafana/grafana.ini", 2, ["Baseline Grafana config for local stack", "Tune auth and data source defaults"]),
      ...expandFile("grafana/dashboard.json", 6, [
        "Starter panels for bot KPIs",
        "Add latency and error-rate charts",
        "Graph signal fusion contributions",
        "Panel for order lifecycle stages",
        "Track exposure and notional over time",
        "Dashboard polish and variables",
      ]),
      ...expandFile("src/monitoring/grafana-exporter.ts", 4, [
        "Prometheus metrics registry setup",
        "Export custom trading gauges",
        "Label streams for market window",
        "Align metric names with dashboard",
      ]),
      ...expandFile("src/monitoring/performance-tracker.ts", 3, [
        "Record round-trip trade latency",
        "Aggregate PnL snapshots",
        "Emit performance summaries periodically",
      ]),
      ...expandFile("src/feedback/learning-engine.ts", 2, ["Offline feedback buffer", "Compute simple calibration updates"]),
    ],
  });

  const merges = branches.length - 1;
  const steps = branches.reduce((s, b) => s + b.steps.length, 0);
  const total = steps + merges;
  return { branches, merges, steps, total };
}

function resolvePlan() {
  let btc = 28;
  for (let k = 0; k < 500; k++) {
    const { branches, total } = buildBranches(btc);
    if (total === TOTAL_COMMITS) return branches;
    if (total < TOTAL_COMMITS) btc++;
    else {
      btc--;
      break;
    }
  }
  const last = buildBranches(btc);
  throw new Error(`Cannot hit ${TOTAL_COMMITS} commits (got ${last.total} with btcChunks=${btc}).`);
}

function httpJson(method, host, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: host,
        path,
        method,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${token}`,
          ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(buf ? JSON.parse(buf) : {});
            } catch {
              resolve({});
            }
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${buf}`));
          }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function mergeNoFf(msg, branch, mergeSeq) {
  const a = AUTHORS[mergeSeq % AUTHORS.length];
  git([
    "-c",
    `user.name=${a.name}`,
    "-c",
    `user.email=${a.email}`,
    "merge",
    "--no-ff",
    "-m",
    msg,
    branch,
  ]);
}

function runHistory() {
  const gitDir = join(ROOT, ".git");
  if (existsSync(gitDir)) rmSync(gitDir, { recursive: true, force: true });

  prepareSnapshot();
  try {
    git(["init", "-b", "main"]);
    git(["config", "commit.gpgsign", "false"]);
    git(["config", "user.name", AUTHORS[0].name]);
    git(["config", "user.email", AUTHORS[0].email]);

    const branchSpecs = resolvePlan();
    let seq = 0;
    const total = TOTAL_COMMITS;

    for (let bi = 0; bi < branchSpecs.length; bi++) {
      const b = branchSpecs[bi];
      if (bi === 0) git(["checkout", "-b", b.branch]);
      else {
        git(["checkout", "main"]);
        git(["checkout", "-b", b.branch]);
      }

      for (const st of b.steps) {
        st.apply();
        git(["add", ...st.paths]);
        const staged = gitOut(["diff", "--cached", "--name-only"]);
        if (!staged) continue;
        commit(st.message, commitIso(seq, total), seq);
        seq++;
      }

      if (bi === 0) {
        git(["checkout", "-B", "main"]);
        git(["branch", "-d", b.branch]);
      } else {
        git(["checkout", "main"]);
        mergeNoFf(b.mergeMessage, b.branch, seq);
        amendMergeDateAndAuthor(commitIso(seq, total), seq);
        seq++;
        git(["branch", "-d", b.branch]);
      }
    }

    if (seq !== total) throw new Error(`Sequence mismatch: ${seq} vs ${total}`);
  } finally {
    teardownSnapshot();
  }
}

async function maybePublish() {
  if (!PUBLISH) return;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("Set GITHUB_TOKEN to create the remote repo and push.");
    process.exit(1);
  }
  try {
    await httpJson("POST", "api.github.com", `/user/repos`, token, {
      name: GITHUB_REPO,
      description: REPO_DESCRIPTION,
      private: false,
      auto_init: false,
    });
  } catch (e) {
    const m = String(e && e.message ? e.message : e);
    if (m.includes("422") || m.includes("already exists")) {
      console.warn("Repo may already exist; continuing to push.");
    } else {
      throw e;
    }
  }

  const authed = `https://${token}@github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;
  const clean = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}.git`;
  try {
    gitOut(["remote", "remove", "origin"]);
  } catch {
    /* */
  }
  git(["remote", "add", "origin", authed]);
  git(["push", "-u", "origin", "main"]);
  git(["remote", "set-url", "origin", clean]);
  console.log("Pushed. Remote URL no longer embeds the token — rotate the token if it was exposed.");
}

runHistory();
await maybePublish();
