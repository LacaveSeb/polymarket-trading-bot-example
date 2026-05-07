import { writeFileSync } from "node:fs";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { Btc15mMarket } from "./gamma-markets.js";
import { loadBtc15mMarkets } from "./gamma-markets.js";
import { fetchBookMid } from "../execution/clob-http.js";
import { getFusionEngine } from "../core/strategy-brain/fusion-engine/signal-fusion.js";
import { getRiskEngine } from "../execution/risk-engine.js";
import { getPerformanceTracker } from "../monitoring/performance-tracker.js";
import { getGrafanaExporter } from "../monitoring/grafana-exporter.js";
import { getLearningEngine } from "../feedback/learning-engine.js";
import { SpikeDetectionProcessor } from "../core/strategy-brain/signal-processors/spike-detection.js";
import { SentimentProcessor } from "../core/strategy-brain/signal-processors/sentiment.js";
import { PriceDivergenceProcessor } from "../core/strategy-brain/signal-processors/price-divergence.js";
import { OrderBookImbalanceProcessor } from "../core/strategy-brain/signal-processors/orderbook-imbalance.js";
import { TickVelocityProcessor, type TickBufferEntry } from "../core/strategy-brain/signal-processors/tick-velocity.js";
import { DeribitPCRProcessor } from "../core/strategy-brain/signal-processors/deribit-pcr.js";
import { CoinbaseDataSource } from "../data-sources/coinbase.js";
import { NewsSocialDataSource } from "../data-sources/news-social.js";
import { PolymarketExecutionService } from "../execution/polymarket-execution.js";
import type { FusedSignal, TradingSignal } from "../domain/signals.js";

const MARKET_INTERVAL_SEC = 900;
const TRADE_WINDOW_START = 780;
const TRADE_WINDOW_END = 840;
const QUOTE_MIN_SPREAD = 0.001;
const TREND_UP = 0.6;
const TREND_DOWN = 0.4;
const MIN_LIQUIDITY = 0.02;
const MAX_HISTORY = 100;
const TICK_BUFFER_MAX = 500;

export interface Btc15mBotOptions {
  simulation: boolean;
  enableGrafana: boolean;
  testMode: boolean;
  pollIntervalMs?: number;
}

interface PaperTrade {
  timestamp: string;
  direction: string;
  sizeUsd: number;
  price: number;
  signalScore: number;
  signalConfidence: number;
  outcome: string;
}

export class Btc15mBot {
  private readonly options: Btc15mBotOptions;
  private redis: InstanceType<typeof Redis> | null = null;
  private currentSimulation: boolean;
  private markets: Btc15mMarket[] = [];
  private currentIndex = -1;
  private yesTokenId = "";
  private noTokenId = "";
  private marketTimestamp = 0;
  private slug = "";
  private nextSwitchTime: Date | null = null;
  private waitingForMarketOpen = false;
  private marketStable = false;
  private lastTradeKey: string | number = -1;
  private priceHistory: number[] = [];
  private tickBuffer: TickBufferEntry[] = [];
  private lastBidAsk: [number, number] | null = null;
  private paperTrades: PaperTrade[] = [];

  private readonly fusion = getFusionEngine();
  private readonly risk = getRiskEngine();
  private readonly performance = getPerformanceTracker();
  private readonly learning = getLearningEngine();
  private grafana = getGrafanaExporter();
  private readonly execution = new PolymarketExecutionService();

  private readonly spike = new SpikeDetectionProcessor(0.05, 20);
  private readonly sentiment = new SentimentProcessor(25, 75);
  private readonly divergence = new PriceDivergenceProcessor(0.05);
  private readonly orderbook = new OrderBookImbalanceProcessor(0.3, 0.2, 50);
  private readonly tickVel = new TickVelocityProcessor(0.015, 0.01);
  private readonly deribit = new DeribitPCRProcessor(1.2, 0.7, 2, 100, 300);

  private readonly coinbase = new CoinbaseDataSource();
  private readonly news = new NewsSocialDataSource();

  constructor(options: Btc15mBotOptions) {
    this.options = { pollIntervalMs: 2000, ...options };
    this.currentSimulation = options.simulation;
    this.fusion.setWeight("OrderBookImbalance", 0.3);
    this.fusion.setWeight("TickVelocity", 0.25);
    this.fusion.setWeight("PriceDivergence", 0.18);
    this.fusion.setWeight("SpikeDetection", 0.12);
    this.fusion.setWeight("DeribitPCR", 0.1);
    this.fusion.setWeight("SentimentAnalysis", 0.05);
  }

