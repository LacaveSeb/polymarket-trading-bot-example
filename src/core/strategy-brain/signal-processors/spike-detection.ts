import {
  SignalDirection,
  SignalStrength,
  SignalType,
  type TradingSignal,
} from "../../../domain/signals.js";
import { BaseSignalProcessor } from "./base-processor.js";
import { logger } from "../../../config/logger.js";

export class SpikeDetectionProcessor extends BaseSignalProcessor {
  constructor(
    private spikeThreshold = 0.05,
    private lookbackPeriods = 20,
    private minConfidence = 0.55,
    private velocityThreshold = 0.03,
  ) {
    super("SpikeDetection");
    logger.info(
      { spikeThreshold, lookbackPeriods, velocityThreshold },
      "SpikeDetectionProcessor initialized",
    );
  }

  process(
    currentPrice: number,
    historicalPrices: number[],
    metadata?: Record<string, unknown>,
  ): TradingSignal | null {
    void metadata;
    if (!this.enabled) return null;
    if (historicalPrices.length < this.lookbackPeriods) return null;

    const recent = historicalPrices.slice(-this.lookbackPeriods);
    const ma = recent.reduce((a, b) => a + b, 0) / recent.length;
    const curr = currentPrice;
    const deviation = ma > 0 ? (curr - ma) / ma : 0;
    const deviationAbs = Math.abs(deviation);

    let velocity = 0;
    if (historicalPrices.length >= 3) {
      const prev3 = historicalPrices[historicalPrices.length - 3]!;
      velocity = prev3 > 0 ? (curr - prev3) / prev3 : 0;
    }

    if (deviationAbs >= this.spikeThreshold) {
      const direction = deviation > 0 ? SignalDirection.BEARISH : SignalDirection.BULLISH;
      let strength: SignalStrength;
      if (deviationAbs >= 0.12) strength = SignalStrength.VERY_STRONG;
      else if (deviationAbs >= 0.08) strength = SignalStrength.STRONG;
      else if (deviationAbs >= 0.05) strength = SignalStrength.MODERATE;
      else strength = SignalStrength.WEAK;

      const confidence = Math.min(0.9, 0.5 + (deviationAbs - this.spikeThreshold) * 3);
      if (confidence < this.minConfidence) return null;

      const stopDistance = Math.abs(curr - ma) * 1.5;
      const stopLoss =
        direction === SignalDirection.BEARISH ? curr + stopDistance : curr - stopDistance;

      const signal: TradingSignal = {
        timestamp: new Date(),
        source: this.name,
        signalType: SignalType.SPIKE_DETECTED,
        direction,
        strength,
        confidence,
        currentPrice,
        targetPrice: ma,
        stopLoss,
        metadata: {
          detection_mode: "ma_deviation",
          deviation_pct: deviation,
          moving_average: ma,
          velocity,
          spike_direction: deviation > 0 ? "up" : "down",
        },
      };
      this.recordSignal(signal);
      return signal;
    }

    if (Math.abs(velocity) >= this.velocityThreshold && deviationAbs < this.spikeThreshold * 0.6) {
      const direction = velocity > 0 ? SignalDirection.BULLISH : SignalDirection.BEARISH;
      const velStrength = Math.abs(velocity) / this.velocityThreshold;
      let strength: SignalStrength;
      let confidence: number;
      if (velStrength >= 3) {
        strength = SignalStrength.MODERATE;
        confidence = 0.65;
      } else if (velStrength >= 2) {
        strength = SignalStrength.WEAK;
        confidence = 0.6;
      } else {
        strength = SignalStrength.WEAK;
        confidence = 0.57;
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
          detection_mode: "velocity",
          velocity_pct: velocity,
          moving_average: ma,
          deviation_pct: deviation,
        },
      };
      this.recordSignal(signal);
      return signal;
    }

    return null;
  }
}




