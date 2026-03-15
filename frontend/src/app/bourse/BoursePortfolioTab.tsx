"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const StockChart = dynamic(() => import("./StockChart"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────
export interface StockHolding {
  id: string;
  ticker: string;
  qty: number;
  buyPrice: number;
  buyDate: string;          // "YYYY-MM-DD"
  currency: "USD" | "EUR";
  account: "PEA" | "CTO" | "PEA-PME";
  sector: string;
  country: string;
  dividendsReceived: number;
  targetPrice: number | null;
  alertPrice: number | null;
  alertDirection: "above" | "below";
  notes: string;
}

interface LiveQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  regularMarketChange: number;
  currency: string;
  yearHigh?: number | null;
  yearLow?: number | null;
}

interface DividendInfo {
  symbol: string;
  dividendYield?: number | null;
  dividendRate?: number | null;
  exDividendDate?: string | null;
  shortName?: string;
  trailingPE?: number | null;
  sector?: string;
  country?: string;
}

interface PortfolioHistoryPoint { time: string; value: number; }
interface OHLCBar { time: number; open: number; high: number; low: number; close: number; volume?: number; }

// ─── Constants ────────────────────────────────────────────────────────────────
const BOURSE_KEY   = "moneyprinter_bourse_v1";
const BENCHMARKS   = ["^GSPC", "^FCHI", "^IXIC"];
const BENCH_LABELS: Record<string, string> = { "^GSPC": "S&P 500", "^FCHI": "CAC 40", "^IXIC": "Nasdaq" };
const SECTORS = ["Technology","Finance","Healthcare","Consumer","Energy","Media","Automotive","Industrials","Real Estate","Utilities","Other"];
const COUNTRIES = ["US","FR","DE","GB","JP","CN","CA","AU","CH","NL","Other"];
const ACCOUNT_COLORS: Record<string, string> = {
  PEA: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  CTO: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "PEA-PME": "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtPct   = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fmtMoney = (v: number, currency = "USD") => v.toLocaleString("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 });
const pctCls   = (v: number) => v > 0 ? "text-[#00ff88]" : v < 0 ? "text-[#ff4444]" : "text-gray-500";
const pctColor = (v: number) => v > 0 ? "#00ff88" : v < 0 ? "#ff4444" : "#6b7280";

function taxRate(account: string, buyDate: string): number {
  if (account === "CTO") return 0.30;
  if (account === "PEA" || account === "PEA-PME") {
    const years = (Date.now() - new Date(buyDate).getTime()) / (365.25 * 86400000);
    return years >= 5 ? 0.172 : 0.30;
  }
  return 0.30;
}

// ─── Health Arc SVG ───────────────────────────────────────────────────────────
function HealthArc({ score }: { score: number }) {
  const color = score >= 70 ? "#00ff88" : score >= 50 ? "#fbbf24" : "#ff4444";
  const r = 56;
  const arcLen = Math.PI * r;
  const dashOffset = arcLen * (1 - score / 100);
  const label = score >= 80 ? "Excellent" : score >= 65 ? "Bon" : score >= 50 ? "Correct" : score >= 35 ? "À améliorer" : "Risqué";
  return (
    <div className="flex flex-col items-center">
      <svg className="w-44 h-[88px]" viewBox="0 -4 128 76">
        <path d="M 8 60 A 56 56 0 0 0 120 60" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
        <path d="M 8 60 A 56 56 0 0 0 120 60" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={arcLen} strokeDashoffset={dashOffset}
          style={{ filter: `drop-shadow(0 0 10px ${color})`, transition: "stroke-dashoffset 1s ease" }} />
        <text x="64" y="62" textAnchor="middle" fill={color} fontSize="22" fontWeight="900" fontFamily="monospace">{score}</text>
      </svg>
      <div className="text-center -mt-1">
        <span className="text-sm font-bold" style={{ color }}>{label}</span>
        <span className="text-gray-600 text-xs ml-1">/ 100</span>
      </div>
    </div>
  );
}

