import { SignalDirection, type FusedSignal, type TradingSignal } from "../../../domain/signals.js";
import { logger } from "../../../config/logger.js";

function directionStr(d: SignalDirection | string): string {
  return String(d).toUpperCase();
}

export class SignalFusionEngine {
  weights: Record<string, number> = {
    SpikeDetection: 0.4,
    PriceDivergence: 0.3,
    SentimentAnalysis: 0.2,
    default: 0.1,
  };

  private fusionsPerformed = 0;

  setWeight(processorName: string, weight: number): void {
    if (weight < 0 || weight > 1) throw new Error("Weight must be 0..1");
    this.weights[processorName] = weight;
    logger.info({ processorName, weight }, "Fusion weight set");
  }

  fuseSignals(
    signals: TradingSignal[],
    minSignals = 1,
    minScore = 50,
  ): FusedSignal | null {
    if (!signals.length) return null;
    if (signals.length < minSignals) return null;

    const now = new Date();
    const recent = signals.filter((s) => now.getTime() - s.timestamp.getTime() < 5 * 60 * 1000);
    if (recent.length < minSignals) return null;

    let bullishContrib = 0;
    let bearishContrib = 0;

    for (const signal of recent) {
      const weight = this.weights[signal.source] ?? this.weights.default!;
      const strengthFactor = signal.strength / 4;
      const conf = Math.min(1, Math.max(0, signal.confidence));
      const contribution = weight * conf * strengthFactor;
      const ds = directionStr(signal.direction);
      if (ds.includes("BULLISH")) bullishContrib += contribution;
      else if (ds.includes("BEARISH")) bearishContrib += contribution;
    }

    const totalContrib = bullishContrib + bearishContrib;
    if (totalContrib < 0.0001) return null;

    const direction =
      bullishContrib >= bearishContrib ? SignalDirection.BULLISH : SignalDirection.BEARISH;
    const dominant = bullishContrib >= bearishContrib ? bullishContrib : bearishContrib;
    const consensusScore = totalContrib > 0
      ? (dominant / totalContrib) * 100
      : 0;
    let confSum = 0;
    for (const s of recent) confSum += s.confidence;
    const avgConf = confSum / (recent.length || 1);

    if (consensusScore < minScore) return null;

    const fused: FusedSignal = {
      timestamp: now,
      direction,
      confidence: avgConf,
      score: consensusScore,
      signals: recent,
      weights: { ...this.weights },
      metadata: {
        bullish_contrib: Number(bullishContrib.toFixed(4)),
        bearish_contrib: Number(bearishContrib.toFixed(4)),
        total_contrib: Number(totalContrib.toFixed(4)),
      },
      numSignals: recent.length,
    };
    this.fusionsPerformed += 1;
    logger.info(
      { n: recent.length, direction, score: consensusScore, conf: avgConf },
      "Signals fused",
    );
    return fused;
  }
}

let fusionSingleton: SignalFusionEngine | null = null;

export function getFusionEngine(): SignalFusionEngine {
  fusionSingleton ??= new SignalFusionEngine();
  return fusionSingleton;
}




