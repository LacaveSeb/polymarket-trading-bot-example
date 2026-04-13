import { logger } from "../config/logger.js";

export interface TradeRecordInput {
  tradeId: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  entryTime: Date;
  exitTime: Date;
  signalScore: number;
  signalConfidence: number;
  metadata?: Record<string, unknown>;
}

export class PerformanceTracker {
  private trades: TradeRecordInput[] = [];

  recordTrade(input: TradeRecordInput): void {
    this.trades.push(input);
    logger.info({ tradeId: input.tradeId, direction: input.direction }, "Trade recorded");
  }

  recordOrderEvent(_eventType: string): void {
    /* optional hook */
  }

  getRecentTrades(limit = 20): TradeRecordInput[] {
    return this.trades.slice(-limit);
  }
}

let perfSingleton: PerformanceTracker | null = null;

export function getPerformanceTracker(): PerformanceTracker {
  perfSingleton ??= new PerformanceTracker();
  return perfSingleton;
}




