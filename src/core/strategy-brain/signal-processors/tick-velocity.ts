import {
  SignalDirection,
  SignalStrength,
  SignalType,
  type TradingSignal,
} from "../../../domain/signals.js";
import { BaseSignalProcessor } from "./base-processor.js";
import { logger } from "../../../config/logger.js";

export interface TickBufferEntry {
  ts: Date;
  price: number;
}

export class TickVelocityProcessor extends BaseSignalProcessor {
  constructor(
    private velocityThreshold60s = 0.015,
    private velocityThreshold30s = 0.01,
    private minTicks = 5,
    private minConfidence = 0.55,
  ) {
    super("TickVelocity");
    logger.info(
      { velocityThreshold60s, velocityThreshold30s },
      "TickVelocityProcessor initialized",
    );
  }

  private getPriceAt(
    tickBuffer: TickBufferEntry[],
    secondsAgo: number,
    now: Date,
  ): number | null {
    const target = new Date(now.getTime() - secondsAgo * 1000);
    let best: number | null = null;
    let bestDiff = Infinity;
    for (const tick of tickBuffer) {
      const diff = Math.abs(tick.ts.getTime() - target.getTime()) / 1000;
      if (diff < bestDiff) {
        bestDiff = diff;
        best = tick.price;
      }
    }
    if (best !== null && bestDiff <= 15) return best;
    return null;
  }

  process(
    currentPrice: number,
    historicalPrices: number[],
    metadata?: Record<string, unknown>,
  ): TradingSignal | null {
    void historicalPrices;
    if (!this.enabled || !metadata) return null;
    const tickBuffer = metadata.tick_buffer as TickBufferEntry[] | undefined;
    if (!tickBuffer || tickBuffer.length < this.minTicks) return null;

    const now = new Date();
    const curr = currentPrice;
    const price60s = this.getPriceAt(tickBuffer, 60, now);
    const price30s = this.getPriceAt(tickBuffer, 30, now);
    if (price60s === null && price30s === null) return null;

    const vel60s =
      price60s != null && price60s > 0 ? (curr - price60s) / price60s : null;
    const vel30s =
      price30s != null && price30s > 0 ? (curr - price30s) / price30s : null;

    let acceleration = 0;
    if (vel60s !== null && vel30s !== null) {
      const velFirst30s = vel60s - vel30s;
      acceleration = vel30s - velFirst30s;
    }

    logger.info(
      {
        curr,
        vel60s,
        vel30s,
        acceleration,
      },
      "TickVelocity snapshot",
    );

    const primaryVel = vel30s ?? vel60s;
    if (primaryVel === null) return null;
    const threshold =
      vel30s !== null ? this.velocityThreshold30s : this.velocityThreshold60s;
    if (Math.abs(primaryVel) < threshold) return null;

    const direction = primaryVel > 0 ? SignalDirection.BULLISH : SignalDirection.BEARISH;
    const absVel = Math.abs(primaryVel);
    let strength: SignalStrength;
    if (absVel >= 0.04) strength = SignalStrength.VERY_STRONG;
    else if (absVel >= 0.025) strength = SignalStrength.STRONG;
    else if (absVel >= 0.015) strength = SignalStrength.MODERATE;
    else strength = SignalStrength.WEAK;

    let confidence = Math.min(0.82, 0.55 + (absVel / threshold - 1) * 0.12);
    const accelSameDir =
      (acceleration > 0 && primaryVel > 0) || (acceleration < 0 && primaryVel < 0);
    if (accelSameDir && Math.abs(acceleration) > 0.005) {
      confidence = Math.min(0.88, confidence + 0.06);
    }
    if (vel60s !== null && vel30s !== null && (vel60s > 0) !== (vel30s > 0)) {
      confidence *= 0.8;
    }
    if (confidence < this.minConfidence) return null;

    const signal: TradingSignal = {
      timestamp: new Date(),
      source: this.name,
      signalType: SignalType.MOMENTUM,
      direction,
      strength,
      confidence,
      currentPrice,
      metadata: {
        velocity_60s: vel60s,
        velocity_30s: vel30s,
        acceleration,
        price_60s_ago: price60s,
        price_30s_ago: price30s,
        ticks_in_buffer: tickBuffer.length,
      },
    };
    this.recordSignal(signal);
    return signal;
  }
}




