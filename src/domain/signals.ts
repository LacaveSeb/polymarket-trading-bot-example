export enum SignalType {
  SPIKE_DETECTED = "spike_detected",
  MEAN_REVERSION = "mean_reversion",
  MOMENTUM = "momentum",
  SENTIMENT_SHIFT = "sentiment_shift",
  VOLUME_SURGE = "volume_surge",
  PRICE_DIVERGENCE = "price_divergence",
  ANOMALY = "anomaly",
}

export enum SignalStrength {
  WEAK = 1,
  MODERATE = 2,
  STRONG = 3,
  VERY_STRONG = 4,
}

export enum SignalDirection {
  BULLISH = "bullish",
  BEARISH = "bearish",
  NEUTRAL = "neutral",
}

export interface TradingSignal {
  timestamp: Date;
  source: string;
  signalType: SignalType;
  direction: SignalDirection;
  strength: SignalStrength;
  confidence: number;
  currentPrice: number;
  targetPrice?: number;
  stopLoss?: number;
  metadata: Record<string, unknown>;
}

export function signalScore(s: TradingSignal): number {
  const strengthWeight = s.strength / 4;
  return (strengthWeight * 0.5 + s.confidence * 0.5) * 100;
}

export interface FusedSignal {
  timestamp: Date;
  direction: SignalDirection;
  confidence: number;
  score: number;
  signals: TradingSignal[];
  weights: Record<string, number>;
  metadata: Record<string, unknown>;
  numSignals: number;
}




