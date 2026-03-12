"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { fetchMarkets } from "@/lib/api";
import { Market } from "@/lib/types";
import { moneyprinterscore, signalBreakdown, potentialYield } from "@/lib/score";

/* ══════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════ */
interface CoinData {
  id: string; symbol: string; name: string; image: string;
  current_price: number; market_cap: number; total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
}

type Direction     = "LONG" | "SHORT" | "NEUTRE";
type ConfLevel     = "ÉLEVÉE" | "MOYENNE" | "FAIBLE";
type DivSeverity   = "FORT" | "MODÉRÉ" | "FAIBLE";

interface CryptoSignal {
  coin: CoinData;
  direction: Direction;
  confidence: ConfLevel;
  confScore: number;        // 0–100
  momentum: number;         // weighted momentum %
  change24h: number;
  change7d: number;
  reasons: string[];
}

interface PolyOpportunity {
  market: Market;
  rank: number;
  score: number;
  side: "YES" | "NO";
  sidePrice: number;
  profit10: number;         // profit on $10 bet
  roi: number;              // ROI %
  reasons: string[];
}

interface Divergence {
  market: Market;
  coinSymbol: string;
  coinId: string;
  currentPrice: number;
  targetPrice: number | null;
  polyImplied: "bullish" | "bearish";   // what Polymarket says
  cryptoMomentum: "bullish" | "bearish"; // what crypto says
  yesPct: number;
  momentumPct: number;
  gap: number;               // 0–100
  severity: DivSeverity;
  alert: string;
  arbitrage: string;
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function fmtPrice(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}
function fmtVol(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtShort(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function sign(n: number) { return n >= 0 ? "+" : ""; }

/* ══════════════════════════════════════════════
   SIGNAL ENGINE — CRYPTO
══════════════════════════════════════════════ */
function buildCryptoSignal(coin: CoinData): CryptoSignal {
  const d  = coin.price_change_percentage_24h ?? 0;
  const w  = coin.price_change_percentage_7d_in_currency ?? 0;
  const m  = d * 0.6 + (w / 7) * 0.4;          // weighted momentum

  const turnover  = coin.market_cap > 0 ? coin.total_volume / coin.market_cap : 0;
  const highVol   = turnover > 0.03;
  const consistent = (d > 0 && w > 0) || (d < 0 && w < 0);

  let direction: Direction;
  let base: number;
  if (Math.abs(m) < 0.5)        { direction = "NEUTRE"; base = 20; }
  else if (m > 0)                { direction = "LONG";   base = m > 2.5 ? 65 : m > 1.2 ? 50 : 33; }
  else                           { direction = "SHORT";  base = m < -2.5 ? 65 : m < -1.2 ? 50 : 33; }

  let cs = base + (consistent ? 15 : 0) + (highVol ? 10 : 0);
  cs = Math.min(93, cs);
  const confidence: ConfLevel = cs >= 65 ? "ÉLEVÉE" : cs >= 45 ? "MOYENNE" : "FAIBLE";

  const reasons: string[] = [
    `Variation 24h : ${sign(d)}${d.toFixed(2)}%`,
    `Tendance 7j : ${sign(w)}${w.toFixed(2)}%`,
  ];
  if (consistent)  reasons.push("Signaux 24h/7j concordants ✓");
  else             reasons.push("Signaux 24h/7j divergents — prudence");
  if (highVol)     reasons.push("Volume anormalement élevé");

  return { coin, direction, confidence, confScore: cs, momentum: m, change24h: d, change7d: w, reasons };
}

/* ══════════════════════════════════════════════
   SIGNAL ENGINE — POLYMARKET
══════════════════════════════════════════════ */
function buildOpportunity(market: Market, rank: number): PolyOpportunity {
  const score  = moneyprinterscore(market);
  const bd     = signalBreakdown(market);
  const yesPct = Math.round(market.yes_price * 100);
  const yld    = potentialYield(market);

  // Prefer the more uncertain side (closer to 50%)
  const side: "YES" | "NO"  = market.yes_price <= 0.5 ? "YES" : "NO";
  const sidePrice = side === "YES" ? market.yes_price : market.no_price;
  const profit10  = 10 / sidePrice - 10;
  const roi       = profit10 * 10;

  const reasons: string[] = [];
  if (bd.velocity  > 60) reasons.push(`Marché très actif — vélocité ${bd.velocity}/100`);
  if (bd.volume    > 70) reasons.push(`Fort volume 24h (${fmtVol(market.volume24h)})`);
  if (bd.liquidity > 65) reasons.push(`Bonne liquidité (${fmtVol(market.liquidity)})`);
  if (bd.proximity > 70) reasons.push(`Prix proche de 50/50 — YES ${yesPct}%`);
  else if (bd.proximity > 35) reasons.push(`Résultat incertain — YES ${yesPct}%`);
  reasons.push(`Rendement : $10 sur ${side} → +$${profit10.toFixed(1)} (+${roi.toFixed(0)}%)`);

  return { market, rank, score, side, sidePrice, profit10, roi, reasons };
}

/* ══════════════════════════════════════════════
   SIGNAL ENGINE — DIVERGENCES
══════════════════════════════════════════════ */
const CRYPTO_MAP = [
  { keywords: ["bitcoin", "btc"],          id: "bitcoin",  symbol: "BTC" },
  { keywords: ["ethereum", "eth", "ether"], id: "ethereum", symbol: "ETH" },
  { keywords: ["solana", "sol"],            id: "solana",   symbol: "SOL" },
];

function detectCoin(q: string) {
  const lq = q.toLowerCase();
  return CRYPTO_MAP.find((c) => c.keywords.some((kw) => lq.includes(kw))) ?? null;
}

function extractTarget(question: string): number | null {
  const q = question.replace(/,/g, "");
  const m = q.match(/\$\s*(\d+(?:\.\d+)?)\s*([KkMm]?)\b/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const s = m[2].toUpperCase();
  if (s === "K") n *= 1_000;
  if (s === "M") n *= 1_000_000;
  return n >= 500 ? n : null;
}

function detectQDirection(question: string): "up" | "down" | "unknown" {
  const q = question.toLowerCase();
  if (/\b(?:exceed|above|over|reach|hit|surpass|top|cross|rise|gain|bull|higher|more than)\b/.test(q)) return "up";
  if (/\b(?:below|under|fall|drop|lose|decline|crash|dip|sink|bear|lower|less than)\b/.test(q)) return "down";
  return "unknown";
}

function buildDivergence(
  market: Market,
  coinSymbol: string, coinId: string,
  currentPrice: number, cryptoMomentum: number,
): Divergence | null {
  const direction = detectQDirection(market.question);
  if (direction === "unknown") return null;

  const yesPct = market.yes_price;
  // What does Polymarket imply about the crypto direction?
  const polyImplied: Divergence["polyImplied"] =
    direction === "up" ? (yesPct >= 0.5 ? "bullish" : "bearish")
                       : (yesPct >= 0.5 ? "bearish" : "bullish");

  const cryptoDir: Divergence["cryptoMomentum"] =
    cryptoMomentum > 0.3 ? "bullish" : cryptoMomentum < -0.3 ? "bearish" : null!;
  if (!cryptoDir) return null;

  // No divergence if they agree
  if (polyImplied === cryptoDir) return null;

  const polyConviction  = Math.abs(yesPct - 0.5) * 2;
  const cryptoConviction = Math.min(Math.abs(cryptoMomentum) / 4, 1);
  const gap = Math.round((polyConviction * 0.55 + cryptoConviction * 0.45) * 100);
  if (gap < 20) return null;

  const severity: DivSeverity = gap >= 55 ? "FORT" : gap >= 35 ? "MODÉRÉ" : "FAIBLE";
  const target = extractTarget(market.question);

  const polyVerb   = polyImplied   === "bullish" ? "haussier" : "baissier";
  const cryptoVerb = cryptoMomentum > 0 ? "haussier" : "baissier";

  const alert = `Polymarket ${polyVerb} (YES ${Math.round(yesPct * 100)}%) mais ${coinSymbol} est ${cryptoVerb} (${sign(cryptoMomentum)}${cryptoMomentum.toFixed(2)}% momentum)`;

  const arbitrage = polyImplied === "bullish"
    ? `Vendre YES — Polymarket sur-estime la hausse (${Math.round(yesPct * 100)}%) alors que ${coinSymbol} recule`
    : `Acheter YES — Polymarket sous-estime la hausse (${Math.round(yesPct * 100)}%) alors que ${coinSymbol} monte`;

  return {
    market, coinSymbol, coinId, currentPrice, targetPrice: target,
    polyImplied, cryptoMomentum: cryptoDir,
    yesPct, momentumPct: cryptoMomentum, gap, severity, alert, arbitrage,
  };
}

/* ══════════════════════════════════════════════
   UI COMPONENTS
══════════════════════════════════════════════ */

/* ── Crypto Signal Card ── */
const DIR_STYLE: Record<Direction, { bg: string; border: string; badge: string; text: string; bar: string }> = {
  LONG:   { bg: "bg-emerald-500/6",  border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", text: "text-emerald-400", bar: "bg-emerald-500" },
  SHORT:  { bg: "bg-red-500/6",      border: "border-red-500/30",     badge: "bg-red-500/20 text-red-300 border-red-500/40",            text: "text-red-400",    bar: "bg-red-500"   },
  NEUTRE: { bg: "",                  border: "border-gray-800",        badge: "bg-gray-700/50 text-gray-400 border-gray-700",            text: "text-gray-400",   bar: "bg-gray-600"  },
};

const CONF_BAR: Record<ConfLevel, string> = {
  ÉLEVÉE: "bg-emerald-500", MOYENNE: "bg-yellow-500", FAIBLE: "bg-gray-500",
};

function CryptoSignalCard({ sig, idx }: { sig: CryptoSignal; idx: number }) {
  const st = DIR_STYLE[sig.direction];
  return (
    <div
      style={{ animationDelay: `${idx * 60}ms` }}
      className={`animate-fade-slide-up flex flex-col gap-4 rounded-2xl p-5 border ${st.bg} ${st.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={sig.coin.image} alt={sig.coin.symbol} className="w-9 h-9 rounded-full" />
          <div>
            <p className="text-sm font-bold text-white">{sig.coin.name}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase">{sig.coin.symbol}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-white">{fmtPrice(sig.coin.current_price)}</p>
          <p className={`text-xs font-bold ${sig.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sign(sig.change24h)}{sig.change24h.toFixed(2)}% 24h
          </p>
        </div>
      </div>

      {/* Direction badge + confidence */}
      <div className="flex items-center justify-between gap-3">
        <span className={`text-lg font-black px-4 py-1.5 rounded-xl border ${st.badge} tracking-widest`}>
          {sig.direction}
        </span>
        <div className="flex-1 space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>Confiance</span>
            <span className={st.text}>{sig.confidence} — {sig.confScore}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${CONF_BAR[sig.confidence]}`} style={{ width: `${sig.confScore}%` }} />
          </div>
        </div>
      </div>

      {/* Momentum */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">Momentum</p>
          <p className={`font-bold ${sig.momentum >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sign(sig.momentum)}{sig.momentum.toFixed(2)}%
          </p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">24h</p>
          <p className={`font-bold ${sig.change24h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sign(sig.change24h)}{sig.change24h.toFixed(2)}%
          </p>
        </div>
        <div className="bg-gray-800/60 rounded-lg px-3 py-2 text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">7 jours</p>
          <p className={`font-bold ${sig.change7d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sign(sig.change7d)}{sig.change7d.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Reasons */}
      <ul className="space-y-1">
        {sig.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
            <span className={`mt-0.5 shrink-0 ${st.text}`}>›</span>
            {r}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <a
        href={`https://www.coingecko.com/en/coins/${sig.coin.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all hover:opacity-80 ${st.badge}`}
      >
        Voir le marché ↗
      </a>
    </div>
  );
}

/* ── Polymarket Opportunity Card ── */
const RANK_COLOR = ["text-yellow-400", "text-gray-300", "text-orange-600"];
const RANK_LABEL = ["🥇", "🥈", "🥉"];

function OpportunityCard({ opp, idx }: { opp: PolyOpportunity; idx: number }) {
  const yesPct = Math.round(opp.market.yes_price * 100);

  return (
    <div
      style={{ animationDelay: `${idx * 70}ms` }}
      className="animate-fade-slide-up flex flex-col gap-4 bg-gray-900 border border-emerald-500/20 rounded-2xl p-5 hover:border-emerald-500/40 transition-colors"
    >
      {/* Rank + score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{RANK_LABEL[idx]}</span>
          <span className="text-xs text-gray-500">Moneyprinter Score</span>
        </div>
        <span className="text-2xl font-black text-emerald-400">{opp.score}<span className="text-sm text-gray-500">/100</span></span>
      </div>

      {/* Question */}
      <p className="text-white text-sm font-semibold leading-snug line-clamp-3">{opp.market.question}</p>

      {/* Prob bar */}
      <div className="space-y-1">
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-400" style={{ width: `${yesPct}%` }} />
          <div className="bg-gradient-to-l from-red-700 to-red-400" style={{ width: `${100 - yesPct}%` }} />
        </div>
        <div className="flex justify-between text-[11px] font-bold">
          <span className="text-emerald-400">YES {yesPct}%</span>
          <span className="text-red-400">NO {100 - yesPct}%</span>
        </div>
      </div>

      {/* Bet highlight */}
      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
        <p className="text-[11px] text-emerald-400 font-semibold mb-1">Meilleur pari suggéré</p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-extrabold text-white">{opp.side}</span>
          <div className="text-right">
            <p className="text-[10px] text-gray-500">Mise $10 →</p>
            <p className="text-emerald-300 font-bold">+${opp.profit10.toFixed(1)} (+{opp.roi.toFixed(0)}%)</p>
          </div>
        </div>
      </div>

      {/* Reasons */}
      <ul className="space-y-1">
        {opp.reasons.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-gray-400">
            <span className="text-emerald-500 mt-0.5 shrink-0">›</span>
            {r}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="flex gap-2 mt-auto">
        <Link
          href={`/markets/${opp.market.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-sm font-semibold rounded-xl transition-colors"
        >
          Voir le marché
        </Link>
        {opp.market.slug && (
          <a
            href={`https://polymarket.com/event/${opp.market.slug}`}
            target="_blank" rel="noopener noreferrer"
            className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-sm rounded-xl transition-colors"
            title="Ouvrir sur Polymarket"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ── Divergence Card ── */
const SEV_STYLE: Record<DivSeverity, { border: string; bg: string; badge: string; dot: string }> = {
  FORT:   { border: "border-red-500/40",    bg: "bg-red-500/5",    badge: "bg-red-500/20 text-red-300 border border-red-500/35",     dot: "bg-red-500"    },
  MODÉRÉ: { border: "border-orange-500/35", bg: "bg-orange-500/5", badge: "bg-orange-500/15 text-orange-300 border border-orange-500/30", dot: "bg-orange-500" },
  FAIBLE: { border: "border-yellow-500/25", bg: "",                badge: "bg-yellow-500/10 text-yellow-300 border border-yellow-500/25",  dot: "bg-yellow-500" },
};

function DivergenceCard({ div, idx }: { div: Divergence; idx: number }) {
  const sev = SEV_STYLE[div.severity];
  const yesPct = Math.round(div.yesPct * 100);

  return (
    <div
      style={{ animationDelay: `${idx * 60}ms` }}
      className={`animate-fade-slide-up flex flex-col gap-4 rounded-2xl p-5 border ${sev.bg} ${sev.border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${sev.badge}`}>
            {div.severity} — Écart {div.gap}pts
          </span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-300 border border-yellow-500/25">
            ⚡ Arbitrage possible
          </span>
        </div>
        <span className="text-[11px] font-bold text-gray-400 shrink-0 bg-gray-800 px-2 py-1 rounded-lg">{div.coinSymbol}</span>
      </div>

      {/* Alert */}
      <div className={`rounded-xl px-4 py-3 border ${sev.badge}`}>
        <p className="text-[11px] font-semibold">{div.alert}</p>
      </div>

      {/* Market question */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Marché Polymarket</p>
        <p className="text-sm text-white font-medium leading-snug line-clamp-2">{div.market.question}</p>
      </div>

      {/* Comparison grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-xl px-3 py-2.5 border ${div.polyImplied === "bullish" ? "bg-emerald-500/10 border-emerald-500/25" : "bg-red-500/10 border-red-500/25"}`}>
          <p className="text-[10px] text-gray-500 mb-0.5">Polymarket dit</p>
          <p className={`text-sm font-bold ${div.polyImplied === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
            {div.polyImplied === "bullish" ? "↑ Haussier" : "↓ Baissier"}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">YES {yesPct}%</p>
        </div>
        <div className={`rounded-xl px-3 py-2.5 border ${div.cryptoMomentum === "bullish" ? "bg-emerald-500/10 border-emerald-500/25" : "bg-red-500/10 border-red-500/25"}`}>
          <p className="text-[10px] text-gray-500 mb-0.5">Marché crypto dit</p>
          <p className={`text-sm font-bold ${div.cryptoMomentum === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
            {div.cryptoMomentum === "bullish" ? "↑ Haussier" : "↓ Baissier"}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {sign(div.momentumPct)}{div.momentumPct.toFixed(2)}% momentum · {fmtPrice(div.currentPrice)}
          </p>
        </div>
      </div>

      {/* Target price if found */}
      {div.targetPrice && (
        <div className="flex items-center gap-3 text-xs bg-gray-800/60 rounded-xl px-4 py-2.5">
          <span className="text-gray-500">Objectif détecté</span>
          <span className="font-bold text-white">{fmtShort(div.targetPrice)}</span>
          <span className="text-gray-600">vs actuel</span>
          <span className="font-bold text-white">{fmtPrice(div.currentPrice)}</span>
          <span className={`ml-auto font-bold ${div.currentPrice > div.targetPrice ? "text-emerald-400" : "text-gray-400"}`}>
            {div.currentPrice > div.targetPrice ? "✓ Déjà atteint" : `−${((div.targetPrice / div.currentPrice - 1) * 100).toFixed(1)}% à faire`}
          </span>
        </div>
      )}

      {/* Arbitrage suggestion */}
      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-xl px-4 py-3">
        <p className="text-[10px] text-yellow-400 font-semibold mb-1">💡 Suggestion d'arbitrage</p>
        <p className="text-[11px] text-yellow-200/80">{div.arbitrage}</p>
      </div>

      {/* CTA */}
      <div className="flex gap-2 mt-auto">
        <Link
          href={`/markets/${div.market.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/25 text-yellow-300 text-sm font-semibold rounded-xl transition-colors"
        >
          Voir le marché
        </Link>
        {div.market.slug && (
          <a
            href={`https://polymarket.com/event/${div.market.slug}`}
            target="_blank" rel="noopener noreferrer"
            className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 text-sm rounded-xl transition-colors"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   SECTION WRAPPER
══════════════════════════════════════════════ */
function Section({ icon, title, subtitle, badge, children }: {
  icon: string; title: string; subtitle: string; badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3 pb-3 border-b border-gray-800">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <h2 className="text-lg font-extrabold text-white tracking-tight">{title}</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

/* ══════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════ */
const TARGET_COINS = ["bitcoin", "ethereum", "solana"];

export default function SignalsPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [coins,   setCoins]   = useState<CoinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [ts,      setTs]      = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [mkt, cry] = await Promise.all([
        fetchMarkets({ limit: 100, offset: 0, order: "volume24h", closed: false }),
        fetch("/api/crypto").then((r) => r.ok ? r.json() : []),
      ]);
      setMarkets(mkt.markets);
      setCoins(Array.isArray(cry) ? cry : []);
      setTs(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* ── Section 1: Crypto Signals ── */
  const cryptoSignals = useMemo(
    () => coins.filter((c) => TARGET_COINS.includes(c.id)).map(buildCryptoSignal),
    [coins],
  );

  /* ── Section 2: Polymarket Opportunities ── */
  const opportunities = useMemo(
    () => [...markets]
      .map((m) => ({ m, s: moneyprinterscore(m) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ m }, i) => buildOpportunity(m, i + 1)),
    [markets],
  );

  /* ── Section 3: Divergences ── */
  const divergences = useMemo((): Divergence[] => {
    if (!coins.length || !markets.length) return [];
    const out: Divergence[] = [];

    for (const market of markets) {
      const coinMeta = detectCoin(market.question);
      if (!coinMeta) continue;
      const coinData = coins.find((c) => c.id === coinMeta.id);
      if (!coinData) continue;

      const d  = coinData.price_change_percentage_24h ?? 0;
      const w  = (coinData.price_change_percentage_7d_in_currency ?? 0) / 7;
      const momentum = d * 0.6 + w * 0.4;

      const div = buildDivergence(market, coinMeta.symbol, coinMeta.id, coinData.current_price, momentum);
      if (div) out.push(div);
    }

    return out.sort((a, b) => b.gap - a.gap).slice(0, 9);
  }, [markets, coins]);

  const longCount  = cryptoSignals.filter((s) => s.direction === "LONG").length;
  const shortCount = cryptoSignals.filter((s) => s.direction === "SHORT").length;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">

        {/* Page header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-400 to-yellow-400 bg-clip-text text-transparent">
                Moneyprinter
              </span>{" "}
              <span className="text-white">Signals</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Recommandations d'actions concrètes basées sur données live
            </p>
          </div>
          {ts && (
            <button onClick={load} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {ts.toLocaleTimeString("fr-FR")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 bg-gray-900 border border-gray-800 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* ── 1. Crypto Signals ── */}
            <Section
              icon="📡"
              title="Crypto Signals"
              subtitle="LONG / SHORT sur BTC · ETH · SOL basé sur momentum 24h + tendance 7j"
              badge={
                <div className="flex gap-2">
                  {longCount > 0  && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">{longCount} LONG</span>}
                  {shortCount > 0 && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">{shortCount} SHORT</span>}
                </div>
              }
            >
              {cryptoSignals.length === 0 ? (
                <p className="text-gray-500 text-sm py-8 text-center">Chargement des données crypto…</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {cryptoSignals.map((sig, i) => <CryptoSignalCard key={sig.coin.id} sig={sig} idx={i} />)}
                </div>
              )}
            </Section>

            {/* ── 2. Polymarket Opportunités ── */}
            <Section
              icon="🎯"
              title="Polymarket Opportunités"
              subtitle="Top 3 marchés avec le meilleur rapport Moneyprinter · rendement · incertitude"
            >
              {opportunities.length === 0 ? (
                <p className="text-gray-500 text-sm py-8 text-center">Aucun marché chargé.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {opportunities.map((opp, i) => <OpportunityCard key={opp.market.id} opp={opp} idx={i} />)}
                </div>
              )}
            </Section>

            {/* ── 3. Divergences ── */}
            <Section
              icon="⚡"
              title="Divergences"
              subtitle="Désaccords détectés entre les marchés Polymarket et le prix crypto réel"
              badge={
                divergences.length > 0 ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                    {divergences.length} détecté{divergences.length > 1 ? "s" : ""}
                  </span>
                ) : undefined
              }
            >
              {divergences.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
                  <p className="text-gray-500 text-sm">Aucune divergence significative détectée.</p>
                  <p className="text-gray-600 text-xs mt-1">Les marchés Polymarket liés aux cryptos sont alignés avec les prix actuels.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {divergences.map((d, i) => <DivergenceCard key={d.market.id} div={d} idx={i} />)}
                </div>
              )}
            </Section>
          </>
        )}

      </main>
    </div>
  );
}
