import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env") });

function optional(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export const env = {
  polymarketPk: optional("POLYMARKET_PK"),
  polymarketApiKey: optional("POLYMARKET_API_KEY"),
  polymarketApiSecret: optional("POLYMARKET_API_SECRET"),
  polymarketPassphrase: optional("POLYMARKET_PASSPHRASE"),
  polymarketFunder: optional("POLYMARKET_FUNDER"),
  chainId: Number(optional("POLYMARKET_CHAIN_ID", "137")) || 137,
  redisHost: optional("REDIS_HOST", "localhost")!,
  redisPort: Number(optional("REDIS_PORT", "6379")) || 6379,
  redisDb: Number(optional("REDIS_DB", "2")) || 2,
  marketBuyUsd: Number(optional("MARKET_BUY_USD", "1")) || 1,
  logLevel: optional("LOG_LEVEL", "info")!,
  grafanaPort: Number(optional("GRAFANA_METRICS_PORT", "8000")) || 8000,
};

export function assertLiveCredentials(): void {
  required("POLYMARKET_PK");
}