  private initRedis(): void {
    try {
      this.redis = new Redis({
        host: env.redisHost,
        port: env.redisPort,
        db: env.redisDb,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
    } catch {
      this.redis = null;
    }
  }

  async start(): Promise<void> {
    this.initRedis();
    if (this.redis) {
      try {
        await this.redis.connect();
        await this.redis.set(
          "btc_trading:simulation_mode",
          this.options.simulation ? "1" : "0",
        );
        logger.info("Redis connected; simulation_mode set for this session");
      } catch (e) {
        logger.warn({ err: e }, "Redis unavailable");
        this.redis = null;
      }
    }

    if (this.options.enableGrafana) {
      await this.grafana.start().catch((e) => logger.warn({ err: e }, "Grafana exporter failed"));
    }

    if (!this.options.simulation) {
      const ok = await this.execution.connect();
      if (!ok) {
        logger.error("Live mode requested but CLOB connection failed — exiting");
        process.exit(1);
      }
    }

    this.markets = await loadBtc15mMarkets();
    if (!this.markets.length) {
      logger.error("No BTC 15m markets from Gamma — exiting");
      process.exit(1);
    }

    this.pickMarketSlot();
    this.bootstrapHistory();
    void this.learning.analyzeSignalPerformance();

    logger.info(
      {
        simulation: this.currentSimulation,
        slug: this.slug,
        pollMs: this.options.pollIntervalMs,
      },
      "Btc15mBot started",
    );

    const interval = this.options.pollIntervalMs ?? 2000;
    setInterval(() => void this.tick().catch((e) => logger.error({ err: e }, "tick error")), interval);
    await this.tick();
  }

  private pickMarketSlot(): void {
    const now = Math.floor(Date.now() / 1000);
    let idx = -1;
    for (let i = 0; i < this.markets.length; i++) {
      const m = this.markets[i]!;
      if (now >= m.marketTimestamp && now < m.endTimestamp) {
        idx = i;
        break;
      }
    }

    if (idx >= 0) {
      this.waitingForMarketOpen = false;
      this.nextSwitchTime = new Date(this.markets[idx]!.endTimestamp * 1000);
      this.applyMarketIndex(idx);
      return;
    }

    const future = this.markets.filter((m) => m.marketTimestamp > now);
    if (future.length) {
      const nearest = future.reduce((a, b) =>
        a.marketTimestamp < b.marketTimestamp ? a : b,
      );
      idx = this.markets.indexOf(nearest);
      this.waitingForMarketOpen = true;
      this.nextSwitchTime = new Date(nearest.marketTimestamp * 1000);
      this.applyMarketIndex(idx);
      return;
    }

    if (this.markets.length) {
      idx = this.markets.length - 1;
      this.waitingForMarketOpen = false;
      this.nextSwitchTime = new Date(this.markets[idx]!.endTimestamp * 1000);
      this.applyMarketIndex(idx);
    }
  }

  private applyMarketIndex(idx: number): void {
    this.currentIndex = idx;
    const m = this.markets[idx]!;
    this.slug = m.slug;
    this.yesTokenId = m.yesTokenId;
    this.noTokenId = m.noTokenId;
    this.marketTimestamp = m.marketTimestamp;
    if (!this.waitingForMarketOpen) {
      this.nextSwitchTime = new Date(m.endTimestamp * 1000);
    }
    logger.info({ idx, slug: this.slug }, "Active market set");
  }

  private bootstrapHistory(): void {
    if (this.priceHistory.length >= 20) return;
    let base = this.priceHistory[this.priceHistory.length - 1] ?? 0.5;
    while (this.priceHistory.length < 20) {
      const change = (Math.random() - 0.5) * 0.06;
      let next = base * (1 + change);
      if (next > 0.99) next = 0.99;
      if (next < 0.01) next = 0.01;
      base = next;
      this.priceHistory.push(base);
    }
  }

  private async checkSimulationFromRedis(): Promise<boolean> {
    if (!this.redis) return this.currentSimulation;
    try {
      const v = await this.redis.get("btc_trading:simulation_mode");
      if (v === "1" || v === "0") {
        this.currentSimulation = v === "1";
      }
    } catch {
      /* ignore */
    }
    return this.currentSimulation;
  }

  private maybeSwitchMarket(): void {
    if (!this.nextSwitchTime) return;
    const now = new Date();
    if (now < this.nextSwitchTime) return;

    if (this.waitingForMarketOpen) {
      this.waitingForMarketOpen = false;
      const m = this.markets[this.currentIndex];
      if (m) this.nextSwitchTime = new Date(m.endTimestamp * 1000);
      this.marketStable = true;
      this.lastTradeKey = -1;
      logger.info("Market open (was waiting) — ready to trade on next tick");
      return;
    }

    const next = this.currentIndex + 1;
    if (next >= this.markets.length) {
      logger.warn("No next market in list — reload Gamma");
      void loadBtc15mMarkets().then((m) => {
        this.markets = m;
        this.pickMarketSlot();
      });
      return;
    }
    const nm = this.markets[next]!;
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec < nm.marketTimestamp) {
      this.nextSwitchTime = new Date(nm.marketTimestamp * 1000);
      this.waitingForMarketOpen = true;
      return;
    }
    this.applyMarketIndex(next);
    this.marketStable = true;
    this.lastTradeKey = -1;
    logger.info({ slug: this.slug }, "Switched to next market");
    this.nextSwitchTime = new Date(nm.endTimestamp * 1000);
  }

  private isQuoteValid(bid: number, ask: number): boolean {
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) return false;
    if (bid < QUOTE_MIN_SPREAD || ask < QUOTE_MIN_SPREAD) return false;
    if (bid > 0.999 || ask > 0.999) return false;
    return true;
  }

