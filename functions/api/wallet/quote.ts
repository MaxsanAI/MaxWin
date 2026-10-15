async function fetchValidPrice(url: string, extract: (data: any) => unknown): Promise<number | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 20, cacheEverything: true }
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const value = extract(data);
    const price = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function getSolUsd(): Promise<{ price: number; source: string } | null> {
  const providers: Array<{ source: string; url: string; extract: (data: any) => unknown }> = [
    {
      source: "CoinGecko",
      url: "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      extract: data => data?.solana?.usd
    },
    {
      source: "Binance SOL/USDT",
      url: "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      extract: data => data?.price
    },
    {
      source: "Kraken SOL/USD",
      url: "https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
      extract: data => {
        const result = data?.result;
        if (!result || typeof result !== "object") return null;
        const pair = Object.values(result)[0] as { c?: unknown[] } | undefined;
        return pair?.c?.[0];
      }
    }
  ];
  for (const provider of providers) {
    const price = await fetchValidPrice(provider.url, provider.extract);
    if (price !== null) return { price, source: provider.source };
  }
  return null;
}

export const onRequestGet: PagesFunction = async () => {
  const quote = await getSolUsd();
  if (!quote) {
    return new Response(JSON.stringify({ error: "Could not retrieve the live SOL/USD rate from any price provider." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
  return new Response(JSON.stringify({ asset: "SOL", quoteCurrency: "USD", solUsd: quote.price, source: quote.source, updatedAt: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
};
