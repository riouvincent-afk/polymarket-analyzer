import { NextResponse } from "next/server";

/**
 * CoinGecko OHLC proxy.
 * GET /api/crypto/ohlc?id=bitcoin&days=30
 * Returns [[timestamp_ms, open, high, low, close], ...]
 * Cached 60s server-side.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id   = searchParams.get("id")   ?? "bitcoin";
  const days = searchParams.get("days") ?? "30";

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${days}`;

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
