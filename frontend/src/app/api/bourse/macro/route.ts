import { NextResponse } from "next/server";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

const FOREX_SYMBOLS = "EURUSD=X,GBPUSD=X,USDJPY=X,USDCHF=X,AUDUSD=X,USDCAD=X";
const COMMODITY_SYMBOLS = "GC=F,SI=F,CL=F,BZ=F,NG=F,ZW=F";
const MACRO_SYMBOLS = "^TNX,^VIX,DX-Y.NYB,^IRX";

function parseQuotes(results: Record<string, unknown>[]) {
  return results.map((r) => ({
    symbol:      String(r.symbol ?? ""),
    shortName:   String(r.shortName ?? r.symbol ?? ""),
    price:       Number(r.regularMarketPrice ?? 0),
    change:      Number(r.regularMarketChange ?? 0),
    changePct:   Number(r.regularMarketChangePercent ?? 0),
    currency:    String(r.currency ?? "USD"),
    marketState: String(r.marketState ?? "CLOSED"),
  }));
}

async function fetchQuotes(symbols: string) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?lang=en-US&region=US&symbols=${encodeURIComponent(symbols)}`;
  const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 120 } });
  if (!res.ok) return [];
  const raw = await res.json() as { quoteResponse?: { result?: unknown[] } };
  return parseQuotes((raw.quoteResponse?.result ?? []) as Record<string, unknown>[]);
}

async function fetchCnnFearGreed() {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": YF_HEADERS["User-Agent"] },
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const data = await res.json() as { fear_and_greed?: { score?: number; rating?: string } };
    const fg = data.fear_and_greed;
    if (!fg?.score) return null;
    return { score: Math.round(Number(fg.score)), rating: String(fg.rating ?? "") };
  } catch { return null; }
}

async function fetchCryptoFearGreed() {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", { next: { revalidate: 900 } });
    if (!res.ok) return null;
    const data = await res.json() as { data?: { value?: string; value_classification?: string }[] };
    const d = data.data?.[0];
    if (!d) return null;
    return { score: Number(d.value ?? 0), rating: String(d.value_classification ?? "") };
  } catch { return null; }
}

/**
 * Macro data: forex, commodities, macro indicators, Fear & Greed (CNN + crypto).
 * GET /api/bourse/macro
 * Cached 60s.
 */
export async function GET() {
  const [forex, commodities, macro, cnn, crypto] = await Promise.allSettled([
    fetchQuotes(FOREX_SYMBOLS),
    fetchQuotes(COMMODITY_SYMBOLS),
    fetchQuotes(MACRO_SYMBOLS),
    fetchCnnFearGreed(),
    fetchCryptoFearGreed(),
  ]);

  return NextResponse.json({
    forex:       forex.status       === "fulfilled" ? forex.value       : [],
    commodities: commodities.status === "fulfilled" ? commodities.value : [],
    macro:       macro.status       === "fulfilled" ? macro.value       : [],
    fearGreed: {
      cnn:    cnn.status    === "fulfilled" ? cnn.value    : null,
      crypto: crypto.status === "fulfilled" ? crypto.value : null,
    },
    fetchedAt: Date.now(),
  });
}
