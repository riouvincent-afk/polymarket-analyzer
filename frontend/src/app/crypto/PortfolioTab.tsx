"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface CoinRef {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap_rank: number;
  ath: number;
  ath_change_percentage: number;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
  total_volume: number;
  market_cap: number;
}

export interface Holding {
  coinId: string;
  symbol: string;
  name: string;
  image: string;
  amount: number;
  buyPrice?: number;
}

interface EnrichedHolding extends Holding {
  price: number;
  value: number;
  chg24h: number | null;
  market_cap_rank: number;
  ath: number;
  athChangePct: number;
  rankChange: number | null;
}

interface CategoryData {
  name: string;
  value: number;
  pct: number;
  risk: number;
  color: string;
  icon: string;
}

interface ScoreCriterion { label: string; score: number; max: number; comment: string; }
interface HealthScore { total: number; criteria: ScoreCriterion[]; }

// ── Constants ──────────────────────────────────────────────────────────────────
const PORTFOLIO_KEY   = "moneyprinter_portfolio_v1";
const RANK_HISTORY_KEY = "moneyprinter_rank_history_v1";

const COIN_CATEGORIES: Record<string, string> = {
  bitcoin: "Layer 1", ethereum: "Layer 1", solana: "Layer 1",
  cardano: "Layer 1", avalanche: "Layer 1", polkadot: "Layer 1",
  cosmos: "Layer 1", near: "Layer 1", aptos: "Layer 1", sui: "Layer 1",
  algorand: "Layer 1", tezos: "Layer 1", ripple: "Layer 1",
  litecoin: "Layer 1", monero: "Layer 1", "bitcoin-cash": "Layer 1",
  stellar: "Layer 1", "hedera-hashgraph": "Layer 1",
  "matic-network": "Layer 2", arbitrum: "Layer 2", optimism: "Layer 2",
  "immutable-x": "Layer 2", loopring: "Layer 2", starknet: "Layer 2",
  mantle: "Layer 2", blast: "Layer 2",
  uniswap: "DeFi", aave: "DeFi", chainlink: "DeFi", maker: "DeFi",
  "compound-governance-token": "DeFi", "curve-dao-token": "DeFi",
  "synthetix-network-token": "DeFi", "yearn-finance": "DeFi",
  "pancakeswap-token": "DeFi", "1inch": "DeFi", balancer: "DeFi",
  "fetch-ai": "AI", "render-token": "AI", singularitynet: "AI",
  "ocean-protocol": "AI", "akash-network": "AI", bittensor: "AI",
  dogecoin: "Memecoin", "shiba-inu": "Memecoin", pepe: "Memecoin",
  floki: "Memecoin", bonk: "Memecoin", dogwifcoin: "Memecoin",
  tether: "Stablecoin", "usd-coin": "Stablecoin", dai: "Stablecoin",
  frax: "Stablecoin",
  "the-sandbox": "GameFi", "axie-infinity": "GameFi", decentraland: "GameFi",
  gala: "GameFi", illuvium: "GameFi",
  binancecoin: "Exchange", "crypto-com-chain": "Exchange",
  "kucoin-shares": "Exchange", okb: "Exchange",
  filecoin: "Storage", arweave: "Storage",
  helium: "IoT", iota: "IoT",
};

