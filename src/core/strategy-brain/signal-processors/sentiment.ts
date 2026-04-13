import {
  SignalDirection,
  SignalStrength,
  SignalType,
  type TradingSignal,
} from "../../../domain/signals.js";
import { BaseSignalProcessor } from "./base-processor.js";
import { logger } from "../../../config/logger.js";

export class SentimentProcessor extends BaseSignalProcessor {
  constructor(
    private extremeFear = 25,
    private extremeGreed = 75,
    private minConfidence = 0.5,
  ) {
    super("SentimentAnalysis");
    logger.info({ extremeFear, extremeGreed }, "SentimentProcessor initialized");
  }

  process(
    currentPrice: number,
    historicalPrices: number[],
    metadata?: Record<string, unknown>,
  ): TradingSignal | null {
    void historicalPrices;
    if (!this.enabled || !metadata || metadata.sentiment_score === undefined) return null;

    const sentimentScore = Number(metadata.sentiment_score);
    let direction: SignalDirection;
    let signalType: SignalType;
    let strength: SignalStrength;
    let confidence: number;

    if (sentimentScore <= this.extremeFear) {
      direction = SignalDirection.BULLISH;
      signalType = SignalType.SENTIMENT_SHIFT;
      const extremeness = (this.extremeFear - sentimentScore) / this.extremeFear;
      if (extremeness >= 0.8) {
        strength = SignalStrength.VERY_STRONG;
        confidence = 0.85;
      } else if (extremeness >= 0.5) {
        strength = SignalStrength.STRONG;
        confidence = 0.75;
      } else {
        strength = SignalStrength.MODERATE;
        confidence = 0.65;
      }
    } else if (sentimentScore >= this.extremeGreed) {
      direction = SignalDirection.BEARISH;
      signalType = SignalType.SENTIMENT_SHIFT;
      const extremeness = (sentimentScore - this.extremeGreed) / (100 - this.extremeGreed);
      if (extremeness >= 0.8) {
        strength = SignalStrength.VERY_STRONG;
        confidence = 0.85;
      } else if (extremeness >= 0.5) {
        strength = SignalStrength.STRONG;
        confidence = 0.75;
      } else {
        strength = SignalStrength.MODERATE;
        confidence = 0.65;
      }
    } else if (sentimentScore < 45) {
      direction = SignalDirection.BULLISH;
      signalType = SignalType.SENTIMENT_SHIFT;
      strength = SignalStrength.WEAK;
      confidence = 0.55;
    } else if (sentimentScore > 55) {
      direction = SignalDirection.BEARISH;
      signalType = SignalType.SENTIMENT_SHIFT;
      strength = SignalStrength.WEAK;
      confidence = 0.55;
    } else {
      return null;
    }

    if (confidence < this.minConfidence) return null;

    const signal: TradingSignal = {
      timestamp: new Date(),
      source: this.name,
      signalType,
      direction,
      strength,
      confidence,
      currentPrice,
      metadata: {
        sentiment_score: sentimentScore,
        sentiment_classification: metadata.sentiment_classification ?? "unknown",
      },
    };
    this.recordSignal(signal);
    return signal;
  }
}




