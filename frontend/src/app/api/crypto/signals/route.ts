import { NextResponse } from "next/server";

/**
 * Top-100 coins with sparkline (7-day hourly) and 24h/7d % changes.
 * Used by BotContext for multi-strategy signal analysis.
 * Cached server-side for 60 s to respect CoinGecko free-tier rate limits.
 */
export async function GET() {
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    "?vs_currency=usd&order=market_cap_desc&per_page=100&page=1" +
    "&sparkline=true&price_change_percentage=24h,7d";

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `CoinGecko ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