const CATEGORY_CFG: Record<string, { risk: number; color: string; icon: string }> = {
  "Layer 1":    { risk: 4, color: "#3b82f6", icon: "⬡" },
  "Layer 2":    { risk: 5, color: "#8b5cf6", icon: "⬢" },
  "DeFi":       { risk: 6, color: "#22c55e", icon: "⚡" },
  "AI":         { risk: 7, color: "#06b6d4", icon: "🤖" },
  "Memecoin":   { risk: 9, color: "#ef4444", icon: "🐕" },
  "Stablecoin": { risk: 1, color: "#6b7280", icon: "🔒" },
  "GameFi":     { risk: 8, color: "#f59e0b", icon: "🎮" },
  "Exchange":   { risk: 5, color: "#f97316", icon: "🔄" },
  "Storage":    { risk: 7, color: "#84cc16", icon: "💾" },
  "IoT":        { risk: 7, color: "#ec4899", icon: "📡" },
  "Other":      { risk: 6, color: "#4b5563", icon: "❓" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtEur(n: number): string {
  if (isNaN(n)) return "—";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(2)}Md`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(2)}M`;
  if (n >= 1000) return `€${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}`;
  if (n >= 1)   return `€${n.toFixed(2)}`;
  return `€${n.toFixed(4)}`;
}

function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

function pctColor(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "text-gray-500";
  return n >= 0 ? "text-emerald-400" : "text-red-400";
}

function getCat(coinId: string) {
  const name = COIN_CATEGORIES[coinId] ?? "Other";
  return { name, ...CATEGORY_CFG[name] ?? CATEGORY_CFG["Other"] };
}

// ── Rank History ──────────────────────────────────────────────────────────────
interface RankSnapshot { ts: number; ranks: Record<string, number>; }

function loadRankHistory(): RankSnapshot[] {
  try { const r = localStorage.getItem(RANK_HISTORY_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function updateRankHistory(coins: CoinRef[]): RankSnapshot[] {
  const now  = Date.now();
  const hist = loadRankHistory();
  const last = hist[hist.length - 1];
  if (!last || now - last.ts > 12 * 3600_000) {
    const ranks: Record<string, number> = {};
    coins.forEach(c => { ranks[c.id] = c.market_cap_rank; });
    const next = [...hist, { ts: now, ranks }].slice(-60);
    try { localStorage.setItem(RANK_HISTORY_KEY, JSON.stringify(next)); } catch {}
    return next;
  }
  return hist;
}

function getRankChange(coinId: string, currentRank: number, hist: RankSnapshot[]): number | null {
  const ago30 = Date.now() - 30 * 86400_000;
  const snap  = hist.find(s => s.ts <= ago30) ?? hist[0];
  if (!snap || !(coinId in snap.ranks)) return null;
  return snap.ranks[coinId] - currentRank; // positive = rank improved (lower #)
}

// ── Health Score ───────────────────────────────────────────────────────────────
function computeHealth(
  rows: EnrichedHolding[],
  totalValue: number,
  categories: CategoryData[],
  hist: RankSnapshot[],
): HealthScore {
  const c: ScoreCriterion[] = [];

  // Diversification (0-25)
  const hhi = rows.reduce((s, r) => { const w = totalValue > 0 ? r.value / totalValue : 0; return s + w * w; }, 0);
  const d = Math.round((1 - Math.min(hhi, 1)) * 25);
  c.push({ label: "Diversification", score: d, max: 25, comment: hhi < 0.2 ? "Excellent" : hhi < 0.4 ? "Bon" : hhi < 0.6 ? "Moyen" : "Concentré" });

  // Category balance (0-20)
  const maxCat = categories.length ? Math.max(...categories.map(x => x.pct)) : 100;
  const cb = maxCat > 80 ? 2 : maxCat > 60 ? 7 : maxCat > 40 ? 14 : 20;
  c.push({ label: "Équilibre catégories", score: cb, max: 20, comment: maxCat > 80 ? "Sur-concentré" : maxCat > 60 ? "Déséquilibré" : maxCat > 40 ? "Acceptable" : "Diversifié" });

  // Asset count (0-15)
  const n = rows.length;
  const ac = n >= 8 ? 15 : n >= 5 ? 12 : n >= 3 ? 8 : n >= 1 ? 4 : 0;
  c.push({ label: "Nombre d'actifs", score: ac, max: 15, comment: n >= 8 ? "Excellent" : n >= 5 ? "Bon" : n >= 3 ? "Insuffisant" : "Trop peu" });

  // Risk balance (0-20)
  const avgRisk = rows.length > 0
    ? rows.reduce((s, r) => s + getCat(r.coinId).risk * (totalValue > 0 ? r.value / totalValue : 0), 0)
    : 10;
  const rb = avgRisk <= 3 ? 20 : avgRisk <= 5 ? 15 : avgRisk <= 7 ? 9 : 3;
  c.push({ label: "Balance risque", score: rb, max: 20, comment: avgRisk <= 3 ? "Conservateur" : avgRisk <= 5 ? "Modéré" : avgRisk <= 7 ? "Agressif" : "Très risqué" });

  // Rank trend (0-10)
  const changes = rows.map(r => r.rankChange).filter((x): x is number => x !== null);
  const rising  = changes.filter(x => x > 0).length;
  const trend   = changes.length === 0 ? 5 : Math.round((rising / changes.length) * 10);
  c.push({ label: "Tendances", score: trend, max: 10, comment: trend >= 8 ? "Momentum positif" : trend >= 5 ? "Neutre" : "En recul" });

  // P&L (0-10)
  const withBP   = rows.filter(r => r.buyPrice);
  const profit   = withBP.filter(r => r.price > (r.buyPrice ?? 0)).length;
  const plScore  = withBP.length === 0 ? 5 : Math.round((profit / withBP.length) * 10);
  c.push({ label: "Performance", score: plScore, max: 10, comment: withBP.length === 0 ? "Prix d'achat manquants" : plScore >= 8 ? "Excellent" : plScore >= 5 ? "Bon" : "En perte" });

  return { total: c.reduce((s, x) => s + x.score, 0), criteria: c };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
type Section = "overview" | "categories" | "ranks" | "health";

export default function PortfolioTab({ coins, onSelect }: { coins: CoinRef[]; onSelect?: (id: string) => void }) {
  const [holdings,  setHoldings]  = useState<Holding[]>([]);
  const [rankHist,  setRankHist]  = useState<RankSnapshot[]>([]);
  const [mounted,   setMounted]   = useState(false);
  const [section,   setSection]   = useState<Section>("overview");

  // Add-form state
  const [addSearch,   setAddSearch]   = useState("");
  const [addId,       setAddId]       = useState("");
  const [addAmt,      setAddAmt]      = useState("");
  const [addBuyPrice, setAddBuyPrice] = useState("");
  const [showDrop,    setShowDrop]    = useState(false);

  // Inline buy-price edit
  const [editId,  setEditId]  = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const dropRef = useRef<HTMLDivElement>(null);

  // Hydrate
  useEffect(() => {
    try { const r = localStorage.getItem(PORTFOLIO_KEY); if (r) setHoldings(JSON.parse(r)); } catch {}
    setMounted(true);
  }, []);

  // Rank history
  useEffect(() => {
    if (mounted && coins.length > 0) setRankHist(updateRankHistory(coins));
  }, [mounted, coins]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function save(h: Holding[]) {
    setHoldings(h);
    try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(h)); } catch {}
  }

  function addHolding() {
    const coin = coins.find(c => c.id === addId);
    if (!coin || !addAmt) return;
    const amount = parseFloat(addAmt);
    if (isNaN(amount) || amount <= 0) return;
    const buyPrice = addBuyPrice ? parseFloat(addBuyPrice) : undefined;
    const idx = holdings.findIndex(h => h.coinId === addId);
    if (idx >= 0) {
      const u = [...holdings];
      u[idx] = { ...u[idx], amount, ...(buyPrice != null ? { buyPrice } : {}) };
      save(u);
    } else {
      save([...holdings, { coinId: coin.id, symbol: coin.symbol, name: coin.name, image: coin.image, amount, buyPrice }]);
    }
    setAddId(""); setAddAmt(""); setAddBuyPrice(""); setAddSearch(""); setShowDrop(false);
  }

  function saveBuyPrice(coinId: string) {
    const p = parseFloat(editVal);
    save(holdings.map(h => h.coinId === coinId ? { ...h, buyPrice: isNaN(p) ? undefined : p } : h));
    setEditId(null);
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const priceMap = useMemo(() => new Map(coins.map(c => [c.id, c])), [coins]);

  const rows = useMemo((): EnrichedHolding[] =>
    holdings.map(h => {
      const coin = priceMap.get(h.coinId);
      const price = coin?.current_price ?? 0;
      return {
        ...h,
        price,
        value: h.amount * price,
        chg24h: coin?.price_change_percentage_24h_in_currency ?? null,
        market_cap_rank: coin?.market_cap_rank ?? 9999,
        ath: coin?.ath ?? price,
        athChangePct: coin?.ath_change_percentage ?? 0,
        rankChange: coin ? getRankChange(coin.id, coin.market_cap_rank, rankHist) : null,
      };
    }).sort((a, b) => b.value - a.value),
    [holdings, priceMap, rankHist]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);

  const total24hAgo = rows.reduce((acc, r) => acc + r.value / (1 + (r.chg24h ?? 0) / 100), 0);
  const chg24h     = totalValue - total24hAgo;
  const chg24hPct  = total24hAgo > 0 ? (chg24h / total24hAgo) * 100 : 0;

  const totalPL = rows.reduce((s, r) => {
    if (!r.buyPrice) return s;
    return s + (r.price - r.buyPrice) * r.amount;
  }, 0);
  const totalCost = rows.reduce((s, r) => r.buyPrice ? s + r.buyPrice * r.amount : s, 0);
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null;

  const scenarios = useMemo(() => {
    const athVal = rows.reduce((s, r) => s + r.amount * r.ath, 0);
    return [
      { label: "Bear", sub: "−50%",  value: totalValue * 0.5,  delta: -totalValue * 0.5,  color: "text-red-400",     bg: "from-red-950/60 to-red-900/20",     border: "border-red-800/40",     icon: "🐻" },
      { label: "Base", sub: "actuel", value: totalValue,        delta: 0,                  color: "text-gray-300",    bg: "from-gray-800/60 to-gray-900/20",   border: "border-gray-700/40",    icon: "📊" },
      { label: "Bull", sub: "+200%", value: totalValue * 3,    delta: totalValue * 2,      color: "text-emerald-400", bg: "from-emerald-950/60 to-emerald-900/20", border: "border-emerald-800/40", icon: "🚀" },
      { label: "ATH",  sub: athVal > totalValue ? `+${(((athVal - totalValue) / totalValue) * 100).toFixed(0)}%` : "déjà dépassé",
        value: athVal, delta: athVal - totalValue,
        color: "text-yellow-400", bg: "from-yellow-950/60 to-yellow-900/20", border: "border-yellow-800/40", icon: "⭐" },
    ];
  }, [rows, totalValue]);

  const categories = useMemo((): CategoryData[] => {
    const map = new Map<string, number>();
    rows.forEach(r => { const c = getCat(r.coinId); map.set(c.name, (map.get(c.name) ?? 0) + r.value); });
    const tot = Array.from(map.values()).reduce((s, v) => s + v, 0);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, value]) => {
      const cfg = CATEGORY_CFG[name] ?? CATEGORY_CFG["Other"];
      return { name, value, pct: tot > 0 ? (value / tot) * 100 : 0, risk: cfg.risk, color: cfg.color, icon: cfg.icon };
    });
  }, [rows]);

  const rankRows = useMemo(() =>
    rows.filter(r => r.rankChange !== null) as (EnrichedHolding & { rankChange: number })[],
    [rows]);
  const rising  = [...rankRows].sort((a, b) => b.rankChange - a.rankChange).slice(0, 3);
  const falling = [...rankRows].sort((a, b) => a.rankChange - b.rankChange).filter(r => r.rankChange < 0).slice(0, 3);

  const health = useMemo(() => computeHealth(rows, totalValue, categories, rankHist), [rows, totalValue, categories, rankHist]);
  const healthColor = health.total >= 70 ? "text-emerald-400" : health.total >= 45 ? "text-yellow-400" : "text-red-400";

  const maxCatPct = categories.length ? Math.max(...categories.map(c => c.pct)) : 0;

  // Filtered coins for search dropdown
  const dropCoins = useMemo(() => {
    if (!addSearch) return [];
    const q = addSearch.toLowerCase();
    return coins.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)).slice(0, 8);
  }, [addSearch, coins]);

  if (!mounted) return null;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <AddForm
          dropRef={dropRef} addSearch={addSearch} setAddSearch={setAddSearch}
          addId={addId} setAddId={setAddId} addAmt={addAmt} setAddAmt={setAddAmt}
          addBuyPrice={addBuyPrice} setAddBuyPrice={setAddBuyPrice}
          showDrop={showDrop} setShowDrop={setShowDrop}
          dropCoins={dropCoins} onAdd={addHolding}
        />
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-16 text-center">
          <p className="text-4xl mb-4">💼</p>
          <p className="text-gray-300 font-semibold text-lg">Portefeuille vide</p>
          <p className="text-gray-600 text-sm mt-2">Ajoutez vos cryptos ci-dessus pour démarrer l&apos;analyse</p>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Valeur totale</p>
          <p className="text-xl font-bold text-white">{fmtEur(totalValue)}</p>
          <p className={`text-xs font-semibold mt-0.5 ${pctColor(chg24hPct)}`}>
            {fmtPct(chg24hPct)} ({chg24h >= 0 ? "+" : ""}{fmtEur(Math.abs(chg24h))}) 24h
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">P&amp;L total</p>
          {totalCost > 0 ? (
            <>
              <p className={`text-xl font-bold ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalPL >= 0 ? "+" : ""}{fmtEur(totalPL)}
              </p>
              <p className={`text-xs font-semibold mt-0.5 ${pctColor(totalPLPct)}`}>{fmtPct(totalPLPct)}</p>
            </>
          ) : (
            <p className="text-sm text-gray-600 mt-1">Prix d&apos;achat manquants</p>
          )}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Score santé</p>
          <p className={`text-xl font-bold ${healthColor}`}>{health.total}<span className="text-sm text-gray-500">/100</span></p>
          <p className="text-xs text-gray-500 mt-0.5">{health.total >= 70 ? "Excellent" : health.total >= 45 ? "À améliorer" : "Attention requise"}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Actifs</p>
          <p className="text-xl font-bold text-white">{holdings.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">{categories.length} catégorie{categories.length > 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── Scenario cards ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Scénarios de valeur</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {scenarios.map(s => (
            <div key={s.label} className={`bg-gradient-to-br ${s.bg} border ${s.border} rounded-xl p-3`}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-base">{s.icon}</span>
                <span className="text-xs font-bold text-gray-300">{s.label}</span>
                <span className="text-[10px] text-gray-500 ml-auto">{s.sub}</span>
              </div>
              <p className={`text-lg font-bold ${s.color}`}>{fmtEur(s.value)}</p>
              {s.delta !== 0 && (
                <p className={`text-[10px] mt-0.5 ${s.delta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {s.delta > 0 ? "+" : ""}{fmtEur(s.delta)}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Section tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1">
        {([
          { id: "overview",    label: "📋 Positions" },
          { id: "categories",  label: "🗂 Catégories" },
          { id: "ranks",       label: "📈 Classements" },
          { id: "health",      label: "💊 Santé" },
        ] as { id: Section; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${section === t.id ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION: OVERVIEW (Positions table)
         ══════════════════════════════════════════════════════════════════════ */}
      {section === "overview" && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/60 border-b border-gray-700/60">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Actif</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Qté</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Prix achat</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Prix actuel</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Valeur</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">P&amp;L</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">vs ATH</th>
                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">24h</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {rows.map(r => {
                    const pl     = r.buyPrice ? (r.price - r.buyPrice) * r.amount : null;
                    const plPct  = r.buyPrice ? ((r.price - r.buyPrice) / r.buyPrice) * 100 : null;
                    const dca    = plPct != null && plPct < -20;
                    const cat    = getCat(r.coinId);
                    const portPct = totalValue > 0 ? (r.value / totalValue) * 100 : 0;

                    return (
                      <tr key={r.coinId} className="hover:bg-gray-800/20 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <img src={r.image} alt={r.name} className="w-7 h-7 rounded-full flex-shrink-0" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => onSelect?.(r.coinId)}
                                  className="text-white font-semibold text-sm hover:text-blue-400 transition-colors"
                                >
                                  {r.name}
                                </button>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${cat.color === "#ef4444" ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-gray-800 border-gray-700 text-gray-500"}`}
                                  style={{ borderColor: cat.color + "40", color: cat.color }}>
                                  {cat.icon} {cat.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-gray-500 text-[10px] uppercase">{r.symbol}</span>
                                <span className="text-[10px] text-gray-600">{portPct.toFixed(1)}% port.</span>
                                {dca && <span className="text-[9px] px-1 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded">DCA suggéré</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs">{r.amount}</td>

                        {/* Buy price — editable inline */}
                        <td className="px-4 py-3 text-right">
                          {editId === r.coinId ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                autoFocus
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") saveBuyPrice(r.coinId); if (e.key === "Escape") setEditId(null); }}
                                className="w-24 px-2 py-1 bg-gray-800 border border-blue-500 rounded text-xs text-white text-right focus:outline-none"
                                placeholder="ex: 45000"
                              />
                              <button onClick={() => saveBuyPrice(r.coinId)} className="text-emerald-400 hover:text-emerald-300 text-xs">✓</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditId(r.coinId); setEditVal(r.buyPrice?.toString() ?? ""); }}
                              className="text-gray-500 hover:text-blue-400 text-xs transition-colors group-hover:text-gray-400"
                              title="Cliquer pour modifier le prix d'achat"
                            >
                              {r.buyPrice ? `$${r.buyPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : <span className="text-gray-700">+ prix</span>}
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-gray-300 text-sm font-medium">
                          ${r.price >= 1 ? r.price.toFixed(2) : r.price.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-right text-white font-semibold text-sm">{fmtEur(r.value)}</td>

                        {/* P&L */}
                        <td className="px-4 py-3 text-right">
                          {pl != null ? (
                            <div>
                              <p className={`text-xs font-semibold ${pctColor(plPct)}`}>{fmtPct(plPct)}</p>
                              <p className={`text-[10px] ${pctColor(pl)}`}>{pl >= 0 ? "+" : ""}{fmtEur(Math.abs(pl))}</p>
                            </div>
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </td>

                        {/* vs ATH */}
                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold ${pctColor(r.athChangePct)}`}>
                            {fmtPct(r.athChangePct)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span className={`text-xs font-semibold ${pctColor(r.chg24h)}`}>{fmtPct(r.chg24h)}</span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <button onClick={() => holdings.length > 0 && save(holdings.filter(h => h.coinId !== r.coinId))} className="text-gray-700 hover:text-red-400 transition-colors text-sm opacity-0 group-hover:opacity-100">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ATH breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 mb-3">Distance au ATH par actif</p>
            <div className="space-y-2">
              {rows.map(r => {
                const pctToAth = Math.abs(r.athChangePct);
                const gainPotential = r.amount * (r.ath - r.price);
                return (
                  <div key={r.coinId} className="flex items-center gap-3">
                    <img src={r.image} alt={r.name} className="w-5 h-5 rounded-full flex-shrink-0" />
                    <span className="text-xs text-gray-400 w-20 truncate">{r.symbol.toUpperCase()}</span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-yellow-300"
                        style={{ width: `${Math.max(0, 100 - pctToAth)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-yellow-400 w-12 text-right">{fmtPct(r.athChangePct)}</span>
                    <span className="text-[10px] text-gray-500 w-20 text-right">+{fmtEur(gainPotential)} si ATH</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION: CATEGORIES
         ══════════════════════════════════════════════════════════════════════ */}
      {section === "categories" && (
        <div className="space-y-4">
          {maxCatPct > 60 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
              <span className="text-red-400 text-lg">⚠️</span>
              <p className="text-red-300 text-sm">
                <strong>{categories[0]?.name}</strong> représente {categories[0]?.pct.toFixed(0)}% du portefeuille — sur-exposition à une seule catégorie
              </p>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4">
            {/* Pie chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:w-72">
              <p className="text-xs font-semibold text-gray-400 mb-3">Répartition par catégorie</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={categories} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {categories.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [fmtEur(v as number), ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {categories.map(c => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-gray-400 flex-1">{c.icon} {c.name}</span>
                    <span className="text-gray-500">{c.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category cards */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map(c => {
                const catRows = rows.filter(r => getCat(r.coinId).name === c.name);
                return (
                  <div key={c.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4" style={{ borderLeftColor: c.color, borderLeftWidth: 3 }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-white">{c.icon} {c.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded text-white font-bold" style={{ backgroundColor: c.color + "33", color: c.color }}>
                          Risque {c.risk}/10
                        </span>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-white">{fmtEur(c.value)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 bg-gray-800 rounded-full">
                        <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                      </div>
                      <span className="text-[10px] text-gray-400">{c.pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {catRows.map(r => (
                        <div key={r.coinId} className="flex items-center justify-between text-[10px] text-gray-500">
                          <span>{r.symbol.toUpperCase()}</span>
                          <span>{fmtEur(r.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION: RANK EVOLUTION
         ══════════════════════════════════════════════════════════════════════ */}
      {section === "ranks" && (
        <div className="space-y-4">
          {rankHist.length < 2 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-2xl mb-2">⏳</p>
              <p className="text-gray-400 text-sm">Historique en cours de constitution</p>
              <p className="text-gray-600 text-xs mt-1">Revenez dans 12h pour voir l&apos;évolution des classements</p>
            </div>
          ) : (
            <>
              {/* All holdings rank table */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800">
                  <p className="text-xs font-semibold text-gray-300">Évolution du rang (vs snapshot précédent)</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/40">
                    <tr>
                      <th className="px-4 py-2 text-left text-[10px] text-gray-500 uppercase">Actif</th>
                      <th className="px-4 py-2 text-right text-[10px] text-gray-500 uppercase">Rang actuel</th>
                      <th className="px-4 py-2 text-right text-[10px] text-gray-500 uppercase">Évolution</th>
                      <th className="px-4 py-2 text-right text-[10px] text-gray-500 uppercase">Tendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/40">
                    {rows.map(r => (
                      <tr key={r.coinId} className="hover:bg-gray-800/20">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <img src={r.image} alt={r.name} className="w-6 h-6 rounded-full" />
                            <span className="text-white font-medium text-sm">{r.symbol.toUpperCase()}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-300 text-sm">#{r.market_cap_rank}</td>
                        <td className="px-4 py-2.5 text-right">
                          {r.rankChange !== null ? (
                            <span className={`text-xs font-bold ${r.rankChange > 0 ? "text-emerald-400" : r.rankChange < 0 ? "text-red-400" : "text-gray-500"}`}>
                              {r.rankChange > 0 ? `▲ +${r.rankChange}` : r.rankChange < 0 ? `▼ ${r.rankChange}` : "—"}
                            </span>
                          ) : <span className="text-gray-700 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end">
                            {r.rankChange === null ? null : r.rankChange > 5 ? (
                              <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full">Rising ⭐</span>
                            ) : r.rankChange < -5 ? (
                              <span className="text-[10px] px-2 py-0.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-full">Recul ⚠️</span>
                            ) : (
                              <span className="text-[10px] text-gray-600">Stable</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Rising stars */}
                <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-xl p-4">
                  <p className="text-xs font-bold text-emerald-400 mb-3">⭐ Rising Stars</p>
                  {rising.length === 0 ? (
                    <p className="text-gray-600 text-xs">Aucun actif en progression</p>
                  ) : rising.map((r, i) => (
                    <div key={r.coinId} className="flex items-center gap-2 mb-2">
                      <span className="text-emerald-600 text-xs font-bold w-4">{i + 1}</span>
                      <img src={r.image} alt={r.name} className="w-5 h-5 rounded-full" />
                      <span className="text-white text-xs font-medium flex-1">{r.symbol.toUpperCase()}</span>
                      <span className="text-emerald-400 text-xs font-bold">▲ +{r.rankChange} rangs</span>
                    </div>
                  ))}
                </div>

                {/* À surveiller */}
                <div className="bg-red-950/40 border border-red-800/30 rounded-xl p-4">
                  <p className="text-xs font-bold text-red-400 mb-3">⚠️ À surveiller</p>
                  {falling.length === 0 ? (
                    <p className="text-gray-600 text-xs">Aucun actif en recul</p>
                  ) : falling.map((r, i) => (
                    <div key={r.coinId} className="flex items-center gap-2 mb-2">
                      <span className="text-red-600 text-xs font-bold w-4">{i + 1}</span>
                      <img src={r.image} alt={r.name} className="w-5 h-5 rounded-full" />
                      <span className="text-white text-xs font-medium flex-1">{r.symbol.toUpperCase()}</span>
                      <span className="text-red-400 text-xs font-bold">▼ {r.rankChange} rangs</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION: HEALTH SCORE
         ══════════════════════════════════════════════════════════════════════ */}
      {section === "health" && (
        <div className="space-y-4">
          {/* Score ring + overall */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-32 h-32 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1f2937" strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={health.total >= 70 ? "#22c55e" : health.total >= 45 ? "#eab308" : "#ef4444"}
                  strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={`${health.total} 100`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${healthColor}`}>{health.total}</span>
                <span className="text-[10px] text-gray-500">/100</span>
              </div>
            </div>
            <div className="flex-1">
              <p className={`text-lg font-bold ${healthColor} mb-1`}>
                {health.total >= 70 ? "Portefeuille sain" : health.total >= 45 ? "Améliorations possibles" : "Action requise"}
              </p>
              <p className="text-gray-400 text-sm mb-3">
                {health.total >= 70
                  ? "Votre portefeuille est bien équilibré et diversifié."
                  : health.total >= 45
                  ? "Quelques ajustements amélioreraient votre profil risque/rendement."
                  : "Votre portefeuille présente des déséquilibres importants à corriger."}
              </p>
              <div className="space-y-2">
                {health.criteria.map(c => (
                  <div key={c.label} className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-500 w-36 shrink-0">{c.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.score / c.max >= 0.7 ? "bg-emerald-500" : c.score / c.max >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${(c.score / c.max) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-6 text-right">{c.score}</span>
                    <span className="text-[10px] text-gray-600 w-20">{c.comment}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 mb-3">Recommandations personnalisées</p>
            <div className="space-y-2">
              {maxCatPct > 60 && (
                <div className="flex items-start gap-2.5 p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <span className="text-red-400 text-sm flex-shrink-0">🔴</span>
                  <p className="text-xs text-gray-400">Réduire la position <strong className="text-white">{categories[0]?.name}</strong> sous 40% pour limiter la concentration</p>
                </div>
              )}
              {rows.length < 5 && (
                <div className="flex items-start gap-2.5 p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                  <span className="text-yellow-400 text-sm flex-shrink-0">🟡</span>
                  <p className="text-xs text-gray-400">Ajouter {5 - rows.length} actif(s) supplémentaire(s) pour améliorer la diversification</p>
                </div>
              )}
              {rows.some(r => !r.buyPrice) && (
                <div className="flex items-start gap-2.5 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <span className="text-blue-400 text-sm flex-shrink-0">🔵</span>
                  <p className="text-xs text-gray-400">Entrez vos prix d&apos;achat pour activer le suivi P&amp;L et les suggestions DCA</p>
                </div>
              )}
              {rows.filter(r => r.buyPrice && (r.price - r.buyPrice) / r.buyPrice < -0.2).map(r => (
                <div key={r.coinId} className="flex items-start gap-2.5 p-2.5 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                  <span className="text-orange-400 text-sm flex-shrink-0">🟠</span>
                  <p className="text-xs text-gray-400">
                    <strong className="text-white">{r.symbol.toUpperCase()}</strong> est en perte de {fmtPct(r.buyPrice ? ((r.price - r.buyPrice) / r.buyPrice) * 100 : null)}.
                    Considérez un DCA pour baisser votre prix moyen.
                  </p>
                </div>
              ))}
              {health.total >= 70 && rows.length >= 5 && (
                <div className="flex items-start gap-2.5 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                  <span className="text-emerald-400 text-sm flex-shrink-0">🟢</span>
                  <p className="text-xs text-gray-400">Portefeuille équilibré — maintenez le cap et réévaluez mensuellement</p>
                </div>
              )}
            </div>
          </div>

          {/* Correlation warning */}
          {categories.filter(c => c.name !== "Stablecoin").length <= 2 && rows.length >= 3 && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
              <p className="text-yellow-400 text-xs font-semibold mb-1">⚡ Risque de corrélation élevé</p>
              <p className="text-gray-500 text-xs">
                Vos actifs sont concentrés sur {categories.length} catégorie(s). En marché baissier, ils tendront à chuter ensemble. Envisagez d&apos;ajouter des actifs décorrélés (stablecoins, or tokenisé, DeFi).
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Add form (always visible at bottom) ─────────────────────────────── */}
      <AddForm
        dropRef={dropRef} addSearch={addSearch} setAddSearch={setAddSearch}
        addId={addId} setAddId={setAddId} addAmt={addAmt} setAddAmt={setAddAmt}
        addBuyPrice={addBuyPrice} setAddBuyPrice={setAddBuyPrice}
        showDrop={showDrop} setShowDrop={setShowDrop}
        dropCoins={dropCoins} onAdd={addHolding}
      />
    </div>
  );
}

// ── Add Holding Form ──────────────────────────────────────────────────────────
function AddForm({
  dropRef, addSearch, setAddSearch, addId, setAddId,
  addAmt, setAddAmt, addBuyPrice, setAddBuyPrice,
  showDrop, setShowDrop, dropCoins, onAdd,
}: {
  dropRef: React.RefObject<HTMLDivElement | null>;
  addSearch: string; setAddSearch: (v: string) => void;
  addId: string; setAddId: (v: string) => void;
  addAmt: string; setAddAmt: (v: string) => void;
  addBuyPrice: string; setAddBuyPrice: (v: string) => void;
  showDrop: boolean; setShowDrop: (v: boolean) => void;
  dropCoins: CoinRef[];
  onAdd: () => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 mb-3">+ Ajouter un actif</p>
      <div className="flex flex-wrap gap-2 items-end">
        {/* Coin search */}
        <div className="relative flex-1 min-w-40" ref={dropRef}>
          <input
            value={addSearch}
            onChange={e => { setAddSearch(e.target.value); setShowDrop(true); setAddId(""); }}
            onFocus={() => setShowDrop(true)}
            placeholder="Rechercher une crypto…"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          {showDrop && dropCoins.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
              {dropCoins.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setAddId(c.id); setAddSearch(`${c.name} (${c.symbol.toUpperCase()})`); setShowDrop(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
                >
                  <img src={c.image} alt={c.name} className="w-5 h-5 rounded-full" />
                  <span className="text-white text-sm">{c.name}</span>
                  <span className="text-gray-500 text-xs ml-auto">{c.symbol.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Amount */}
        <input
          value={addAmt}
          onChange={e => setAddAmt(e.target.value)}
          placeholder="Quantité"
          type="number" min="0"
          className="w-28 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />

        {/* Buy price */}
        <input
          value={addBuyPrice}
          onChange={e => setAddBuyPrice(e.target.value)}
          placeholder="Prix achat ($)"
          type="number" min="0"
          className="w-36 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />

        <button
          onClick={onAdd}
          disabled={!addId || !addAmt}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