// ─── DCA Simulator ────────────────────────────────────────────────────────────
function DCASimulator({ holding, currentPrice }: { holding: StockHolding; currentPrice: number }) {
  const [addQty,   setAddQty]   = useState("");
  const [addPrice, setAddPrice] = useState(currentPrice);

  const minPrice = Math.max(0.01, currentPrice * 0.5);
  const maxPrice = currentPrice * 1.5;

  const result = useMemo(() => {
    const aq = Number(addQty);
    const ap = addPrice;
    if (!aq || !ap || aq <= 0 || ap <= 0) return null;
    const newQty    = holding.qty + aq;
    const newCost   = holding.qty * holding.buyPrice + aq * ap;
    const newPRU    = newCost / newQty;
    const newValue  = newQty * currentPrice;
    const newPnl    = newValue - newCost;
    const newPnlPct = (newPnl / newCost) * 100;
    return { newQty, newPRU, newPnl, newPnlPct };
  }, [addQty, addPrice, holding, currentPrice]);

  return (
    <div className="bg-[#141414] rounded-xl p-4 border border-white/[0.06]">
      <div className="text-gray-400 text-xs font-semibold mb-4 uppercase tracking-wider">Simulateur DCA</div>
      <div className="space-y-4">
        <div>
          <label className="text-gray-500 text-xs block mb-1.5">Qté supplémentaire</label>
          <input type="number" min="0" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="10"
            className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00ff88]/40" />
        </div>
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-gray-500 text-xs">Prix d&apos;achat</label>
            <span className="text-[#00ff88] text-xs font-mono font-bold">${addPrice.toFixed(2)}</span>
          </div>
          <input type="range" min={minPrice} max={maxPrice} step={0.01} value={addPrice}
            onChange={e => setAddPrice(Number(e.target.value))}
            className="w-full accent-[#00ff88] cursor-pointer" />
          <div className="flex justify-between text-gray-600 text-[10px] mt-1">
            <span>${minPrice.toFixed(0)}</span>
            <span className="text-gray-500">actuel: ${currentPrice.toFixed(2)}</span>
            <span>${maxPrice.toFixed(0)}</span>
          </div>
        </div>
        {result && (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/[0.06]">
            {[
              { label: "Nouveau PRU", val: `$${result.newPRU.toFixed(2)}`, cls: "text-white" },
              { label: "Qté totale", val: String(result.newQty), cls: "text-white" },
              { label: "Nouveau P&L", val: `${result.newPnlPct >= 0 ? "+" : ""}${result.newPnlPct.toFixed(1)}%`, cls: pctCls(result.newPnlPct) },
            ].map(c => (
              <div key={c.label} className="text-center">
                <div className="text-gray-600 text-[10px] mb-1">{c.label}</div>
                <div className={`font-bold font-mono text-sm ${c.cls}`}>{c.val}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Health Score ─────────────────────────────────────────────────────────────
interface HealthResult { score: number; items: { label: string; score: number; max: number; comment: string }[] }

function computeHealth(holdings: StockHolding[], quotes: Record<string, LiveQuote>): HealthResult {
  const items: HealthResult["items"] = [];

  const totalValue = holdings.reduce((s, h) => {
    const p = quotes[h.ticker]?.regularMarketPrice ?? h.buyPrice;
    return s + h.qty * p;
  }, 0);

  // 1. Diversification sectorielle (0-25 pts)
  const bySector: Record<string, number> = {};
  holdings.forEach(h => {
    const v = (quotes[h.ticker]?.regularMarketPrice ?? h.buyPrice) * h.qty;
    bySector[h.sector] = (bySector[h.sector] ?? 0) + v;
  });
  const sHHI = totalValue > 0 ? Object.values(bySector).reduce((s, v) => s + (v / totalValue) ** 2, 0) : 1;
  const sDiv = Math.round((1 - sHHI) * 25);
  const topSec = Object.entries(bySector).sort((a,b)=>b[1]-a[1])[0];
  const topSecPct = totalValue > 0 && topSec ? Math.round(topSec[1] / totalValue * 100) : 100;
  items.push({ label: "Diversification sectorielle", score: sDiv, max: 25, comment: topSec ? `${topSec[0]}: ${topSecPct}% du portefeuille` : "Aucune position" });

  // 2. Diversification géographique (0-20 pts)
  const byCountry: Record<string, number> = {};
  holdings.forEach(h => {
    const v = (quotes[h.ticker]?.regularMarketPrice ?? h.buyPrice) * h.qty;
    byCountry[h.country] = (byCountry[h.country] ?? 0) + v;
  });
  const gHHI = totalValue > 0 ? Object.values(byCountry).reduce((s, v) => s + (v / totalValue) ** 2, 0) : 1;
  const gDiv = Math.round((1 - gHHI) * 20);
  const countries = Object.keys(byCountry).length;
  items.push({ label: "Diversification géographique", score: gDiv, max: 20, comment: `${countries} pays représentés` });

  // 3. Concentration (0-20 pts)
  const positions = holdings.map(h => {
    const v = (quotes[h.ticker]?.regularMarketPrice ?? h.buyPrice) * h.qty;
    return totalValue > 0 ? v / totalValue : 0;
  });
  const maxPos = Math.max(...positions, 0);
  const concScore = Math.round(Math.max(0, (1 - maxPos / 0.3)) * 20);
  items.push({ label: "Concentration max", score: Math.min(concScore, 20), max: 20, comment: maxPos > 0 ? `Position max: ${Math.round(maxPos * 100)}%` : "Aucune position" });

  // 4. Nombre de positions (0-15 pts)
  const n = holdings.length;
  const nScore = n === 0 ? 0 : n < 5 ? 5 : n < 10 ? 10 : n < 20 ? 15 : 12;
  items.push({ label: "Nombre de positions", score: nScore, max: 15, comment: `${n} positions (idéal: 10–20)` });

  // 5. Performance générale (0-10 pts)
  const totalCost = holdings.reduce((s, h) => s + h.qty * h.buyPrice, 0);
  const pnlPct = totalCost > 0 ? (totalValue - totalCost) / totalCost * 100 : 0;
  const perfScore = pnlPct >= 20 ? 10 : pnlPct >= 10 ? 8 : pnlPct >= 0 ? 6 : pnlPct >= -10 ? 3 : 0;
  items.push({ label: "Performance globale", score: perfScore, max: 10, comment: `P&L: ${fmtPct(pnlPct)}` });

  // 6. Types de comptes (0-10 pts)
  const accts = new Set(holdings.map(h => h.account));
  const acctScore = accts.size >= 2 ? 10 : accts.size === 1 ? 5 : 0;
  items.push({ label: "Diversification fiscale", score: acctScore, max: 10, comment: [...accts].join(", ") || "Aucun" });

  const score = items.reduce((s, i) => s + i.score, 0);
  return { score, items };
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────
function AlertBanner({ holdings, quotes }: { holdings: StockHolding[]; quotes: Record<string, LiveQuote> }) {
  const triggered = holdings.filter(h => {
    if (!h.alertPrice) return false;
    const p = quotes[h.ticker]?.regularMarketPrice;
    if (!p) return false;
    return h.alertDirection === "above" ? p >= h.alertPrice : p <= h.alertPrice;
  });

  if (!triggered.length) return null;

  return (
    <div className="bg-[#ff4444]/[0.08] border border-[#ff4444]/25 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
      <span className="text-[#ff4444] font-bold text-sm">Alertes déclenchées</span>
      {triggered.map(h => {
        const p = quotes[h.ticker]?.regularMarketPrice ?? 0;
        return (
          <span key={h.id} className="bg-[#ff4444]/10 border border-[#ff4444]/20 rounded-xl px-3 py-1 text-sm flex items-center gap-1.5">
            <span className="text-[#ff4444] font-bold">{h.ticker}</span>
            <span className="text-gray-500">{h.alertDirection === "above" ? "≥" : "≤"}</span>
            <span className="text-white">${h.alertPrice}</span>
            <span className="text-gray-500">→</span>
            <span className="text-white font-mono">${p.toFixed(2)}</span>
          </span>
        );
      })}
    </div>
  );
}

// ─── Portfolio Value Chart ────────────────────────────────────────────────────
function PortfolioChart({ data }: { data: PortfolioHistoryPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data.length) return;
    import("lightweight-charts").then(({ createChart }) => {
      const chart = createChart(containerRef.current!, {
        autoSize: true,
        layout: { background: { color: "#0d0d0d" }, textColor: "#4b5563" },
        grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
        timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: false },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
        crosshair: {
          vertLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "#1a1a1a" },
          horzLine: { color: "rgba(255,255,255,0.15)", labelBackgroundColor: "#1a1a1a" },
        },
      });
      type LWTime = import("lightweight-charts").Time;
      const series = chart.addLineSeries({
        color: "#00ff88",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      series.setData(data.map(d => ({ time: d.time as LWTime, value: d.value })));
      chart.timeScale().fitContent();
      return () => chart.remove();
    });
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
type FormState = Omit<StockHolding, "id">;

const DEFAULT_FORM: FormState = {
  ticker: "", qty: 0, buyPrice: 0, buyDate: new Date().toISOString().slice(0, 10),
  currency: "USD", account: "CTO", sector: "Technology", country: "US",
  dividendsReceived: 0, targetPrice: null, alertPrice: null, alertDirection: "below", notes: "",
};

interface SearchResult { symbol: string; name: string; exchange: string; type: string; }

const INPUT_CLS = "w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00ff88]/40 transition-colors";
const SELECT_CLS = "w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00ff88]/40 transition-colors";
const LABEL_CLS = "text-gray-500 text-xs block mb-1.5";

function HoldingForm({
  initial, onSave, onCancel,
}: {
  initial?: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? DEFAULT_FORM);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/stocks/search?q=${encodeURIComponent(search)}`);
        const d = await r.json() as SearchResult[];
        if (Array.isArray(d)) setSuggestions(d.slice(0, 10));
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSugg(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const set = (k: keyof FormState, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const selectSuggestion = (s: SearchResult) => {
    set("ticker", s.symbol);
    setSearch(s.symbol);
    setShowSugg(false);
  };

  return (
    <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Ticker search */}
        <div className="col-span-2 sm:col-span-1" ref={searchRef}>
          <label className={LABEL_CLS}>Ticker *</label>
          <div className="relative">
            <input
              value={search || form.ticker}
              onChange={e => { setSearch(e.target.value); set("ticker", e.target.value.toUpperCase()); setShowSugg(true); }}
              onFocus={() => search.length >= 2 && setShowSugg(true)}
              placeholder="AAPL, LVMH..."
              className={INPUT_CLS}
            />
            {showSugg && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#141414] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden">
                {suggestions.map(s => (
                  <button key={s.symbol} onMouseDown={() => selectSuggestion(s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] text-left transition-colors">
                    <div className="w-10 h-8 bg-[#0d0d0d] rounded-md flex items-center justify-center shrink-0 border border-white/[0.06]">
                      <span className="text-[10px] font-black text-[#00ff88]">{s.symbol.slice(0,4)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-sm font-semibold truncate">{s.symbol}</div>
                      <div className="text-gray-500 text-xs truncate">{s.name}</div>
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      <div className="text-gray-500 text-xs">{s.exchange}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Quantité *</label>
          <input type="number" min="0" step="0.001" value={form.qty || ""} onChange={e => set("qty", Number(e.target.value))} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>PRU *</label>
          <input type="number" min="0" step="0.01" value={form.buyPrice || ""} onChange={e => set("buyPrice", Number(e.target.value))} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Date d&apos;achat</label>
          <input type="date" value={form.buyDate} onChange={e => set("buyDate", e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Compte</label>
          <select value={form.account} onChange={e => set("account", e.target.value)} className={SELECT_CLS}>
            {["PEA","CTO","PEA-PME"].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Devise</label>
          <select value={form.currency} onChange={e => set("currency", e.target.value)} className={SELECT_CLS}>
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Secteur</label>
          <select value={form.sector} onChange={e => set("sector", e.target.value)} className={SELECT_CLS}>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Pays</label>
          <select value={form.country} onChange={e => set("country", e.target.value)} className={SELECT_CLS}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Dividendes reçus ($)</label>
          <input type="number" min="0" step="0.01" value={form.dividendsReceived || ""} onChange={e => set("dividendsReceived", Number(e.target.value))} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Objectif de prix ($)</label>
          <input type="number" min="0" step="0.01" value={form.targetPrice ?? ""} onChange={e => set("targetPrice", e.target.value ? Number(e.target.value) : null)}
            placeholder="Optionnel" className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Alerte prix ($)</label>
          <div className="flex gap-1">
            <select value={form.alertDirection} onChange={e => set("alertDirection", e.target.value)}
              className="bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-2 py-2 text-white text-xs focus:outline-none w-14">
              <option value="below">↓</option>
              <option value="above">↑</option>
            </select>
            <input type="number" min="0" step="0.01" value={form.alertPrice ?? ""} onChange={e => set("alertPrice", e.target.value ? Number(e.target.value) : null)}
              placeholder="Prix" className={INPUT_CLS} />
          </div>
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Notes</label>
        <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Thèse d'investissement, rappels..."
          className="w-full bg-[#0d0d0d] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00ff88]/40 resize-none transition-colors" />
      </div>

      <div className="flex gap-2">
        <button onClick={() => { if (form.ticker && form.qty && form.buyPrice) onSave(form); }}
          className="px-5 py-2 rounded-xl bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 text-sm font-semibold hover:bg-[#00ff88]/20 transition-colors">
          Confirmer
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-gray-500 hover:text-white text-sm transition-colors">Annuler</button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BoursePortfolioTab() {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [quotes,   setQuotes]   = useState<Record<string, LiveQuote>>({});
  const [divInfo,  setDivInfo]  = useState<Record<string, DividendInfo>>({});
  const [benchQuotes, setBenchQuotes] = useState<LiveQuote[]>([]);
  const [history,  setHistory]  = useState<PortfolioHistoryPoint[]>([]);
  const [mounted,  setMounted]  = useState(false);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<"positions"|"health"|"dividends"|"tax"|"chart"|"scenarios">("positions");

  useEffect(() => {
    setMounted(true);
    try {
      const raw = localStorage.getItem(BOURSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StockHolding>[];
        setHoldings(parsed.map(h => ({
          id: h.id ?? Math.random().toString(36).slice(2),
          ticker: h.ticker ?? "",
          qty: h.qty ?? 0,
          buyPrice: h.buyPrice ?? 0,
          buyDate: h.buyDate ?? new Date().toISOString().slice(0, 10),
          currency: h.currency ?? "USD",
          account: h.account ?? "CTO",
          sector: h.sector ?? "Other",
          country: h.country ?? "US",
          dividendsReceived: h.dividendsReceived ?? 0,
          targetPrice: h.targetPrice ?? null,
          alertPrice: h.alertPrice ?? null,
          alertDirection: h.alertDirection ?? "below",
          notes: h.notes ?? "",
        })));
      }
    } catch {}
  }, []);

  const save = useCallback((h: StockHolding[]) => {
    setHoldings(h);
    localStorage.setItem(BOURSE_KEY, JSON.stringify(h));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    const allSyms = [...tickers, ...BENCHMARKS].join(",");
    if (!allSyms) return;
    fetch(`/api/stocks/quotes?symbols=${encodeURIComponent(allSyms)}`)
      .then(r => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) return;
        const quotes_: Record<string, LiveQuote> = {};
        (d as LiveQuote[]).forEach(q => { quotes_[q.symbol] = q; });
        setQuotes(quotes_);
        setBenchQuotes(BENCHMARKS.map(b => quotes_[b]).filter(Boolean));
      })
      .catch(() => {});
  }, [holdings, mounted]);

  useEffect(() => {
    if (!holdings.length || !mounted) return;
    const body = { holdings: holdings.map(h => ({ ticker: h.ticker, qty: h.qty, buyDate: h.buyDate })) };
    fetch("/api/stocks/portfolio-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setHistory(d as PortfolioHistoryPoint[]); })
      .catch(() => {});
  }, [holdings, mounted]);

  useEffect(() => {
    if (!holdings.length || !mounted) return;
    const tickers = [...new Set(holdings.map(h => h.ticker))];
    tickers.forEach(ticker => {
      fetch(`/api/stocks/dividends/${ticker}`)
        .then(r => r.json())
        .then(d => { if (d?.symbol) setDivInfo(prev => ({ ...prev, [ticker]: d as DividendInfo })); })
        .catch(() => {});
    });
  }, [holdings, mounted]);

  const stats = useMemo(() => {
    let totalCost = 0, totalValue = 0, totalDivs = 0;
    const bySector: Record<string, number> = {};
    const byAccount: Record<string, { cost: number; value: number; buyDate: string }> = {};

    holdings.forEach(h => {
      const p = quotes[h.ticker]?.regularMarketPrice ?? h.buyPrice;
      const cost  = h.qty * h.buyPrice;
      const value = h.qty * p;
      totalCost  += cost;
      totalValue += value;
      totalDivs  += h.dividendsReceived ?? 0;
      bySector[h.sector] = (bySector[h.sector] ?? 0) + value;
      if (!byAccount[h.account]) byAccount[h.account] = { cost: 0, value: 0, buyDate: h.buyDate };
      byAccount[h.account].cost  += cost;
      byAccount[h.account].value += value;
      if (h.buyDate < byAccount[h.account].buyDate) byAccount[h.account].buyDate = h.buyDate;
    });

    const pnl    = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

    const taxByAccount: Record<string, number> = {};
    Object.entries(byAccount).forEach(([acc, { cost, value, buyDate }]) => {
      const gain = value - cost;
      if (gain <= 0) { taxByAccount[acc] = 0; return; }
      taxByAccount[acc] = gain * taxRate(acc, buyDate);
    });
    const totalTax = Object.values(taxByAccount).reduce((a, b) => a + b, 0);

    let annualDivProjection = 0;
    holdings.forEach(h => {
      const rate = divInfo[h.ticker]?.dividendRate;
      if (rate) annualDivProjection += h.qty * rate;
    });

    let todayPnl = 0;
    holdings.forEach(h => {
      const q = quotes[h.ticker];
      if (q) todayPnl += h.qty * q.regularMarketChange;
    });

    const health = computeHealth(holdings, quotes);

    return {
      totalCost, totalValue, pnl, pnlPct, totalDivs, totalTax,
      taxByAccount, bySector, byAccount, todayPnl, annualDivProjection, health,
    };
  }, [holdings, quotes, divInfo]);

  const addHolding    = (f: FormState) => { save([...holdings, { ...f, id: Math.random().toString(36).slice(2) }]); setShowAdd(false); };
  const updateHolding = (id: string, f: FormState) => { save(holdings.map(h => h.id === id ? { ...f, id } : h)); setEditId(null); };
  const removeHolding = (id: string) => save(holdings.filter(h => h.id !== id));
  const toggleExpand  = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!mounted) return null;

  const SECTIONS = [
    ["positions","Positions"],["health","Santé /100"],["dividends","Dividendes"],
    ["tax","Fiscalité"],["chart","Courbe"],["scenarios","Scénarios"],
  ] as const;

  return (
    <div className="space-y-5">
      {/* Alert banner */}
      <AlertBanner holdings={holdings} quotes={quotes} />

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Valeur totale */}
          <div className="relative bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00ff88]/[0.04] to-transparent pointer-events-none" />
            <div className="text-gray-500 text-xs mb-1">Valeur totale</div>
            <div className="text-2xl font-black text-white">${stats.totalValue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</div>
            <div className="text-gray-600 text-xs mt-0.5">Investi: ${stats.totalCost.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</div>
          </div>
          {/* P&L total */}
          <div className="relative bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, ${stats.pnl >= 0 ? "rgba(0,255,136,0.04)" : "rgba(255,68,68,0.04)"}, transparent)` }} />
            <div className="text-gray-500 text-xs mb-1">P&L total</div>
            <div className={`text-2xl font-black ${pctCls(stats.pnlPct)}`}>{stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(0)}</div>
            <div className={`text-xs mt-0.5 ${pctCls(stats.pnlPct)}`}>{fmtPct(stats.pnlPct)}</div>
          </div>
          {/* Aujourd'hui */}
          <div className="relative bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(135deg, ${stats.todayPnl >= 0 ? "rgba(0,255,136,0.03)" : "rgba(255,68,68,0.03)"}, transparent)` }} />
            <div className="text-gray-500 text-xs mb-1">Aujourd&apos;hui</div>
            <div className={`text-2xl font-black ${pctCls(stats.todayPnl)}`}>{stats.todayPnl >= 0 ? "+" : ""}${stats.todayPnl.toFixed(0)}</div>
            <div className="text-gray-600 text-xs mt-0.5">P&L du jour</div>
          </div>
          {/* Santé */}
          <div className="relative bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="text-gray-500 text-xs mb-1">Santé</div>
            <div className={`text-2xl font-black ${stats.health.score >= 70 ? "text-[#00ff88]" : stats.health.score >= 50 ? "text-yellow-400" : "text-[#ff4444]"}`}>
              {stats.health.score}<span className="text-lg text-gray-600">/100</span>
            </div>
            <div className="text-gray-600 text-xs mt-0.5">{holdings.length} positions</div>
          </div>
        </div>
      )}

      {/* ── Benchmark comparison ──────────────────────────────────────────── */}
      {holdings.length > 0 && benchQuotes.length > 0 && (
        <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4">
          <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">Performance aujourd&apos;hui vs benchmarks</div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-gray-500 text-xs mb-0.5">Mon portefeuille</div>
              <div className={`text-lg font-bold ${pctCls(stats.todayPnl)}`}>
                {stats.totalValue > 0 ? fmtPct(stats.todayPnl / stats.totalValue * 100) : "—"}
              </div>
            </div>
            {benchQuotes.map(b => (
              <div key={b.symbol}>
                <div className="text-gray-500 text-xs mb-0.5">{BENCH_LABELS[b.symbol]}</div>
                <div className={`text-lg font-bold ${pctCls(b.regularMarketChangePercent)}`}>{fmtPct(b.regularMarketChangePercent)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section tabs (underline style) ───────────────────────────────── */}
      <div className="flex border-b border-white/[0.06] overflow-x-auto">
        {SECTIONS.map(([id, label]) => (
          <button key={id} onClick={() => setActiveSection(id)}
            className={`px-4 py-3 text-sm font-semibold whitespace-nowrap relative transition-colors ${activeSection === id ? "text-[#00ff88]" : "text-gray-500 hover:text-gray-300"}`}>
            {label}
            {activeSection === id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#00ff88]" style={{ boxShadow: "0 0 8px #00ff88" }} />
            )}
          </button>
        ))}
      </div>

      {/* ── POSITIONS ─────────────────────────────────────────────────────── */}
      {activeSection === "positions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Positions ({holdings.length})</h3>
            <button onClick={() => { setShowAdd(true); setEditId(null); }}
              className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 hover:bg-[#00ff88]/20 transition-colors">
              + Ajouter
            </button>
          </div>

          {showAdd && <HoldingForm onSave={addHolding} onCancel={() => setShowAdd(false)} />}

          {holdings.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-4 opacity-30">📊</div>
              <p className="text-lg font-medium text-gray-500 mb-1">Portefeuille vide</p>
              <p className="text-gray-600 text-sm">Ajoutez votre première position pour commencer le suivi.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {holdings.map(h => {
                const q    = quotes[h.ticker];
                const price = q?.regularMarketPrice ?? h.buyPrice;
                const value = h.qty * price;
                const cost  = h.qty * h.buyPrice;
                const pnl   = value - cost;
                const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
                const dayChg = q?.regularMarketChangePercent ?? 0;
                const tax   = pnl > 0 ? pnl * taxRate(h.account, h.buyDate) : 0;
                const weight = stats.totalValue > 0 ? (value / stats.totalValue) * 100 : 0;
                const alertTriggered = h.alertPrice && q && (
                  h.alertDirection === "above" ? q.regularMarketPrice >= h.alertPrice : q.regularMarketPrice <= h.alertPrice
                );
                const isEdit     = editId === h.id;
                const isExpanded = expanded.has(h.id);

                if (isEdit) {
                  return (
                    <div key={h.id}>
                      <HoldingForm initial={h} onSave={f => updateHolding(h.id, f)} onCancel={() => setEditId(null)} />
                    </div>
                  );
                }

                return (
                  <div key={h.id} className={`bg-[#0d0d0d] border rounded-2xl transition-all ${alertTriggered ? "border-[#ff4444]/30" : "border-white/[0.06] hover:border-white/[0.10]"}`}>
                    {/* Main row */}
                    <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => toggleExpand(h.id)}>
                      {/* Ticker + account */}
                      <div className="w-20 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white font-black">{h.ticker}</span>
                          {alertTriggered && <span className="text-[#ff4444] text-xs animate-pulse">!</span>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${ACCOUNT_COLORS[h.account]}`}>{h.account}</span>
                      </div>

                      {/* Price + day change */}
                      <div className="w-24 shrink-0">
                        <div className="text-white font-mono font-bold">${price.toFixed(2)}</div>
                        <div className="text-xs font-mono" style={{ color: pctColor(dayChg) }}>{fmtPct(dayChg)}</div>
                      </div>

                      {/* Qty */}
                      <div className="hidden sm:block w-16 shrink-0 text-gray-500 text-sm">{h.qty} act.</div>

                      {/* Weight bar + value */}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold">${value.toFixed(0)}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-[3px] bg-white/[0.05] rounded-full overflow-hidden max-w-[80px]">
                            <div className="h-full rounded-full bg-[#00ff88]/50" style={{ width: `${Math.min(weight, 100)}%` }} />
                          </div>
                          <span className="text-gray-600 text-xs">{weight.toFixed(1)}%</span>
                        </div>
                      </div>

                      {/* P&L */}
                      <div className="text-right shrink-0">
                        <div className="font-bold" style={{ color: pctColor(pnlPct) }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}</div>
                        <div className="text-xs" style={{ color: pctColor(pnlPct) }}>{fmtPct(pnlPct)}</div>
                      </div>

                      {/* Target */}
                      {h.targetPrice && (
                        <div className="hidden lg:block text-right shrink-0 w-20">
                          <div className="text-gray-600 text-[10px]">Objectif</div>
                          <div className="text-xs font-bold" style={{ color: price >= h.targetPrice ? "#00ff88" : "#60a5fa" }}>
                            ${h.targetPrice} {price >= h.targetPrice ? "✓" : `(${fmtPct((h.targetPrice - price) / price * 100)})`}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditId(h.id); setShowAdd(false); }} className="p-1.5 text-gray-600 hover:text-blue-400 transition-colors text-xs">✏</button>
                        <button onClick={() => removeHolding(h.id)} className="p-1.5 text-gray-600 hover:text-[#ff4444] transition-colors text-xs">✕</button>
                      </div>

                      <span className="text-gray-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.04] p-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          {[
                            ["PRU", `$${h.buyPrice.toFixed(2)}`],
                            ["Date d'achat", h.buyDate],
                            ["Secteur", h.sector],
                            ["Pays", h.country],
                            ["Taxe estimée", tax > 0 ? `$${tax.toFixed(0)}` : "—"],
                            ["Dividendes reçus", `$${(h.dividendsReceived ?? 0).toFixed(2)}`],
                            ["Haut 52s", q?.yearHigh ? `$${q.yearHigh!.toFixed(2)}` : "—"],
                            ["Bas 52s", q?.yearLow ? `$${q.yearLow!.toFixed(2)}` : "—"],
                          ].map(([label, val]) => (
                            <div key={label}>
                              <div className="text-gray-600 text-xs">{label}</div>
                              <div className="text-white font-medium mt-0.5">{val}</div>
                            </div>
                          ))}
                        </div>

                        {h.notes && (
                          <div className="bg-white/[0.02] rounded-xl p-3 text-gray-400 text-sm border border-white/[0.04]">{h.notes}</div>
                        )}

                        <DCASimulator holding={h} currentPrice={price} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── HEALTH ────────────────────────────────────────────────────────── */}
      {activeSection === "health" && (
        <div className="space-y-4">
          <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
            <HealthArc score={stats.health.score} />
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-gray-500 text-sm">Score global de santé du portefeuille</div>
              <div className="text-gray-400 text-xs">{holdings.length} positions analysées selon 6 critères</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {["Secteurs","Géographie","Concentration","Positions","Performance","Fiscalité"].map((t, i) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.08] text-gray-500">{t}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {stats.health.items.map(item => {
              const ratio = item.score / item.max;
              const color = ratio >= 0.7 ? "#00ff88" : ratio >= 0.4 ? "#fbbf24" : "#ff4444";
              return (
                <div key={item.label} className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-white font-medium text-sm">{item.label}</span>
                    <span className="font-bold text-sm font-mono" style={{ color }}>{item.score}<span className="text-gray-600">/{item.max}</span></span>
                  </div>
                  <div className="w-full bg-white/[0.04] rounded-full h-1.5 mb-2 overflow-hidden">
                    <div className="h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${ratio * 100}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}40` }} />
                  </div>
                  <p className="text-gray-600 text-xs">{item.comment}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DIVIDENDS ─────────────────────────────────────────────────────── */}
      {activeSection === "dividends" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Projection annuelle", value: `$${stats.annualDivProjection.toFixed(0)}`, sub: "dividendes projetés", color: "#00ff88" },
              { label: "Total reçus", value: `$${stats.totalDivs.toFixed(2)}`, sub: "dividendes cumulés", color: "#60a5fa" },
              { label: "Yield réel", value: stats.totalCost > 0 ? `${(stats.annualDivProjection / stats.totalCost * 100).toFixed(2)}%` : "—", sub: "sur coût d'acquisition", color: "#a78bfa" },
            ].map(c => (
              <div key={c.label} className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4">
                <div className="text-gray-500 text-xs mb-1">{c.label}</div>
                <div className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
                <div className="text-gray-600 text-xs mt-0.5">{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Ticker","Div/an","Yield","Prochain ex-date","Reçus (cumulé)"].map(h => (
                    <th key={h} className="px-4 py-3 text-gray-500 font-medium text-left text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const div = divInfo[h.ticker];
                  const rate = div?.dividendRate;
                  const annual = rate ? h.qty * rate : null;
                  const currentPx = quotes[h.ticker]?.regularMarketPrice || h.buyPrice;
                  const yld = rate && currentPx ? (rate / currentPx) * 100 : null;
                  return (
                    <tr key={h.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-bold text-white">{h.ticker}</td>
                      <td className="px-4 py-3 text-gray-300 font-mono">{rate ? `$${rate.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3 font-mono" style={{ color: "#00ff88" }}>{yld ? `${yld.toFixed(2)}%` : "—"}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{div?.exDividendDate ?? "—"}</td>
                      <td className="px-4 py-3 text-blue-400 font-mono">${(h.dividendsReceived ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
                {holdings.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-600">Aucune position</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Monthly projection calendar */}
          <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4">
            <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">Projection mensuelle</div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"].map(m => (
                <div key={m} className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-2.5 text-center">
                  <div className="text-gray-600 text-[10px] mb-1">{m}</div>
                  <div className="text-[#00ff88] text-sm font-bold">${(stats.annualDivProjection / 12).toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAX ───────────────────────────────────────────────────────────── */}
      {activeSection === "tax" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-[#0d0d0d] border border-purple-500/20 rounded-2xl p-4">
              <div className="text-purple-400 font-bold text-sm mb-2">CTO — Flat Tax 30%</div>
              <div className="text-gray-500 text-xs leading-relaxed">PFU : 12.8% IR + 17.2% PS. Option barème progressif si plus avantageux.</div>
            </div>
            <div className="bg-[#0d0d0d] border border-blue-500/20 rounded-2xl p-4">
              <div className="text-blue-400 font-bold text-sm mb-2">PEA — 17.2% après 5 ans</div>
              <div className="text-gray-500 text-xs leading-relaxed">Exonéré d&apos;IR après 5 ans (uniquement PS 17.2%). Avant 5 ans : flat tax 30%. Plafond 150 000€.</div>
            </div>
            <div className="bg-[#0d0d0d] border border-cyan-500/20 rounded-2xl p-4">
              <div className="text-cyan-400 font-bold text-sm mb-2">PEA-PME — 17.2%</div>
              <div className="text-gray-500 text-xs leading-relaxed">Mêmes règles que PEA. Plafond 225 000€. Abattement 40% sur dividendes si option barème.</div>
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Compte","Investi","Valeur","Plus-value","Taux","Taxe estimée","Net après impôt"].map(h => (
                    <th key={h} className="px-3 py-3 text-gray-500 font-medium text-right first:text-left text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byAccount).map(([acc, { cost, value, buyDate }]) => {
                  const gain = value - cost;
                  const rate = taxRate(acc, buyDate);
                  const tax  = gain > 0 ? gain * rate : 0;
                  const net  = value - tax;
                  return (
                    <tr key={acc} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ACCOUNT_COLORS[acc]}`}>{acc}</span></td>
                      <td className="px-3 py-3 text-right text-gray-400 font-mono">${cost.toFixed(0)}</td>
                      <td className="px-3 py-3 text-right text-white font-mono">${value.toFixed(0)}</td>
                      <td className="px-3 py-3 text-right font-mono font-semibold" style={{ color: pctColor(gain) }}>{gain >= 0 ? "+" : ""}${gain.toFixed(0)}</td>
                      <td className="px-3 py-3 text-right text-gray-400">{(rate * 100).toFixed(1)}%</td>
                      <td className="px-3 py-3 text-right text-orange-400 font-mono">${tax.toFixed(0)}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold" style={{ color: "#00ff88" }}>${net.toFixed(0)}</td>
                    </tr>
                  );
                })}
                {Object.keys(stats.byAccount).length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-600">Aucune position</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-4 text-xs text-gray-600 space-y-1.5">
            <p>Ces estimations sont indicatives. Consultez un conseiller fiscal pour votre situation personnelle.</p>
            <p>• Dividendes CTO : abattement 40% sur l&apos;assiette si option barème progressif, sinon flat tax 30%.</p>
            <p>• PEA : retrait avant 5 ans entraîne la clôture du plan (sauf cas exceptionnels).</p>
            <p>• Plus-values reportables sur 10 ans en cas de moins-value antérieure.</p>
          </div>
        </div>
      )}

      {/* ── CHART ─────────────────────────────────────────────────────────── */}
      {activeSection === "chart" && (
        <div className="space-y-4">
          {history.length > 1 ? (
            <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4">
              <div className="text-gray-400 text-sm font-medium mb-4">Évolution de la valeur du portefeuille</div>
              <div className="h-72">
                <PortfolioChart data={history} />
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-600">
                <span>{history[0]?.time}</span>
                <span className="font-semibold" style={{ color: pctColor(stats.pnlPct) }}>{fmtPct(stats.pnlPct)} depuis le début</span>
                <span>{history[history.length - 1]?.time}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-600">
              <div className="text-4xl mb-3 opacity-20">📈</div>
              <p className="text-gray-500">Données insuffisantes pour afficher la courbe.</p>
              <p className="text-sm mt-1">Ajoutez des positions et attendez quelques secondes.</p>
            </div>
          )}
        </div>
      )}

      {/* ── SCENARIOS ─────────────────────────────────────────────────────── */}
      {activeSection === "scenarios" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Bear", emoji: "🐻", pct: -25, color: "#ff4444", border: "border-[#ff4444]/15", bg: "bg-[#ff4444]/[0.04]" },
              { label: "Base", emoji: "📊", pct: +8,  color: "#60a5fa", border: "border-blue-500/20",  bg: "bg-blue-500/[0.04]" },
              { label: "Bull", emoji: "🚀", pct: +30, color: "#00ff88", border: "border-[#00ff88]/20", bg: "bg-[#00ff88]/[0.04]" },
              { label: "ATH",  emoji: "🌙", pct: +100, color: "#a78bfa", border: "border-purple-500/20", bg: "bg-purple-500/[0.04]" },
            ].map(s => {
              const projValue = stats.totalValue * (1 + s.pct / 100);
              const projPnl   = projValue - stats.totalCost;
              const projPnlPct = stats.totalCost > 0 ? (projPnl / stats.totalCost) * 100 : 0;
              return (
                <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-5 text-center`}>
                  <div className="text-2xl mb-1">{s.emoji}</div>
                  <div className="text-white font-bold text-sm mb-0.5">{s.label}</div>
                  <div className="text-gray-600 text-xs mb-3">{s.pct > 0 ? "+" : ""}{s.pct}% vs aujourd&apos;hui</div>
                  <div className="text-xl font-black mb-1" style={{ color: s.color }}>${projValue.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</div>
                  <div className="text-sm font-semibold" style={{ color: pctColor(projPnlPct) }}>{fmtPct(projPnlPct)} vs PRU</div>
                  <div className="text-xs mt-0.5" style={{ color: pctColor(projPnl) }}>{projPnl >= 0 ? "+" : ""}${projPnl.toFixed(0)}</div>
                </div>
              );
            })}
          </div>

          <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <h4 className="text-gray-400 text-sm font-medium">Scénarios par position</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Ticker</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Actuel</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: "#ff4444" }}>Bear -25%</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-blue-400">Base +8%</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium" style={{ color: "#00ff88" }}>Bull +30%</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const p = quotes[h.ticker]?.regularMarketPrice ?? h.buyPrice;
                    const val = h.qty * p;
                    return (
                      <tr key={h.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5 font-bold text-white">{h.ticker}</td>
                        <td className="px-4 py-2.5 text-right text-white font-mono">${val.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#ff4444" }}>${(val * 0.75).toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-400 font-mono">${(val * 1.08).toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#00ff88" }}>${(val * 1.30).toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
