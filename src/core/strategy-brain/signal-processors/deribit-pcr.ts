import {
  SignalDirection,
  SignalStrength,
  SignalType,
  type TradingSignal,
} from "../../../domain/signals.js";
import { BaseSignalProcessor } from "./base-processor.js";
import { logger } from "../../../config/logger.js";

const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency";

interface PcrData {
  overall_pcr: number;
  short_pcr: number;
  put_oi: number;
  call_oi: number;
  short_put_oi: number;
  short_call_oi: number;
}

export class DeribitPCRProcessor extends BaseSignalProcessor {
  private cached: PcrData | null = null;
  private cacheTime: Date | null = null;

  constructor(
    private bullishPcrThreshold = 1.2,
    private bearishPcrThreshold = 0.7,
    private maxDaysToExpiry = 2,
    private minOpenInterest = 100,
    private cacheSeconds = 300,
    private minConfidence = 0.55,
  ) {
    super("DeribitPCR");
    logger.info(
      { bullishPcrThreshold, bearishPcrThreshold, maxDaysToExpiry },
      "DeribitPCRProcessor initialized",
    );
  }

  /** Match Deribit name segment e.g. `20FEB26` (%d%b%y). */
  private parseDte(instrumentName: string): number | null {
    try {
      const parts = instrumentName.split("-");
      if (parts.length < 3) return null;
      const expiryStr = parts[1]!;
      const m = expiryStr.match(/^(\d{2})([A-Za-z]{3})(\d{2})$/);
      if (!m) return null;
      const day = Number(m[1]);
      const monStr = m[2]!.toUpperCase();
      const yy = Number(m[3]);
      const months: Record<string, number> = {
        JAN: 0,
        FEB: 1,
        MAR: 2,
        APR: 3,
        MAY: 4,
        JUN: 5,
        JUL: 6,
        AUG: 7,
        SEP: 8,
        OCT: 9,
        NOV: 10,
        DEC: 11,
      };
      const month = months[monStr];
      if (month === undefined || Number.isNaN(day) || Number.isNaN(yy)) return null;
      const year = 2000 + yy;
      const expiryDt = new Date(Date.UTC(year, month, day));
      const now = new Date();
      const dte = Math.floor((expiryDt.getTime() - now.getTime()) / 86400000);
      return Math.max(0, dte);
    } catch {
      return null;
    }
  }

  private async fetchPcr(): Promise<PcrData | null> {
    try {
      const url = new URL(DERIBIT_URL);
      url.searchParams.set("currency", "BTC");
      url.searchParams.set("kind", "option");
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;
      const data = (await resp.json()) as { result?: Array<Record<string, unknown>> };
      const summaries = data.result ?? [];
      if (!summaries.length) return null;

      let putOi = 0;
      let callOi = 0;
      let shortPutOi = 0;
      let shortCallOi = 0;

      for (const item of summaries) {
        const name = String(item.instrument_name ?? "");
        const oi = Number(item.open_interest ?? 0);
        if (oi < this.minOpenInterest) continue;
        const isPut = name.endsWith("-P");
        const isCall = name.endsWith("-C");
        if (isPut) putOi += oi;
        else if (isCall) callOi += oi;
        const dte = this.parseDte(name);
        if (dte !== null && dte <= this.maxDaysToExpiry) {
          if (isPut) shortPutOi += oi;
          else if (isCall) shortCallOi += oi;
        }
      }

      const overallPcr = callOi > 0 ? putOi / callOi : 1;
      const shortPcr = shortCallOi > 0 ? shortPutOi / shortCallOi : overallPcr;

      return {
        overall_pcr: Math.round(overallPcr * 10000) / 10000,
        short_pcr: Math.round(shortPcr * 10000) / 10000,
        put_oi: Math.round(putOi * 100) / 100,
        call_oi: Math.round(callOi * 100) / 100,
        short_put_oi: Math.round(shortPutOi * 100) / 100,
        short_call_oi: Math.round(shortCallOi * 100) / 100,
      };
    } catch (e) {
      logger.warn({ err: e }, "Deribit PCR fetch failed");
      return null;
    }
  }

  process(
    _currentPrice: number,
    historicalPrices: number[],
    metadata?: Record<string, unknown>,
  ): TradingSignal | null {
    void historicalPrices;
    void metadata;
    return null;
  }

  async processAsync(currentPrice: number): Promise<TradingSignal | null> {
    if (!this.enabled) return null;
    const now = new Date();
    const cacheValid =
      this.cached &&
      this.cacheTime &&
      (now.getTime() - this.cacheTime.getTime()) / 1000 < this.cacheSeconds;

    let pcrData: PcrData | null = cacheValid ? this.cached : null;
    if (!pcrData) {
      pcrData = await this.fetchPcr();
      if (!pcrData) return null;
      this.cached = pcrData;
      this.cacheTime = now;
    }

    const pcr = pcrData.short_pcr || pcrData.overall_pcr;
    let direction: SignalDirection;
    let strength: SignalStrength;
    let confidence: number;

    if (pcr >= this.bullishPcrThreshold) {
      direction = SignalDirection.BULLISH;
      const extremeness = (pcr - this.bullishPcrThreshold) / this.bullishPcrThreshold;
      confidence = Math.min(0.8, 0.57 + extremeness * 0.15);
      if (pcr >= 1.6) strength = SignalStrength.VERY_STRONG;
      else if (pcr >= 1.4) strength = SignalStrength.STRONG;
      else strength = SignalStrength.MODERATE;
    } else if (pcr <= this.bearishPcrThreshold) {
      direction = SignalDirection.BEARISH;
      const extremeness =
        (this.bearishPcrThreshold - pcr) / this.bearishPcrThreshold;
      confidence = Math.min(0.8, 0.57 + extremeness * 0.15);
      if (pcr <= 0.45) strength = SignalStrength.VERY_STRONG;
      else if (pcr <= 0.55) strength = SignalStrength.STRONG;
      else strength = SignalStrength.MODERATE;
    } else {
      return null;
    }

    if (confidence < this.minConfidence) return null;

    const signal: TradingSignal = {
      timestamp: new Date(),
      source: this.name,
      signalType: SignalType.SENTIMENT_SHIFT,
      direction,
      strength,
      confidence,
      currentPrice,
      metadata: {
        pcr: Math.round(pcr * 10000) / 10000,
        overall_pcr: pcrData.overall_pcr,
        short_put_oi: pcrData.short_put_oi,
        short_call_oi: pcrData.short_call_oi,
      },
    };
    this.recordSignal(signal);
    return signal;
  }
}




