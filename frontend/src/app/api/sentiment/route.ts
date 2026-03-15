import { NextResponse } from "next/server";

/**
 * CryptoPanic sentiment proxy.
 * Requires CRYPTOPANIC_KEY in .env.local (free account at cryptopanic.com).
 * Returns { available: false } gracefully when no key is set.
 * Cached 5 min server-side to respect free-tier rate limits.
 */

const CODE_TO_ID: Record<string, string> = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  xrp: "ripple",
  bnb: "binancecoin",
  doge: "dogecoin",
  ada: "cardano",
  avax: "avalanche-2",
  link: "chainlink",
  dot: "polkadot",
};

interface CryptoPanicPost {
  currencies?: Array<{ code: string }>;
  votes: { positive: number; negative: number };
}

export async function GET() {
  const key = process.env.CRYPTOPANIC_KEY;

  if (!key) {
    return NextResponse.json({
      available: false,
      reason: "Ajoutez CRYPTOPANIC_KEY=votre_clé dans .env.local (compte gratuit sur cryptopanic.com)",
      coins: {},
      ts: Date.now(),
    });
  }

  try {
    const currencies = Object.keys(CODE_TO_ID).map((c) => c.toUpperCase()).join(",");
    const url =
      `https://cryptopanic.com/api/v1/posts/?auth_token=${key}` +
      `&currencies=${currencies}&kind=news&public=true`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 }, // 5 min
    });

    if (!res.ok) {
      return NextResponse.json({
        available: false,
        reason: `CryptoPanic HTTP ${res.status}`,
        coins: {},
        ts: Date.now(),
      });
    }

    const data = (await res.json()) as { results?: CryptoPanicPost[] };

    // Aggregate positive / negative votes per coin
    const votes: Record<string, { pos: number; neg: number }> = {};
    for (const post of data.results ?? []) {
      for (const currency of post.currencies ?? []) {
        const code = currency.code.toLowerCase();
        if (!CODE_TO_ID[code]) continue;
        const v = votes[code] ?? { pos: 0, neg: 0 };
        v.pos += post.votes.positive || 0;
        v.neg += post.votes.negative || 0;
        votes[code] = v;
      }
    }

    // Compute 0-100 sentiment per coinGecko ID
    const coins: Record<string, number> = {};
    for (const [code, coinId] of Object.entries(CODE_TO_ID)) {
      const v = votes[code];
      if (v) {
        const total = v.pos + v.neg;
        coins[coinId] = total > 0 ? Math.round((v.pos / total) * 100) : 50;
      } else {
        coins[coinId] = 50; // neutral default
      }
    }

    return NextResponse.json({ available: true, coins, ts: Date.now() });
  } catch {
    return NextResponse.json({
      available: false,
      reason: "Erreur réseau CryptoPanic",
      coins: {},
      ts: Date.now(),
    });
  }
}
