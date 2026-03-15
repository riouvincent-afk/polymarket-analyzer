import { NextResponse } from "next/server";

/**
 * Yahoo Finance news proxy.
 * GET /api/bourse/news?q=earnings+market
 * Cached 15min.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "stock market earnings economy";

  const url =
    `https://query2.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(q)}&newsCount=20&quotesCount=0&enableFuzzyQuery=false&lang=en-US&region=US`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 900 },
    });
    if (!res.ok) return NextResponse.json({ error: `YF ${res.status}` }, { status: 502 });

    const raw = await res.json() as { news?: unknown[] };
    const items = (raw.news ?? []) as Record<string, unknown>[];

    const news = items.map((n) => ({
      uuid:      String(n.uuid ?? Math.random().toString(36).slice(2)),
      title:     String(n.title ?? ""),
      publisher: String(n.publisher ?? ""),
      link:      String(n.link ?? ""),
      publishedAt: Number(n.providerPublishTime ?? 0),
      thumbnail: (() => {
        const t = n.thumbnail as { resolutions?: { url: string }[] } | undefined;
        return t?.resolutions?.[0]?.url ?? null;
      })(),
    })).filter((n) => n.title);

    return NextResponse.json(news);
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
}
