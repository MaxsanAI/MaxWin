export const onRequestGet: PagesFunction = async () => {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Could not retrieve the live SOL/USD rate." }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    const data = await response.json() as { solana?: { usd?: number } };
    const solUsd = data.solana?.usd;
    if (typeof solUsd !== "number" || !Number.isFinite(solUsd) || solUsd <= 0) {
      return new Response(JSON.stringify({ error: "The SOL/USD provider returned an invalid rate." }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    return new Response(JSON.stringify({ asset: "SOL", quoteCurrency: "USD", solUsd, updatedAt: new Date().toISOString() }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch {
    return new Response(JSON.stringify({ error: "Live SOL/USD rate is temporarily unavailable." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
};
