"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useBotContext } from "@/lib/BotContext";
import { ema, macd as calcMacd, rsi as calcRsi, bollingerBands } from "@/lib/indicators";
import type { OHLCBar } from "./TradingChart";
import PortfolioTab from "./PortfolioTab";

const TradingChart = dynamic(() => import("./TradingChart"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap_rank: number;
  current_price: number;
  market_cap: number;
  total_volume: number;
  ath: number;
  ath_change_percentage: number;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtPrice(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function fmtLarge(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function pctStyle(v: number | null): string {
  if (v == null) return "text-gray-500";
  if (v > 3)  return "text-emerald-400";
  if (v > 0)  return "text-emerald-300";
  if (v < -3) return "text-red-400";
  if (v < 0)  return "text-red-300";
  return "text-gray-400";
}

function pctBadge(v: number | null): string {
  if (v == null) return "bg-gray-800 text-gray-500";
  if (v > 0)  return "bg-emerald-500/15 text-emerald-300";
  if (v < 0)  return "bg-red-500/15 text-red-300";
  return "bg-gray-800 text-gray-400";
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ─── OHLC analysis ────────────────────────────────────────────────────────────
interface Analysis {
  score: number;
  direction: "ACHETER" | "VENDRE" | "NEUTRE";
  items: { label: string; value: string; bull: boolean | null }[];
}

function analyzeOHLC(closes: number[]): Analysis {
  if (closes.length < 26) {
    return { score: 50, direction: "NEUTRE", items: [] };
  }
  const last = closes[closes.length - 1];
  const rsiVal = calcRsi(closes, 14);
  const bb = bollingerBands(closes, 20);
  const ema9  = ema(closes, 9).at(-1) ?? last;
  const ema21 = ema(closes, 21).at(-1) ?? last;
  const ma7   = closes.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const { line, signal } = calcMacd(closes);
  const macdVal = line.at(-1) ?? NaN;
  const macdSig = signal.at(-1) ?? NaN;

  let bull = 0; let bear = 0;

  // RSI
  if (rsiVal < 30)       bull += 25;
  else if (rsiVal > 70)  bear += 25;
  else if (rsiVal < 45)  bull += 8;
  else if (rsiVal > 55)  bear += 8;

  // EMA cross
  if (ema9 > ema21) bull += 25; else bear += 25;

  // Bollinger
  if (last < bb.lower)       bull += 25;
  else if (last > bb.upper)  bear += 25;
  else if (last > bb.middle) bull += 5;
  else                       bear += 5;

  // MA7
  if (last > ma7 * 1.005) bull += 15; else bear += 15;

  // MACD
  if (!isNaN(macdVal) && !isNaN(macdSig)) {
    if (macdVal > macdSig) bull += 10; else bear += 10;
  }

  const total = bull + bear;
  const rawScore = total > 0 ? Math.round((bull / total) * 100) : 50;
  const direction: Analysis["direction"] =
    rawScore >= 62 ? "ACHETER" : rawScore <= 38 ? "VENDRE" : "NEUTRE";

  return {
    score: rawScore,
    direction,
    items: [
      { label: "RSI (14)", value: rsiVal.toFixed(1), bull: rsiVal < 45 ? true : rsiVal > 55 ? false : null },
      { label: "EMA 9/21", value: ema9 > ema21 ? "Haussier" : "Baissier", bull: ema9 > ema21 },
      { label: "Bollinger", value: last < bb.lower ? "Sous-vendu" : last > bb.upper ? "Sur-acheté" : "Zone centrale", bull: last < bb.lower ? true : last > bb.upper ? false : null },
      { label: "MA7", value: last > ma7 ? "Au-dessus" : "En-dessous", bull: last > ma7 },
      { label: "MACD", value: (!isNaN(macdVal) && !isNaN(macdSig)) ? (macdVal > macdSig ? "Positif" : "Négatif") : "—", bull: (!isNaN(macdVal) && !isNaN(macdSig)) ? macdVal > macdSig : null },
    ],
  };
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
type Tab = "markets" | "chart" | "signals" | "portfolio";

const TABS: { id: Tab; label: string }[] = [
  { id: "markets",   label: "📊 Marchés" },
  { id: "chart",     label: "📈 Graphique" },
  { id: "signals",   label: "⚡ Signals" },
  { id: "portfolio", label: "💼 Portefeuille" },
];

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 1: MARCHÉS
// ═════════════════════════════════════════════════════════════════════════════
type Filter = "all" | "gainers" | "losers" | "volume";
type SortCol = "rank" | "price" | "h1" | "h24" | "h7d" | "volume" | "mcap";

function ColHeader({ col, label, sort, asc, filter, onSort }: {
  col: SortCol; label: string;
  sort: SortCol; asc: boolean; filter: Filter;
  onSort: (col: SortCol) => void;
}) {
  const active = sort === col && filter === "all";
  return (
    <th
      className={`px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors ${active ? "text-blue-400" : "text-gray-500"}`}
      onClick={() => onSort(col)}
    >
      {label}{active ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
}

function MarketsTab({ coins, loading, onSelect }: {
  coins: CoinMarket[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter]   = useState<Filter>("all");
  const [search, setSearch]   = useState("");
  const [sort, setSort]       = useState<SortCol>("rank");
  const [asc, setAsc]         = useState(true);

  const filtered = useMemo(() => {
    let list = [...coins];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    }
    if (filter === "gainers") list = list.filter((c) => (c.price_change_percentage_24h_in_currency ?? 0) > 0).sort((a, b) => (b.price_change_percentage_24h_in_currency ?? 0) - (a.price_change_percentage_24h_in_currency ?? 0));
    else if (filter === "losers") list = list.filter((c) => (c.price_change_percentage_24h_in_currency ?? 0) < 0).sort((a, b) => (a.price_change_percentage_24h_in_currency ?? 0) - (b.price_change_percentage_24h_in_currency ?? 0));
    else if (filter === "volume") list = list.sort((a, b) => b.total_volume - a.total_volume);
    else {
      const dir = asc ? 1 : -1;
      list = list.sort((a, b) => {
        if (sort === "rank")   return dir * (a.market_cap_rank - b.market_cap_rank);
        if (sort === "price")  return dir * (a.current_price - b.current_price);
        if (sort === "h1")     return dir * ((a.price_change_percentage_1h_in_currency ?? 0) - (b.price_change_percentage_1h_in_currency ?? 0));
        if (sort === "h24")    return dir * ((a.price_change_percentage_24h_in_currency ?? 0) - (b.price_change_percentage_24h_in_currency ?? 0));
        if (sort === "h7d")    return dir * ((a.price_change_percentage_7d_in_currency ?? 0) - (b.price_change_percentage_7d_in_currency ?? 0));
        if (sort === "volume") return dir * (a.total_volume - b.total_volume);
        if (sort === "mcap")   return dir * (a.market_cap - b.market_cap);
        return 0;
      });
    }
    return list;
  }, [coins, filter, search, sort, asc]);

  function handleSort(col: SortCol) {
    setFilter("all");
    if (sort === col) setAsc((v) => !v);
    else { setSort(col); setAsc(false); }
  }

  return (
    <div className="space-y-4">
      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", "gainers", "losers", "volume"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {f === "all" ? "Tous" : f === "gainers" ? "🟢 Gainers" : f === "losers" ? "🔴 Losers" : "📊 Vol. élevé"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher une crypto…"
          className="ml-auto px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-56"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60 border-b border-gray-700/60">
              <tr>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 w-10">#</th>
                <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Nom</th>
                <ColHeader col="price"  label="Prix"       sort={sort} asc={asc} filter={filter} onSort={handleSort} />
                <ColHeader col="h1"     label="1h"         sort={sort} asc={asc} filter={filter} onSort={handleSort} />
                <ColHeader col="h24"    label="24h"        sort={sort} asc={asc} filter={filter} onSort={handleSort} />
                <ColHeader col="h7d"    label="7j"         sort={sort} asc={asc} filter={filter} onSort={handleSort} />
                <ColHeader col="volume" label="Volume 24h" sort={sort} asc={asc} filter={filter} onSort={handleSort} />
                <ColHeader col="mcap"   label="Market Cap" sort={sort} asc={asc} filter={filter} onSort={handleSort} />
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40">
              {loading
                ? Array.from({ length: 20 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-3 py-3"><div className="h-3 w-5 bg-gray-800 rounded" /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-800" />
                          <div className="h-3 w-20 bg-gray-800 rounded" />
                        </div>
                      </td>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-3 py-3 text-right"><div className="h-3 w-16 bg-gray-800 rounded ml-auto" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map((coin) => (
                    <tr
                      key={coin.id}
                      className="hover:bg-gray-800/30 transition-colors group cursor-pointer"
                      onClick={() => onSelect(coin.id)}
                    >
                      <td className="px-3 py-2.5 text-gray-600 text-xs font-medium">{coin.market_cap_rank}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full flex-shrink-0" />
                          <div>
                            <p className="text-white font-semibold text-sm leading-tight">{coin.name}</p>
                            <p className="text-gray-500 text-[10px] uppercase font-medium">{coin.symbol}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-white font-medium">{fmtPrice(coin.current_price)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-medium ${pctStyle(coin.price_change_percentage_1h_in_currency)}`}>
                          {fmtPct(coin.price_change_percentage_1h_in_currency)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md ${pctBadge(coin.price_change_percentage_24h_in_currency)}`}>
                          {fmtPct(coin.price_change_percentage_24h_in_currency)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-medium ${pctStyle(coin.price_change_percentage_7d_in_currency)}`}>
                          {fmtPct(coin.price_change_percentage_7d_in_currency)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-300 text-xs">{fmtLarge(coin.total_volume)}</td>
                      <td className="px-3 py-2.5 text-right text-gray-300 text-xs">{fmtLarge(coin.market_cap)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-gray-600 group-hover:text-blue-400 transition-colors text-sm">→</span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && (
          <div className="px-4 py-2.5 border-t border-gray-800/60 text-[10px] text-gray-600">
            {filtered.length} actif{filtered.length !== 1 ? "s" : ""} · Cliquez sur une ligne pour voir le graphique
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 2: GRAPHIQUE
// ═════════════════════════════════════════════════════════════════════════════
const TIMEFRAMES: { label: string; days: string }[] = [
  { label: "1j",  days: "1" },
  { label: "7j",  days: "7" },
  { label: "1M",  days: "30" },
  { label: "3M",  days: "90" },
  { label: "1an", days: "365" },
];

const INDICATOR_GROUPS: { key: string; label: string; color: string }[][] = [
  [
    { key: "ema9",  label: "EMA 9",  color: "#f97316" },
    { key: "ema21", label: "EMA 21", color: "#a855f7" },
    { key: "ema50", label: "EMA 50", color: "#3b82f6" },
  ],
  [
    { key: "ma7",  label: "MM 7",  color: "#fbbf24" },
    { key: "ma25", label: "MM 25", color: "#10b981" },
    { key: "ma99", label: "MM 99", color: "#6366f1" },
  ],
  [
    { key: "bb",     label: "Bollinger", color: "#4b5563" },
    { key: "rsi",    label: "RSI",       color: "#a78bfa" },
    { key: "macd",   label: "MACD",      color: "#3b82f6" },
    { key: "volume", label: "Volume",    color: "#16a34a" },
  ],
];

function ChartTab({ coinId, coins }: { coinId: string | null; coins: CoinMarket[] }) {
  const [selectedId, setSelectedId]   = useState(coinId ?? "bitcoin");
  const [days, setDays]               = useState("30");
  const [ohlc, setOhlc]               = useState<OHLCBar[]>([]);
  const [indicators, setIndicators]   = useState<Set<string>>(new Set(["volume"]));
  const [loadingChart, setLoadingChart] = useState(false);
  const [coinSearch, setCoinSearch]   = useState("");
  const [showSearch, setShowSearch]   = useState(false);

  // Sync when parent selects a coin via Markets click
  useEffect(() => {
    if (coinId) setSelectedId(coinId);
  }, [coinId]);

  // Fetch OHLC
  useEffect(() => {
    setLoadingChart(true);
    fetch(`/api/crypto/ohlc?id=${selectedId}&days=${days}`)
      .then((r) => r.json())
      .then((raw: unknown) => {
        if (!Array.isArray(raw)) { setOhlc([]); return; }
        setOhlc(
          (raw as number[][]).map(([ts, o, h, l, c]) => ({
            time: Math.floor(ts / 1000),
            open: o, high: h, low: l, close: c,
          })),
        );
      })
      .catch(() => setOhlc([]))
      .finally(() => setLoadingChart(false));
  }, [selectedId, days]);

  const toggleIndicator = useCallback((key: string) => {
    setIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const coin = coins.find((c) => c.id === selectedId);
  const closes = ohlc.map((d) => d.close);
  const analysis = closes.length >= 26 ? analyzeOHLC(closes) : null;

  const filteredCoins = coinSearch
    ? coins.filter((c) => c.name.toLowerCase().includes(coinSearch.toLowerCase()) || c.symbol.toLowerCase().includes(coinSearch.toLowerCase()))
    : coins.slice(0, 30);

  return (
    <div className="space-y-4">
      {/* Coin selector */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setShowSearch((v) => !v)}
            className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-xl px-4 py-2.5 transition-colors"
          >
            {coin && <img src={coin.image} alt={coin.name} className="w-6 h-6 rounded-full" />}
            <span className="text-white font-semibold">{coin?.name ?? selectedId}</span>
            <span className="text-gray-500 text-sm uppercase">{coin?.symbol}</span>
            <span className="text-gray-500 ml-1">▼</span>
          </button>
          {showSearch && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-2 border-b border-gray-800">
                <input
                  autoFocus
                  value={coinSearch}
                  onChange={(e) => setCoinSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredCoins.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedId(c.id); setShowSearch(false); setCoinSearch(""); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 text-left transition-colors"
                  >
                    <img src={c.image} alt={c.name} className="w-6 h-6 rounded-full" />
                    <span className="text-white text-sm font-medium">{c.name}</span>
                    <span className="text-gray-500 text-xs uppercase ml-auto">{c.symbol}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {coin && (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-white">{fmtPrice(coin.current_price)}</span>
            <span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${pctBadge(coin.price_change_percentage_24h_in_currency)}`}>
              {fmtPct(coin.price_change_percentage_24h_in_currency)} 24h
            </span>
          </div>
        )}
      </div>

      {/* Timeframes */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider mr-1">Période</span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.days}
            onClick={() => setDays(tf.days)}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              days === tf.days ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* Indicators */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider mr-1">Indicateurs</span>
        {INDICATOR_GROUPS.map((group, gi) => (
          <div key={gi} className="flex gap-1">
            {group.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleIndicator(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  indicators.has(key)
                    ? "text-white border-transparent"
                    : "bg-transparent text-gray-500 border-gray-700 hover:border-gray-500 hover:text-gray-300"
                }`}
                style={indicators.has(key) ? { backgroundColor: `${color}30`, borderColor: color, color } : {}}
              >
                {label}
              </button>
            ))}
            {gi < INDICATOR_GROUPS.length - 1 && <div className="w-px bg-gray-700 mx-1 self-stretch" />}
          </div>
        ))}
      </div>

      {/* Chart + Analysis */}
      <div className="flex gap-4">
        {/* Chart */}
        <div className="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 520 }}>
          {loadingChart ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-gray-600 text-sm animate-pulse">Chargement des bougies…</div>
            </div>
          ) : ohlc.length > 0 ? (
            <TradingChart data={ohlc} indicators={indicators} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
              Données non disponibles
            </div>
          )}
        </div>

        {/* Analysis Panel */}
        <div className="w-64 flex-shrink-0 space-y-3">
          {analysis ? (
            <>
              {/* Score */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Score technique</p>
                <div className="relative w-24 h-24 mx-auto mb-3">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke={analysis.score >= 62 ? "#22c55e" : analysis.score <= 38 ? "#ef4444" : "#f59e0b"}
                      strokeWidth="10"
                      strokeDasharray={`${(analysis.score / 100) * 251.3} 251.3`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-white">{analysis.score}</span>
                    <span className="text-[9px] text-gray-500">/100</span>
                  </div>
                </div>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                  analysis.direction === "ACHETER" ? "bg-emerald-500/20 text-emerald-400" :
                  analysis.direction === "VENDRE"  ? "bg-red-500/20 text-red-400" :
                  "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {analysis.direction}
                </span>
              </div>

              {/* Components */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Analyse</p>
                {analysis.items.map(({ label, value, bull }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={`text-xs font-semibold ${bull === true ? "text-emerald-400" : bull === false ? "text-red-400" : "text-gray-400"}`}>
                      {bull === true ? "▲ " : bull === false ? "▼ " : ""}{value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Indicator legend */}
              {indicators.size > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-1.5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Légende</p>
                  {INDICATOR_GROUPS.flat().filter(({ key }) => indicators.has(key)).map(({ key, label, color }) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center text-gray-600 text-sm">
              Chargement de l&apos;analyse…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 3: SIGNALS
// ═════════════════════════════════════════════════════════════════════════════
const LAYER_COLORS: Record<number, { bg: string; border: string; text: string; label: string }> = {
  1: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", label: "L1 Smart Money" },
  2: { bg: "bg-blue-500/10",   border: "border-blue-500/30",   text: "text-blue-400",   label: "L2 Sentiment" },
  3: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", label: "L3 Arbitrage" },
  4: { bg: "bg-teal-500/10",   border: "border-teal-500/30",   text: "text-teal-400",   label: "L4 Technique" },
};

function SignalsTab() {
  const { state } = useBotContext();
  const signals = (state.lastSignals ?? []) as import("@/lib/bot").CombinedSignal[];

  const lastCycle = state.lastCycleAt
    ? new Date(state.lastCycleAt).toLocaleTimeString("fr-FR")
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Signaux du Bot</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Générés par les 4 couches du moteur · Triés par force du signal
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.isActive ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Bot actif {lastCycle && `· Dernier cycle ${lastCycle}`}
            </span>
          ) : (
            <span className="text-xs text-gray-600">Bot en pause — activez-le sur la page Bot</span>
          )}
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-2xl mb-3">⚡</p>
          <p className="text-gray-400 font-medium">Aucun signal actif</p>
          <p className="text-gray-600 text-sm mt-1">
            {state.isActive
              ? "Le bot analyse les marchés — revenez dans quelques secondes"
              : "Activez le bot sur la page Bot pour générer des signaux"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((sig, i) => {
            const lc = LAYER_COLORS[sig.primaryLayer] ?? LAYER_COLORS[4];
            return (
              <div
                key={i}
                className={`${lc.bg} border ${lc.border} rounded-xl p-4 flex items-start gap-4`}
              >
                {/* Rank */}
                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>

                {/* Layer badge + coin */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${lc.bg} ${lc.text} border ${lc.border}`}>
                      {lc.label}
                    </span>
                    <span className="text-white font-bold">{sig.coinSymbol}</span>
                    <span className="text-gray-400 text-sm">{sig.coinName}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      sig.direction === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                    }`}>
                      {sig.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
                    </span>
                    {sig.agreementCount > 1 && (
                      <span className="text-xs text-yellow-400 font-semibold">
                        ★ {sig.agreementCount} couches
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed truncate">{sig.details}</p>
                </div>

                {/* Score */}
                <div className="text-right flex-shrink-0">
                  <div className={`text-xl font-black ${lc.text}`}>{sig.weightedScore.toFixed(0)}</div>
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider">score</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weight legend */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Poids auto-apprentissage</p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(state.weights) as [string, import("@/lib/bot").SignalWeight][]).map(([type, w]) => (
            <div key={type}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400 capitalize">{type.replace("_", " ")}</span>
                <span className="text-gray-300 font-semibold">×{w.weight.toFixed(2)}</span>
              </div>
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                  style={{ width: `${((w.weight - 0.3) / 1.7) * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-gray-600 mt-0.5">
                {w.total} trades · WR {w.total > 0 ? Math.round(w.winRate * 100) : 0}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PortfolioTab imported from ./PortfolioTab ──────────────────────────────
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function CryptoPage() {
  const [tab, setTab]               = useState<Tab>("markets");
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [coins, setCoins]           = useState<CoinMarket[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/crypto/markets")
        .then((r) => r.json())
        .then((data: unknown) => {
          if (Array.isArray(data)) setCoins(data as CoinMarket[]);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  function openChart(coinId: string) {
    setSelectedCoin(coinId);
    setTab("chart");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Sub-tab navigation */}
      <div className="border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 py-2">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === id
                    ? "bg-blue-600 text-white"
                    : "text-gray-500 hover:text-white hover:bg-gray-800"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === "markets"   && <MarketsTab coins={coins} loading={loading} onSelect={openChart} />}
        {tab === "chart"     && <ChartTab coinId={selectedCoin} coins={coins} />}
        {tab === "signals"   && <SignalsTab />}
        {tab === "portfolio" && <PortfolioTab coins={coins} onSelect={openChart} />}
      </main>
    </div>
  );
}
