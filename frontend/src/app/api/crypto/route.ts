import { NextResponse } from "next/server";

const COINS = [
  "bitcoin", "ethereum", "solana", "binancecoin", "ripple",
  "cardano", "avalanche-2", "chainlink", "polkadot", "matic-network",
].join(",");

export async function GET() {
  const url =
    `https://api.coingecko.com/api/v3/coins/markets` +
    `?vs_currency=usd&ids=${COINS}&order=market_cap_desc` +
    `&price_change_percentage=7d&sparkline=false`;

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
