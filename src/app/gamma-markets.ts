import { logger } from "../config/logger.js";

const GAMMA = "https://gamma-api.polymarket.com";

export interface Btc15mMarket {
  slug: string;
  marketTimestamp: number;
  endTimestamp: number;
  yesTokenId: string;
  noTokenId: string;
}

function parseClobTokenIds(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) return arr.map(String);
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchMarketBySlug(slug: string): Promise<Btc15mMarket | null> {
  try {
    const url = new URL(`${GAMMA}/markets`);
    url.searchParams.set("slug", slug);
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const rows = (await resp.json()) as Array<Record<string, unknown>>;
    const m = rows[0];
    if (!m) return null;
    const ids = parseClobTokenIds(m.clobTokenIds);
    if (!ids || ids.length < 2) {
      logger.debug({ slug }, "Market missing clobTokenIds");
      return null;
    }
    const parts = slug.split("-");
    const ts = Number(parts[parts.length - 1]);
    if (!Number.isFinite(ts)) return null;
    return {
      slug,
      marketTimestamp: ts,
      endTimestamp: ts + 900,
      yesTokenId: ids[0]!,
      noTokenId: ids[1]!,
    };
  } catch (e) {
    logger.debug({ err: e, slug }, "Gamma fetch failed");
    return null;
  }
}

export function buildBtcSlugsAroundNow(): string[] {
  const now = Math.floor(Date.now() / 1000);
  const intervalStart = Math.floor(now / 900) * 900;
  const slugs: string[] = [];
  for (let i = -1; i < 97; i++) {
    slugs.push(`btc-updown-15m-${intervalStart + i * 900}`);
  }
  return slugs;
}

export async function loadBtc15mMarkets(): Promise<Btc15mMarket[]> {
  const slugs = buildBtcSlugsAroundNow();
  const results = await Promise.all(slugs.map((s) => fetchMarketBySlug(s)));
  const out = results.filter((x): x is Btc15mMarket => x != null);
  out.sort((a, b) => a.marketTimestamp - b.marketTimestamp);
  logger.info({ count: out.length }, "Loaded BTC 15m markets from Gamma");
  return out;
}




