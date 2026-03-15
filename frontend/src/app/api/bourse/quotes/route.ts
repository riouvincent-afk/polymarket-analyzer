import { NextResponse } from "next/server";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Yahoo Finance v7 quotes proxy.
 * GET /api/bourse/quotes?symbols=^GSPC,AAPL,EURUSD=X
 * Cached 60s server-side.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get("symbols") ?? "";
  if (!symbols) return NextResponse.json({ error: "Missing symbols" }, { status: 400 });

  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote` +
    `?lang=en-US&region=US&symbols=${encodeURIComponent(symbols)}`;

  try {
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 120 } });
    if (!res.ok) return NextResponse.json({ error: `YF ${res.status}` }, { status: 502 });

    const raw = await res.json() as { quoteResponse?: { result?: unknown[] } };
    const results = raw.quoteResponse?.result ?? [];

    const quotes = (results as Record<string, unknown>[]).map((r) => ({
      symbol:                     String(r.symbol ?? ""),
      shortName:                  String(r.shortName ?? r.symbol ?? ""),
      longName:                   r.longName ? String(r.longName) : undefined,
      regularMarketPrice:         Number(r.regularMarketPrice ?? 0),
      regularMarketChange:        Number(r.regularMarketChange ?? 0),
      regularMarketChangePercent: Number(r.regularMarketChangePercent ?? 0),
      regularMarketPreviousClose: Number(r.regularMarketPreviousClose ?? 0),
      regularMarketOpen:          r.regularMarketOpen != null ? Number(r.regularMarketOpen) : null,
      regularMarketDayHigh:       r.regularMarketDayHigh != null ? Number(r.regularMarketDayHigh) : null,
      regularMarketDayLow:        r.regularMarketDayLow != null ? Number(r.regularMarketDayLow) : null,
      regularMarketVolume:        r.regularMarketVolume != null ? Number(r.regularMarketVolume) : null,
      fiftyTwoWeekHigh:           r.fiftyTwoWeekHigh != null ? Number(r.fiftyTwoWeekHigh) : null,
      fiftyTwoWeekLow:            r.fiftyTwoWeekLow != null ? Number(r.fiftyTwoWeekLow) : null,
      marketCap:                  r.marketCap != null ? Number(r.marketCap) : null,
      trailingPE:                 r.trailingPE != null ? Number(r.trailingPE) : null,
      dividendYield:              r.dividendYield != null ? Number(r.dividendYield) : null,
      marketState:                String(r.marketState ?? "CLOSED"),
      currency:                   String(r.currency ?? "USD"),
      exchange:                   String(r.fullExchangeName ?? r.exchange ?? ""),
      quoteType:                  String(r.quoteType ?? "EQUITY"),
    }));

    return NextResponse.json(quotes);
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
