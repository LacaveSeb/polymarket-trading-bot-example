import { logger } from "../config/logger.js";

export interface RiskLimits {
  maxPositionSize: number;
  maxTotalExposure: number;
  maxPositions: number;
  maxDrawdownPct: number;
  maxLossPerDay: number;
  maxLeverage: number;
}

export class RiskEngine {
  limits: RiskLimits;
  private positions = new Map<string, { size: number }>();
  private dailyPnl = 0;
  private peakBalance = 1000;
  private currentBalance = 1000;

  constructor(limits?: Partial<RiskLimits>) {
    this.limits = {
      maxPositionSize: 1,
      maxTotalExposure: 10,
      maxPositions: 5,
      maxDrawdownPct: 0.15,
      maxLossPerDay: 5,
      maxLeverage: 1,
      ...limits,
    };
    logger.info({ limits: this.limits }, "RiskEngine initialized");
  }

  getTotalExposure(): number {
    let t = 0;
    for (const p of this.positions.values()) t += p.size;
    return t;
  }

  getCurrentDrawdown(): number {
    if (this.peakBalance === 0) return 0;
    return (this.peakBalance - this.currentBalance) / this.peakBalance;
  }

  validateNewPosition(
    size: number,
    _direction: string,
    _currentPrice: number,
  ): { ok: true } | { ok: false; error: string } {
    if (size > this.limits.maxPositionSize) {
      return { ok: false, error: `Position size $${size} exceeds max $${this.limits.maxPositionSize}` };
    }
    if (this.positions.size >= this.limits.maxPositions) {
      return { ok: false, error: `Max positions (${this.limits.maxPositions}) reached` };
    }
    const newExposure = this.getTotalExposure() + size;
    if (newExposure > this.limits.maxTotalExposure) {
      return {
        ok: false,
        error: `Exposure $${newExposure} would exceed $${this.limits.maxTotalExposure}`,
      };
    }
    if (this.dailyPnl < -this.limits.maxLossPerDay) {
      return { ok: false, error: "Daily loss limit reached" };
    }
    if (this.getCurrentDrawdown() > this.limits.maxDrawdownPct) {
      return { ok: false, error: "Max drawdown exceeded" };
    }
    return { ok: true };
  }
}

let riskSingleton: RiskEngine | null = null;

export function getRiskEngine(): RiskEngine {
  riskSingleton ??= new RiskEngine();
  return riskSingleton;
}