  private async tick(): Promise<void> {
    this.maybeSwitchMarket();
    if (this.currentIndex < 0 || !this.yesTokenId) return;

    const book = await fetchBookMid(this.yesTokenId);
    if (!book) return;
    const { bid, ask, mid } = book;
    if (!this.isQuoteValid(bid, ask)) return;

    if (!this.marketStable) {
      this.marketStable = true;
    }

    this.priceHistory.push(mid);
    if (this.priceHistory.length > MAX_HISTORY) this.priceHistory.shift();
    const now = new Date();
    this.tickBuffer.push({ ts: now, price: mid });
    if (this.tickBuffer.length > TICK_BUFFER_MAX) this.tickBuffer.shift();
    this.lastBidAsk = [bid, ask];

    if (this.waitingForMarketOpen) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const elapsed = nowSec - this.marketTimestamp;
    if (elapsed < 0) return;

    const subInterval = Math.floor(elapsed / MARKET_INTERVAL_SEC);
    const tradeKey = `${this.marketTimestamp}_${subInterval}`;
    const secInSub = elapsed % MARKET_INTERVAL_SEC;

    const inWindow =
      secInSub >= TRADE_WINDOW_START &&
      secInSub < TRADE_WINDOW_END &&
      tradeKey !== String(this.lastTradeKey);

    if (!inWindow) return;

    this.lastTradeKey = tradeKey;
    logger.info(
      { slug: this.slug, mid, secInSub, tradeKey },
      "Late-window trade evaluation",
    );

    await this.makeTradingDecision(mid);
  }

  private async buildMetadata(mid: number): Promise<Record<string, unknown>> {
    const recent = this.priceHistory.slice(-20);
    const n = recent.length || 1;
    let sum = 0;
    for (const p of recent) sum += p;
    const sma = sum / n;
    const deviation = sma === 0
      ? 0
      : (mid - sma) / sma;
    const past = this.priceHistory[this.priceHistory.length - 5];
    const momentum =
      this.priceHistory.length >= 5 && past != null && past !== 0
        ? (mid - past) / past
        : 0;
    let varAcc = 0;
    for (const p of recent) {
      const d = p - sma;
      varAcc += d * d;
    }
    const variance = varAcc / n;
    const volatility = Math.sqrt(variance);

    const meta: Record<string, unknown> = {
      deviation,
      momentum,
      volatility,
      tick_buffer: [...this.tickBuffer],
      yes_token_id: this.yesTokenId,
    };

    const fg = await this.news.getFearGreedIndex();
    if (fg) {
      meta.sentiment_score = fg.value;
      meta.sentiment_classification = fg.classification;
    }

    const spot = await this.coinbase.getCurrentPrice();
    if (spot != null) meta.spot_price = spot;

    return meta;
  }

  private async collectSignals(
    currentPrice: number,
    meta: Record<string, unknown>,
  ): Promise<TradingSignal[]> {
    const out: TradingSignal[] = [];
    const hist = this.priceHistory;
    const add = (s: TradingSignal | null) => {
      if (s) out.push(s);
    };

    add(this.spike.process(currentPrice, hist, meta));
    if (meta.sentiment_score != null) {
      add(this.sentiment.process(currentPrice, hist, meta));
    }
    if (meta.spot_price != null) {
      add(this.divergence.process(currentPrice, hist, meta));
    }
    add(await this.orderbook.processAsync(currentPrice, meta));
    add(this.tickVel.process(currentPrice, hist, meta));
    add(await this.deribit.processAsync(currentPrice));
    return out;
  }

