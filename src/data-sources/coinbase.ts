import { logger } from "../config/logger.js";

const BASE = "https://api.exchange.coinbase.com";

export class CoinbaseDataSource {
  constructor(private productId = "BTC-USD") {
    logger.info({ productId }, "CoinbaseDataSource");
  }

  async getCurrentPrice(): Promise<number | null> {
    try {
      const resp = await fetch(`${BASE}/products/${this.productId}/ticker`, {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json", "User-Agent": "PolymarketBot/1.0" },
      });
      if (!resp.ok) return null;
      const j = (await resp.json()) as { price?: string };
      return j.price != null ? Number(j.price) : null;
    } catch (e) {
      logger.warn({ err: e }, "Coinbase price fetch failed");
      return null;
    }
  }
}




