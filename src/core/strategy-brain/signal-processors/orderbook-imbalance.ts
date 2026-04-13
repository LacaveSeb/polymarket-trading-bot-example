import {
  SignalDirection,
  SignalStrength,
  SignalType,
  type TradingSignal,
} from "../../../domain/signals.js";
import { BaseSignalProcessor } from "./base-processor.js";
import { logger } from "../../../config/logger.js";

const CLOB_BASE = "https://clob.polymarket.com";

type BookLevel = { price?: string; size?: string };

export class OrderBookImbalanceProcessor extends BaseSignalProcessor {
  constructor(
    private imbalanceThreshold = 0.3,
    private wallThreshold = 0.2,
    private minBookVolume = 50,
    private minConfidence = 0.55,
    private topLevels = 10,
  ) {
    super("OrderBookImbalance");
    logger.info(
      { imbalanceThreshold, wallThreshold, minBookVolume },
      "OrderBookImbalanceProcessor initialized",
    );
  }

  async fetchOrderBook(tokenId: string): Promise<Record<string, unknown> | null> {
    try {
      const url = new URL(`${CLOB_BASE}/book`);
      url.searchParams.set("token_id", tokenId);
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return null;
      return (await resp.json()) as Record<string, unknown>;
    } catch (e) {
      logger.warn({ err: e, tokenId: tokenId.slice(0, 16) }, "OrderBook fetch failed");
      return null;
    }
  }

  private parseLevels(levels: BookLevel[]): number {
    let total = 0;
    for (const level of levels.slice(0, this.topLevels)) {
      const price = Number(level.price ?? 0);
      const size = Number(level.size ?? 0);
      total += price * size;
    }
    return total;
  }

  private detectWall(levels: BookLevel[], totalVolume: number): number | null {
    if (totalVolume <= 0) return null;
    for (const level of levels.slice(0, this.topLevels)) {
      const price = Number(level.price ?? 0);
      const size = Number(level.size ?? 0);
      const orderUsd = price * size;
      if (orderUsd / totalVolume >= this.wallThreshold) return orderUsd;
    }
    return null;
  }

  process(
    _currentPrice: number,
    historicalPrices: number[],
    _metadata?: Record<string, unknown>,
  ): TradingSignal | null {
    void historicalPrices;
    return null;
  }

  /** Async variant: Python used sync httpx; in Node we expose async explicitly. */
  async processAsync(
    currentPrice: number,
    metadata?: Record<string, unknown>,
  ): Promise<TradingSignal | null> {
    if (!this.enabled || !metadata) return null;
    const tokenId = metadata.yes_token_id;
    if (typeof tokenId !== "string" || !tokenId) return null;

    const book = await this.fetchOrderBook(tokenId);
    if (!book) return null;

    const bids = (book.bids as BookLevel[]) ?? [];
    const asks = (book.asks as BookLevel[]) ?? [];
    const bidVolume = this.parseLevels(bids);
    const askVolume = this.parseLevels(asks);
    const totalVolume = bidVolume + askVolume;

    if (totalVolume < this.minBookVolume) return null;

    const imbalance = (bidVolume - askVolume) / totalVolume;
    logger.info({ bidVolume, askVolume, totalVolume, imbalance }, "OrderBook snapshot");

    if (Math.abs(imbalance) < this.imbalanceThreshold) return null;

    const direction = imbalance > 0 ? SignalDirection.BULLISH : SignalDirection.BEARISH;
    const absImb = Math.abs(imbalance);
    let strength: SignalStrength;
    if (absImb >= 0.7) strength = SignalStrength.VERY_STRONG;
    else if (absImb >= 0.5) strength = SignalStrength.STRONG;
    else if (absImb >= 0.35) strength = SignalStrength.MODERATE;
    else strength = SignalStrength.WEAK;

    let confidence = Math.min(0.85, 0.55 + absImb * 0.4);
    const bidWall = this.detectWall(bids, totalVolume);
    const askWall = this.detectWall(asks, totalVolume);
    const wallSide = direction === SignalDirection.BULLISH ? bidWall : askWall;
    if (wallSide) confidence = Math.min(0.9, confidence + 0.05);

    if (confidence < this.minConfidence) return null;

    const signal: TradingSignal = {
      timestamp: new Date(),
      source: this.name,
      signalType: SignalType.VOLUME_SURGE,
      direction,
      strength,
      confidence,
      currentPrice,
      metadata: {
        bid_volume_usd: Math.round(bidVolume * 100) / 100,
        ask_volume_usd: Math.round(askVolume * 100) / 100,
        total_volume_usd: Math.round(totalVolume * 100) / 100,
        imbalance: Math.round(imbalance * 10000) / 10000,
        bid_wall_usd: bidWall ?? null,
        ask_wall_usd: askWall ?? null,
      },
    };
    this.recordSignal(signal);
    return signal;
  }
}




