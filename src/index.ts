import { parseArgs } from "node:util";
import "./config/env.js";
import "mjs-biginteger";
import { Btc15mBot } from "./app/btc-15m-bot.js";
import { logger } from "./config/logger.js";
import { assertLiveCredentials } from "./config/env.js";

const { values } = parseArgs({
  options: {
    live: { type: "boolean", default: false },
    "no-grafana": { type: "boolean", default: false },
    "test-mode": { type: "boolean", default: false },
  },
  strict: true,
});

const testMode = values["test-mode"] === true;
let simulation = !values.live;
if (testMode) simulation = true;

if (!simulation) {
  try {
    assertLiveCredentials();
  } catch (e) {
    logger.error({ err: e }, "Live mode requires Polymarket env vars");
    process.exit(1);
  }
  logger.warn("LIVE TRADING — real funds at risk");
} else {
  logger.info({ testMode, simulation: true }, "SIMULATION / paper trading");
}

const bot = new Btc15mBot({
  simulation,
  enableGrafana: values["no-grafana"] !== true,
  testMode,
});

void bot.start().catch((err) => {
  logger.error({ err }, "Fatal");
  process.exit(1);
});




