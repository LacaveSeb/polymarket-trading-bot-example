import { logger } from "../config/logger.js";

const FNG = "https://api.alternative.me/fng/";

export class NewsSocialDataSource {
  async getFearGreedIndex(): Promise<{
    value: number;
    classification: string;
  } | null> {
    try {
      const resp = await fetch(FNG, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "PolymarketBot/1.0" },
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        data?: Array<{ value?: string; value_classification?: string }>;
      };
      const row = data.data?.[0];
      if (!row?.value) return null;
      return {
        value: Number(row.value),
        classification: String(row.value_classification ?? ""),
      };
    } catch (e) {
      logger.warn({ err: e }, "Fear & Greed fetch failed");
      return null;
    }
  }
}