  private async makeTradingDecision(currentPrice: number): Promise<void> {
    const sim = await this.checkSimulationFromRedis();
    logger.info({ mode: sim ? "SIMULATION" : "LIVE" }, "Trading mode");

    if (this.priceHistory.length < 20) {
      logger.warn("Insufficient price history");
      return;
    }

    const metadata = await this.buildMetadata(currentPrice);
    const signals = await this.collectSignals(currentPrice, metadata);
    if (!signals.length) {
      logger.info("No signals — skip interval");
      return;
    }

    const fused = this.fusion.fuseSignals(signals, 1, 40);
    if (!fused) {
      logger.info("Fusion produced no actionable signal");
      return;
    }

    const positionUsd = env.marketBuyUsd;
    const trend = this.resolveTrend(currentPrice);
    if (!trend) {
      logger.info({ currentPrice }, "Trend neutral — skip");
      return;
    }

    const { direction, trendConfidence } = trend;
    const risk = this.risk.validateNewPosition(positionUsd, direction, currentPrice);
    if (!risk.ok) {
      logger.warn({ error: risk.error }, "Risk blocked");
      return;
    }

    if (this.lastBidAsk) {
      const [lb, la] = this.lastBidAsk;
      if (direction === "long" && la <= MIN_LIQUIDITY) {
        this.lastTradeKey = -1;
        return;
      }
      if (direction === "short" && lb <= MIN_LIQUIDITY) {
        this.lastTradeKey = -1;
        return;
      }
    }

    if (sim) {
      await this.recordPaperTrade(fused, positionUsd, currentPrice, direction, trendConfidence);
    } else {
      await this.placeLiveOrder(fused, positionUsd, direction);
    }
  }

  private resolveTrend(
    price: number,
  ): { direction: "long" | "short"; trendConfidence: number } | null {
    if (price > TREND_UP) return { direction: "long", trendConfidence: price };
    if (price < TREND_DOWN) return { direction: "short", trendConfidence: 1 - price };
    return null;
  }

  private async recordPaperTrade(
    fused: FusedSignal,
    sizeUsd: number,
    entry: number,
    direction: string,
    _trendConf: number,
  ): Promise<void> {
    const exitDeltaMin = this.options.testMode ? 1 : 15;
    const movement = (Math.random() - 0.5) * 0.1;
    let exit = entry * (1 + movement);
    if (exit > 0.99) exit = 0.99;
    if (exit < 0.01) exit = 0.01;
    const pnl =
      direction === "long"
        ? sizeUsd * ((exit - entry) / entry)
        : sizeUsd * ((entry - exit) / entry);
    const outcome = pnl > 0 ? "WIN" : "LOSS";
    this.paperTrades.push({
      timestamp: new Date().toISOString(),
      direction: direction.toUpperCase(),
      sizeUsd,
      price: entry,
      signalScore: fused.score,
      signalConfidence: fused.confidence,
      outcome,
    });
    this.performance.recordTrade({
      tradeId: `paper_${Date.now()}`,
      direction,
      entryPrice: entry,
      exitPrice: exit,
      size: sizeUsd,
      entryTime: new Date(),
      exitTime: new Date(Date.now() + exitDeltaMin * 60_000),
      signalScore: fused.score,
      signalConfidence: fused.confidence,
      metadata: { simulated: true },
    });
    if (this.options.enableGrafana) {
      this.grafana.incrementTradeCounter(pnl > 0, "paper");
    }
    try {
      writeFileSync("paper_trades.json", JSON.stringify(this.paperTrades, null, 2));
    } catch (e) {
      logger.error({ err: e }, "Failed to write paper_trades.json");
    }
    logger.info({ direction, entry, exit, pnl, outcome }, "Paper trade");
  }

  private async placeLiveOrder(
    fused: FusedSignal,
    usd: number,
    direction: "long" | "short",
  ): Promise<void> {
    void fused;
    const tokenId = direction === "long" ? this.yesTokenId : this.noTokenId;
    if (!tokenId) {
      logger.error("Missing token id for live order");
      return;
    }
    try {
      await this.execution.marketBuyUsd(tokenId, usd);
      this.performance.recordOrderEvent("placed");
    } catch (e) {
      logger.error({ err: e }, "Live order failed");
      this.performance.recordOrderEvent("rejected");
      this.lastTradeKey = -1;
    }
  }
}




