import { NextResponse } from "next/server";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

/**
 * Yahoo Finance v8 OHLC proxy.
 * GET /api/bourse/ohlc?symbol=AAPL&interval=1d&range=3mo
 * Returns OHLCBar[] — time in UTC seconds.
 * Cached 5min server-side.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol   = searchParams.get("symbol")   ?? "^GSPC";
  const interval = searchParams.get("interval") ?? "1d";
  const range    = searchParams.get("range")    ?? "3mo";

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=false`;

  try {
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return NextResponse.json({ error: `YF ${res.status}` }, { status: 502 });

    const raw = await res.json() as {
      chart?: { result?: {
        timestamp?: number[];
        indicators?: { quote?: { open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }[] };
      }[] };
    };

    const result = raw.chart?.result?.[0];
    if (!result) return NextResponse.json([], { status: 200 });

    const timestamps = result.timestamp ?? [];
    const q          = result.indicators?.quote?.[0] ?? {};
    const opens      = q.open    ?? [];
    const highs      = q.high    ?? [];
    const lows       = q.low     ?? [];
    const closes     = q.close   ?? [];
    const volumes    = q.volume  ?? [];

    const bars = timestamps
      .map((t, i) => ({
        time:   t,
        open:   opens[i],
        high:   highs[i],
        low:    lows[i],
        close:  closes[i],
        volume: volumes[i] ?? undefined,
      }))
      .filter((b) => b.open != null && b.close != null && b.high != null && b.low != null);

    return NextResponse.json(bars);
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
