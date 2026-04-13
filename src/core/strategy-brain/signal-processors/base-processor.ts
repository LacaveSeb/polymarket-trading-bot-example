import type { TradingSignal } from "../../../domain/signals.js";

export abstract class BaseSignalProcessor {
  readonly name: string;
  protected enabled = true;
  protected signalsGenerated = 0;
  protected lastSignal: TradingSignal | null = null;

  constructor(name: string) {
    this.name = name;
  }

  abstract process(
    currentPrice: number,
    historicalPrices: number[],
    metadata?: Record<string, unknown>,
  ): TradingSignal | null;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get signalsGeneratedCount(): number {
    return this.signalsGenerated;
  }

  protected recordSignal(signal: TradingSignal): void {
    this.signalsGenerated += 1;
    this.lastSignal = signal;
  }

  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      enabled: this.enabled,
      signalsGenerated: this.signalsGenerated,
      lastSignal: this.lastSignal
        ? {
            timestamp: this.lastSignal.timestamp.toISOString(),
            type: this.lastSignal.signalType,
            direction: this.lastSignal.direction,
          }
        : null,
    };
  }
}




