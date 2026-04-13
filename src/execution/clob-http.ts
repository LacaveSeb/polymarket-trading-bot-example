const CLOB = "https://clob.polymarket.com";

export interface BookQuote {
  bid: number;
  ask: number;
  mid: number;
}

export async function fetchBookMid(tokenId: string): Promise<BookQuote | null> {
  try {
    const url = new URL(`${CLOB}/book`);
    url.searchParams.set("token_id", tokenId);
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const j = (await resp.json()) as {
      bids?: Array<{ price: string }>;
      asks?: Array<{ price: string }>;
    };
    const bestBid = j.bids?.[0] ? Number(j.bids[0]!.price) : NaN;
    const bestAsk = j.asks?.[0] ? Number(j.asks[0]!.price) : NaN;
    if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return null;
    return { bid: bestBid, ask: bestAsk, mid: (bestBid + bestAsk) / 2 };
  } catch {
    return null;
  }
}




