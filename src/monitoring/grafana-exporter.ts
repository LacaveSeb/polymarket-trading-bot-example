import http from "node:http";
import client from "prom-client";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

export class GrafanaExporter {
  private server: http.Server | null = null;
  private readonly register: client.Registry;

  private readonly tradesWon: client.Counter<"source">;
  private readonly tradesLost: client.Counter<"source">;

  constructor() {
    this.register = new client.Registry();
    client.collectDefaultMetrics({ register: this.register });
    this.tradesWon = new client.Counter({
      name: "bot_trades_won_total",
      help: "Paper/live wins",
      labelNames: ["source"],
      registers: [this.register],
    });
    this.tradesLost = new client.Counter({
      name: "bot_trades_lost_total",
      help: "Paper/live losses",
      labelNames: ["source"],
      registers: [this.register],
    });
  }

  async start(): Promise<void> {
    const port = env.grafanaPort;
    this.server = http.createServer(async (req, res) => {
      if (req.url === "/metrics") {
        res.setHeader("Content-Type", this.register.contentType);
        res.end(await this.register.metrics());
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, () => {
        logger.info({ port }, "Prometheus metrics listening");
        resolve();
      });
      this.server!.on("error", reject);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }

  incrementTradeCounter(won: boolean, source = "bot"): void {
    if (won) this.tradesWon.inc({ source });
    else this.tradesLost.inc({ source });
  }
}

let gSingleton: GrafanaExporter | null = null;

export function getGrafanaExporter(): GrafanaExporter {
  gSingleton ??= new GrafanaExporter();
  return gSingleton;
}




