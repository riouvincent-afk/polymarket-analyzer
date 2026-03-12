"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { fetchMarkets } from "@/lib/api";
import { Market } from "@/lib/types";
import {
  moneyprinterscore, signalBreakdown, signalTier,
  TIER_STYLE, SignalTier,
} from "@/lib/score";

/* ─── Types ─── */
interface CoinPrice { id: string; symbol: string; name: string; current_price: number; }

interface Divergence {
  market: Market;
  coin: { symbol: string; name: string };
  currentPrice: number;
  target: number | null;
  direction: "up" | "down" | "unknown";
  type: "lagging_yes" | "lagging_no" | "far_below" | "context";
  gap: number;            // 0-1, how misaligned
  explanation: string;
}

/* ─── Helpers ─── */
function fmtV(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtP(n: number) {
  if (n >= 1e6) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1)   return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtShort(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/* ─── Divergence engine ─── */
const CRYPTO_MAP = [
  { keywords: ["bitcoin", "btc"], id: "bitcoin",  symbol: "BTC", name: "Bitcoin"  },
  { keywords: ["ethereum", "eth", "ether"], id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { keywords: ["solana", "sol"], id: "solana",   symbol: "SOL", name: "Solana"   },
];

function detectCoin(question: string) {
  const q = question.toLowerCase();
  return CRYPTO_MAP.find((c) => c.keywords.some((kw) => q.includes(kw))) ?? null;
}

function extractTarget(question: string): number | null {
  const q = question.replace(/,/g, "");
  const m = q.match(/\$\s*(\d+(?:\.\d+)?)\s*([KkMm]?)\b/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const sfx = m[2].toUpperCase();
  if (sfx === "K") n *= 1_000;
  if (sfx === "M") n *= 1_000_000;
  return n >= 500 ? n : null;
}

function detectDirection(question: string): "up" | "down" | "unknown" {
  const q = question.toLowerCase();
  if (/\b(?:exceed|above|over|reach|hit|surpass|top|cross|break|pass|rise|gain)\b/.test(q)) return "up";
  if (/\b(?:below|under|fall|drop|lose|decline|crash|miss|dip|sink)\b/.test(q)) return "down";
  return "unknown";
}

function buildDivergence(
  market: Market,
  coin: typeof CRYPTO_MAP[number],
  currentPrice: number,
): Divergence | null {
  const target    = extractTarget(market.question);
  const direction = detectDirection(market.question);
  const yesPct    = market.yes_price;

  let type: Divergence["type"] = "context";
  let gap = 0;
  let explanation = "";

  if (target && direction !== "unknown") {
    if (direction === "up") {
      if (currentPrice > target * 1.02) {
        // Price already above target — YES should be ~95%+
        gap = Math.max(0, 0.90 - yesPct);
        if (gap > 0.15) {
          type = "lagging_yes";
          explanation = `${coin.symbol} à ${fmtP(currentPrice)} > objectif ${fmtShort(target)}. YES devrait être proche de 100% mais Polymarket l'affiche à ${Math.round(yesPct * 100)}%.`;
        }
      } else if (currentPrice < target * 0.60) {
        // Price far below — YES is unexpectedly high
        gap = Math.max(0, yesPct - 0.45);
        if (gap > 0.15) {
          type = "far_below";
          explanation = `${coin.symbol} à ${fmtP(currentPrice)} — loin de l'objectif ${fmtShort(target)} (+${((target / currentPrice - 1) * 100).toFixed(0)}% requis). YES à ${Math.round(yesPct * 100)}% semble élevé.`;
        }
      }
    } else if (direction === "down") {
      if (currentPrice < target * 0.98) {
        gap = Math.max(0, 0.90 - yesPct);
        if (gap > 0.15) {
          type = "lagging_yes";
          explanation = `${coin.symbol} à ${fmtP(currentPrice)} < objectif ${fmtShort(target)}. YES devrait être élevé mais Polymarket l'affiche à ${Math.round(yesPct * 100)}%.`;
        }
      }
    }
  }

  return {
    market, coin, currentPrice, target, direction, type, gap, explanation,
  };
}

/* ─── Sub-components ─── */
function BreakdownBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-[72px] shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

function SignalCard({ market, rank }: { market: Market; rank: number }) {
  const score = moneyprinterscore(market);
  const tier  = signalTier(score);
  const style = TIER_STYLE[tier];
  const bd    = signalBreakdown(market);
  const yesPct = Math.round(market.yes_price * 100);

  const bdItems = [
    { label: "Vélocité",    value: bd.velocity,  color: "bg-yellow-500" },
    { label: "Volume 24h",  value: bd.volume,    color: "bg-blue-500"   },
    { label: "Liquidité",   value: bd.liquidity, color: "bg-purple-500" },
    { label: "Incertitude", value: bd.proximity, color: "bg-emerald-500" },
  ];

  return (
    <Link
      href={`/markets/${market.id}`}
      style={{ animationDelay: `${Math.min(rank * 35, 400)}ms` }}
      className={[
        "group flex gap-4 rounded-2xl p-4 border transition-all duration-200 animate-fade-slide-up",
        "hover:scale-[1.01] hover:shadow-lg hover:shadow-black/30 cursor-pointer overflow-hidden",
        style.border, style.bg,
      ].join(" ")}
    >
      {/* Score circle */}
      <div className="shrink-0 flex flex-col items-center justify-center w-14">
        <span className={`text-3xl font-black tabular-nums ${style.scoreColor}`}>{score}</span>
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full mt-1 ${style.badge}`}>
          {tier === "hot" ? "HOT" : tier === "watch" ? "WATCH" : "LOW"}
        </span>
      </div>

      {/* Divider */}
      <div className={`w-px self-stretch ${tier === "hot" ? "bg-emerald-500/20" : tier === "watch" ? "bg-orange-500/20" : "bg-gray-800"}`} />

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Question + prices */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-white text-sm font-semibold leading-snug line-clamp-2 group-hover:text-gray-100 transition-colors">
            {market.question}
          </p>
          <div className="shrink-0 flex items-center gap-2 text-xs font-bold">
            <span className="text-emerald-400">YES {yesPct}%</span>
            <span className="text-gray-600">/</span>
            <span className="text-red-400">NO {100 - yesPct}%</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {bdItems.map((b) => (
            <BreakdownBar key={b.label} {...b} />
          ))}
        </div>

        {/* Stats footer */}
        <div className="flex gap-4 text-[10px] pt-1 border-t border-gray-800/60">
          <span className="text-gray-500">Vol 24h <span className="text-gray-300 font-medium">{fmtV(market.volume24h)}</span></span>
          <span className="text-gray-500">Liquidité <span className="text-gray-300 font-medium">{fmtV(market.liquidity)}</span></span>
          {market.end_date && (
            <span className="text-gray-500">
              Clôture <span className="text-gray-300 font-medium">
                {new Date(market.end_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function DivergenceCard({ d, index }: { d: Divergence; index: number }) {
  const yesPct = Math.round(d.market.yes_price * 100);
  const hasDivergence = d.type !== "context" && d.gap > 0;

  return (
    <div
      style={{ animationDelay: `${index * 50}ms` }}
      className={[
        "animate-fade-slide-up rounded-2xl p-4 border flex flex-col gap-3",
        hasDivergence
          ? "bg-red-500/5 border-red-500/25"
          : "bg-gray-900 border-gray-800",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${hasDivergence ? "bg-red-500/20 text-red-300 border border-red-500/30" : "bg-gray-700/50 text-gray-400 border border-gray-700"}`}>
            {d.coin.symbol}
          </span>
          {hasDivergence && (
            <span className="text-[11px] font-bold text-red-400 flex items-center gap-1">
              ⚠ Divergence {Math.round(d.gap * 100)}pp
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500">Prix actuel</p>
          <p className="text-sm font-bold text-white">{fmtP(d.currentPrice)}</p>
        </div>
      </div>

      {/* Market question */}
      <Link href={`/markets/${d.market.id}`} className="group/q">
        <p className="text-sm text-gray-300 leading-snug line-clamp-2 group-hover/q:text-white transition-colors">
          {d.market.question}
        </p>
      </Link>

      {/* Target vs current */}
      {d.target && (
        <div className="flex items-center gap-3 text-xs">
          <div className="flex-1 bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-500 mb-0.5">Objectif détecté</p>
            <p className="font-bold text-white">{fmtShort(d.target)}</p>
          </div>
          <div className={`text-lg font-black ${d.direction === "up" ? (d.currentPrice > d.target ? "text-emerald-400" : "text-gray-500") : (d.currentPrice < d.target ? "text-emerald-400" : "text-gray-500")}`}>
            {d.direction === "up" ? "↑" : d.direction === "down" ? "↓" : "?"}
          </div>
          <div className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-right">
            <p className="text-[10px] text-gray-500 mb-0.5">Polymarket YES</p>
            <p className="font-bold text-emerald-400">{yesPct}%</p>
          </div>
        </div>
      )}

      {/* Explanation */}
      {d.explanation && (
        <p className="text-[11px] text-red-300/80 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/15">
          {d.explanation}
        </p>
      )}

      {/* Stats */}
      <div className="flex gap-3 text-[10px] pt-1 border-t border-gray-800/60">
        <span className="text-gray-500">Vol 24h <span className="text-gray-300">{fmtV(d.market.volume24h)}</span></span>
        <span className="text-gray-500">Liq <span className="text-gray-300">{fmtV(d.market.liquidity)}</span></span>
      </div>
    </div>
  );
}

function TierSection({
  tier, markets, defaultOpen = true,
}: { tier: SignalTier; markets: Market[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const style = TIER_STYLE[tier];
  if (markets.length === 0) return null;

  return (
    <section className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${style.badge}`}>
            {markets.length}
          </span>
          <span className="text-base font-bold text-white">{style.label}</span>
          <span className="text-[11px] text-gray-500">{style.sub}</span>
        </div>
        <span className="text-gray-500 group-hover:text-white transition-colors text-sm">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-2">
          {markets.map((m, i) => (
            <SignalCard key={m.id} market={m} rank={i} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Page ─── */
export default function SignalsPage() {
  const [markets,    setMarkets]    = useState<Market[]>([]);
  const [cryptos,    setCryptos]    = useState<CoinPrice[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [mktRes, cryptoRes] = await Promise.all([
        fetchMarkets({ limit: 100, offset: 0, order: "volume24h", closed: false }),
        fetch("/api/crypto").then((r) => r.ok ? r.json() : []),
      ]);
      setMarkets(mktRes.markets);
      setCryptos(Array.isArray(cryptoRes) ? cryptoRes : []);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* Scored + sorted markets */
  const scored = useMemo(
    () => [...markets]
      .map((m) => ({ m, s: moneyprinterscore(m) }))
      .sort((a, b) => b.s - a.s),
    [markets],
  );

  const hot   = scored.filter(({ s }) => s >= 70).map(({ m }) => m);
  const watch = scored.filter(({ s }) => s >= 40 && s < 70).map(({ m }) => m);
  const low   = scored.filter(({ s }) => s < 40).map(({ m }) => m);

  /* Divergences */
  const divergences = useMemo((): Divergence[] => {
    if (!cryptos.length || !markets.length) return [];
    const results: Divergence[] = [];

    for (const market of markets) {
      const coin = detectCoin(market.question);
      if (!coin) continue;
      const coinData = cryptos.find((c) => c.id === coin.id);
      if (!coinData) continue;
      const d = buildDivergence(market, coin, coinData.current_price);
      if (d) results.push(d);
    }

    // Sort: real divergences first, then context
    return results
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 12);
  }, [markets, cryptos]);

  const realDivergences = divergences.filter((d) => d.type !== "context" && d.gap > 0);

  const avgScore = scored.length
    ? Math.round(scored.reduce((s, { s: sc }) => s + sc, 0) / scored.length)
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">

        {/* Page header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="text-emerald-400">Moneyprinter</span>{" "}
              <span className="text-white">Signals</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Score basé sur vélocité · volume 24h · liquidité · écart de probabilité
            </p>
          </div>
          {lastUpdate && (
            <button onClick={load} className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </button>
          )}
        </div>

        {/* Stats overview */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Marchés analysés",      value: markets.length.toString(),  accent: "text-white"        },
              { label: "Opportunités (≥ 70)",   value: hot.length.toString(),       accent: "text-emerald-400" },
              { label: "À surveiller (40–69)",  value: watch.length.toString(),     accent: "text-orange-400"  },
              { label: "Score moyen",           value: avgScore.toString(),         accent: "text-blue-400"    },
            ].map(({ label, value, accent }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest mb-1.5">{label}</p>
                <p className={`text-2xl font-black ${accent}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Signal tiers */}
        {!loading && (
          <div className="space-y-8">
            <TierSection tier="hot"   markets={hot}   defaultOpen />
            <TierSection tier="watch" markets={watch} defaultOpen />
            <TierSection tier="low"   markets={low}   defaultOpen={false} />
          </div>
        )}

        {/* Divergences section */}
        {!loading && divergences.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-base font-bold text-white">Divergences Crypto</h2>
              {realDivergences.length > 0 ? (
                <span className="text-[11px] bg-red-500/15 text-red-300 border border-red-500/25 px-2 py-0.5 rounded-full font-semibold">
                  {realDivergences.length} désaccord{realDivergences.length > 1 ? "s" : ""} détecté{realDivergences.length > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-[11px] text-gray-500">
                  Marchés crypto Polymarket vs prix réels
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600">
              Comparaison entre les probabilités Polymarket et les prix live BTC/ETH/SOL.
              Une divergence indique un potentiel désaccord entre le marché de prédiction et le marché crypto réel.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {divergences.map((d, i) => (
                <DivergenceCard key={d.market.id} d={d} index={i} />
              ))}
            </div>
          </section>
        )}

        {!loading && divergences.length === 0 && !loading && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">Divergences Crypto</h2>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
              <p className="text-gray-500 text-sm">Aucun marché BTC/ETH/SOL détecté dans les 100 marchés les plus actifs.</p>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
