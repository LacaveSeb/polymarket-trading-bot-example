import { logger } from "../config/logger.js";
import { Big } from "../math/big.js";

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
    let t = new Big(0);
    for (const p of this.positions.values()) t = t.plus(p.size);
    return Number(t);
  }

  getCurrentDrawdown(): number {
    if (this.peakBalance === 0) return 0;
    const peak = new Big(this.peakBalance);
    return Number(peak.minus(this.currentBalance).div(peak));
  }

  validateNewPosition(
    size: number,
    _direction: string,
    _currentPrice: number,
  ): { ok: true } | { ok: false; error: string } {
    const sizeB = new Big(size);
    if (sizeB.gt(this.limits.maxPositionSize)) {
      return { ok: false, error: `Position size $${size} exceeds max $${this.limits.maxPositionSize}` };
    }
    if (this.positions.size >= this.limits.maxPositions) {
      return { ok: false, error: `Max positions (${this.limits.maxPositions}) reached` };
    }
    const newExposure = new Big(this.getTotalExposure()).plus(size);
    if (newExposure.gt(this.limits.maxTotalExposure)) {
      return {
        ok: false,
        error: `Exposure $${Number(newExposure)} would exceed $${this.limits.maxTotalExposure}`,
      };
    }
    if (new Big(this.dailyPnl).lt(-this.limits.maxLossPerDay)) {
      return { ok: false, error: "Daily loss limit reached" };
    }
    if (new Big(this.getCurrentDrawdown()).gt(this.limits.maxDrawdownPct)) {
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




