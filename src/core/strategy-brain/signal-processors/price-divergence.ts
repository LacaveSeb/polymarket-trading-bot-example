import {
  SignalDirection,
  SignalStrength,
  SignalType,
  type TradingSignal,
} from "../../../domain/signals.js";
import { BaseSignalProcessor } from "./base-processor.js";
import { logger } from "../../../config/logger.js";

export class PriceDivergenceProcessor extends BaseSignalProcessor {
  private spotHistory: number[] = [];
  private readonly maxSpotHistory = 10;

  constructor(
    private minConfidence = 0.55,
    private momentumThreshold = 0.003,
    private extremeProbThreshold = 0.68,
    private lowProbThreshold = 0.32,
  ) {
    super("PriceDivergence");
    logger.info(
      { momentumThreshold, extremeProbThreshold, lowProbThreshold },
      "PriceDivergenceProcessor initialized",
    );
  }

  process(
    currentPrice: number,
    historicalPrices: number[],
    metadata?: Record<string, unknown>,
  ): TradingSignal | null {
    void historicalPrices;
    if (!this.enabled || !metadata) return null;

    const polyProb = currentPrice;
    const spotPrice = metadata.spot_price != null ? Number(metadata.spot_price) : undefined;
    const polyMomentum = Number(metadata.momentum ?? 0);

    if (spotPrice !== undefined) {
      this.spotHistory.push(spotPrice);
      if (this.spotHistory.length > this.maxSpotHistory) this.spotHistory.shift();
    }

    let spotMomentum = 0;
    if (spotPrice !== undefined && this.spotHistory.length >= 3) {
      const oldest = this.spotHistory[Math.max(0, this.spotHistory.length - 3)]!;
      spotMomentum = (spotPrice - oldest) / oldest;
    } else if (spotPrice === undefined) {
      spotMomentum = polyMomentum;
    }

    logger.info(
      {
        polyProb,
        spotMomentum,
        spotPrice,
      },
      "PriceDivergence snapshot",
    );

    if (polyProb >= this.extremeProbThreshold) {
      if (spotMomentum <= 0.001) {
        const extremeness =
          (polyProb - this.extremeProbThreshold) / (1.0 - this.extremeProbThreshold);
        const confidence = Math.min(0.8, this.minConfidence + extremeness * 0.25);
        const strength =
          extremeness > 0.5 ? SignalStrength.STRONG : SignalStrength.MODERATE;
        const signal: TradingSignal = {
          timestamp: new Date(),
          source: this.name,
          signalType: SignalType.PRICE_DIVERGENCE,
          direction: SignalDirection.BEARISH,
          strength,
          confidence,
          currentPrice,
          metadata: {
            signal_type: "extreme_prob_fade_down",
            poly_prob: polyProb,
            spot_momentum: spotMomentum,
            extremeness,
          },
        };
        this.recordSignal(signal);
        return signal;
      }
    } else if (polyProb <= this.lowProbThreshold) {
      if (spotMomentum >= -0.001) {
        const extremeness = (this.lowProbThreshold - polyProb) / this.lowProbThreshold;
        const confidence = Math.min(0.8, this.minConfidence + extremeness * 0.25);
        const strength =
          extremeness > 0.5 ? SignalStrength.STRONG : SignalStrength.MODERATE;
        const signal: TradingSignal = {
          timestamp: new Date(),
          source: this.name,
          signalType: SignalType.PRICE_DIVERGENCE,
          direction: SignalDirection.BULLISH,
          strength,
          confidence,
          currentPrice,
          metadata: {
            signal_type: "extreme_prob_fade_up",
            poly_prob: polyProb,
            spot_momentum: spotMomentum,
            extremeness,
          },
        };
        this.recordSignal(signal);
        return signal;
      }
    }

    if (polyProb >= 0.35 && polyProb <= 0.65 && Math.abs(spotMomentum) >= this.momentumThreshold) {
      const momentumStrength = Math.abs(spotMomentum) / this.momentumThreshold;
      const confidence = Math.min(0.78, 0.55 + Math.min(momentumStrength - 1, 2) * 0.08);
      let strength: SignalStrength;
      if (momentumStrength >= 3) strength = SignalStrength.STRONG;
      else if (momentumStrength >= 2) strength = SignalStrength.MODERATE;
      else strength = SignalStrength.WEAK;
      if (confidence < this.minConfidence) return null;

      const direction =
        spotMomentum > 0 ? SignalDirection.BULLISH : SignalDirection.BEARISH;
      const signal: TradingSignal = {
        timestamp: new Date(),
        source: this.name,
        signalType: SignalType.PRICE_DIVERGENCE,
        direction,
        strength,
        confidence,
        currentPrice,
        metadata: {
          signal_type: "momentum_mispricing",
          poly_prob: polyProb,
          spot_momentum: spotMomentum,
          momentum_strength: momentumStrength,
        },
      };
      this.recordSignal(signal);
      return signal;
    }

    return null;
  }
}




