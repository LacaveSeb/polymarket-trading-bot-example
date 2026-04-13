import { ClobClient, OrderType, Side, SignatureType, type ApiKeyCreds } from "@polymarket/clob-client";
import { Wallet } from "ethers";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Live order path using official `@polymarket/clob-client` (replaces Nautilus + py_clob_client).
 * BUY `amount` is USD for market buys per SDK `UserMarketOrder`.
 */
export class PolymarketExecutionService {
  private client: ClobClient | null = null;

  async connect(): Promise<boolean> {
    const pk = env.polymarketPk;
    if (!pk) {
      logger.error("Missing POLYMARKET_PK for live execution");
      return false;
    }
    const normalizedPk = pk.startsWith("0x") ? pk : `0x${pk}`;
    const wallet = new Wallet(normalizedPk);
    const host = "https://clob.polymarket.com";
    const { chainId, polymarketFunder: funder } = env;

    let creds: ApiKeyCreds;
    try {
      if (env.polymarketApiKey && env.polymarketApiSecret && env.polymarketPassphrase) {
        creds = {
          key: env.polymarketApiKey,
          secret: env.polymarketApiSecret,
          passphrase: env.polymarketPassphrase,
        };
      } else {
        const signerOnly = new ClobClient(host, chainId, wallet, undefined, SignatureType.POLY_PROXY, funder);
        creds = await signerOnly.createOrDeriveApiKey();
        logger.info("CLOB API credentials created or derived for this session");
      }

      this.client = new ClobClient(host, chainId, wallet, creds, SignatureType.POLY_PROXY, funder);
      await this.client.getOk();
      logger.info({ address: wallet.address }, "Polymarket CLOB client ready");
      return true;
    } catch (e) {
      logger.error({ err: e }, "CLOB connect failed");
      this.client = null;
      return false;
    }
  }

  /** Market BUY up to `usdAmount` (FAK), on the outcome `tokenId`. */
  async marketBuyUsd(tokenId: string, usdAmount: number): Promise<unknown> {
    if (!this.client) throw new Error("CLOB client not initialized");
    const tickSize = await this.client.getTickSize(tokenId);
    const negRisk = await this.client.getNegRisk(tokenId);
    const res = await this.client.createAndPostMarketOrder(
      {
        tokenID: tokenId,
        amount: usdAmount,
        side: Side.BUY,
        orderType: OrderType.FAK,
      },
      { tickSize, negRisk },
      OrderType.FAK,
    );
    logger.info({ tokenId: tokenId.slice(0, 12), usdAmount, res }, "Market order submitted");
    return res;
  }
}




