"use client";
import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";

const StockChart = dynamic(() => import("./StockChart"), { ssr: false });

interface StockDetailProps {
  symbol: string;
  onClose: () => void;
  onAddToPortfolio?: (symbol: string) => void;
}

interface StockInfo {
  symbol: string;
  shortName?: string;
  longName?: string;
  longBusinessSummary?: string;
  sector?: string;
  industry?: string;
  country?: string;
  city?: string;
  website?: string;
  logoUrl?: string;
  fullTimeEmployees?: number;
  ceo?: string;
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  trailingEps?: number;
  dividendYield?: number;
  dividendRate?: number;
  payoutRatio?: number;
  exDividendDate?: string;
  debtToEquity?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  marketCap?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  exchange?: string;
  profitMargins?: number;
  grossMargins?: number;
  operatingMargins?: number;
  currentRatio?: number;
  quickRatio?: number;
  totalRevenue?: number;
  ebitda?: number;
  freeCashflow?: number;
}

interface OHLCBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type Period = "1d" | "5d" | "1mo" | "6mo" | "1y" | "5y";
type DetailTab = "graphique" | "analyse";

interface AIAnalysis {
  summary: string;
  positifs: string[];
  negatifs: string[];
  recommandation: "ACHETER" | "CONSERVER" | "VENDRE";
  confiance: number;
  detail: string;
  disclaimer: string;
}

// ─── Country → Flag emoji ─────────────────────────────────────────────────────
const COUNTRY_FLAGS: Record<string, string> = {
  "United States": "🇺🇸", "France": "🇫🇷", "Germany": "🇩🇪", "United Kingdom": "🇬🇧",
  "Japan": "🇯🇵", "China": "🇨🇳", "Hong Kong": "🇭🇰", "Australia": "🇦🇺",
  "Canada": "🇨🇦", "Switzerland": "🇨🇭", "Netherlands": "🇳🇱", "Sweden": "🇸🇪",
  "South Korea": "🇰🇷", "Brazil": "🇧🇷", "India": "🇮🇳", "Taiwan": "🇹🇼",
  "Spain": "🇪🇸", "Italy": "🇮🇹", "Denmark": "🇩🇰", "Norway": "🇳🇴",
  "Singapore": "🇸🇬", "Ireland": "🇮🇪", "Belgium": "🇧🇪",
};

// ─── Exchange → Human label ───────────────────────────────────────────────────
const EXCHANGE_LABELS: Record<string, string> = {
  NMS: "NASDAQ", NYQ: "NYSE", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  PAR: "Euronext Paris", GER: "XETRA", FRA: "Frankfurt", LSE: "London",
  TYO: "Tokyo", HKG: "Hong Kong", SHH: "Shanghai", ASX: "ASX",
  BSE: "BSE Mumbai", TSX: "Toronto", STO: "Stockholm",
};

function periodToInterval(period: Period): string {
  if (period === "1d") return "5m";
  if (period === "5d") return "15m";
  if (period === "1mo") return "1h";
  return "1d";
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtMoney(val?: number, currency?: string): string {
  if (val == null) return "N/A";
  const c = currency ?? "";
  if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(2)}T ${c}`.trim();
  if (Math.abs(val) >= 1e9)  return `${(val / 1e9).toFixed(2)}B ${c}`.trim();
  if (Math.abs(val) >= 1e6)  return `${(val / 1e6).toFixed(2)}M ${c}`.trim();
  return `${val.toFixed(2)} ${c}`.trim();
}

function fmtNum(val?: number, decimals = 2): string {
  if (val == null) return "N/A";
  return val.toFixed(decimals);
}

// Percentage already stored as % (e.g. dividendYield=0.42 → "0.42%")
function fmtPctDirect(val?: number): string {
  if (val == null) return "N/A";
  return `${val.toFixed(2)}%`;
}

// Percentage stored as decimal (e.g. returnOnEquity=1.52 → "152.02%")
function fmtPctDecimal(val?: number): string {
  if (val == null) return "N/A";
  return `${(val * 100).toFixed(2)}%`;
}

// ─── Score ────────────────────────────────────────────────────────────────────
function computeScore(info: StockInfo): { score: number; label: string; color: string } {
  let score = 50;
  if (info.trailingPE) {
    if (info.trailingPE < 15) score += 10;
    else if (info.trailingPE < 25) score += 6;
    else if (info.trailingPE > 50) score -= 10;
    else score -= 4;
  }
  if (info.revenueGrowth) score += Math.min(info.revenueGrowth * 100, 15);
  if (info.earningsGrowth) score += Math.min(info.earningsGrowth * 50, 10);
  if (info.returnOnEquity) score += info.returnOnEquity > 0.2 ? 8 : info.returnOnEquity > 0.1 ? 4 : 0;
  if (info.beta) score += info.beta > 0.8 && info.beta < 1.5 ? 5 : 0;
  if (info.dividendYield && info.dividendYield > 0) score += 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 80 ? "Excellent" : score >= 65 ? "Bon" : score >= 50 ? "Neutre" : score >= 35 ? "Risqué" : "Éviter";
  const color = score >= 80 ? "#00ff88" : score >= 65 ? "#22c55e" : score >= 50 ? "#fbbf24" : score >= 35 ? "#f97316" : "#ff4444";
  return { score, label, color };
}

function arcPath(score: number): string {
  const r = 52, cx = 70, cy = 70, startAngle = -210, totalArc = 240;
  const endAngle = startAngle + (score / 100) * totalArc;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const sx = cx + r * Math.cos(toRad(startAngle));
  const sy = cy + r * Math.sin(toRad(startAngle));
  const ex = cx + r * Math.cos(toRad(endAngle));
  const ey = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
}

// ─── Portfolio Modal ──────────────────────────────────────────────────────────
const PORTFOLIO_KEY = "moneyprinter_portfolio_v2";

interface PortfolioEntry {
  symbol: string;
  name: string;
  qty: number;
  buyPrice: number;
  buyDate: string;
  account: "PEA" | "CTO" | "PEA-PME";
}

function PortfolioModal({
  symbol,
  name,
  currentPrice,
  currency,
  onClose,
}: {
  symbol: string;
  name: string;
  currentPrice?: number;
  currency?: string;
  onClose: () => void;
}) {
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(currentPrice?.toFixed(2) ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState<"PEA" | "CTO" | "PEA-PME">("CTO");
  const [saved, setSaved] = useState(false);

  const total = (parseFloat(qty) || 0) * (parseFloat(price) || 0);

  const confirm = () => {
    const entry: PortfolioEntry = {
      symbol, name,
      qty: parseFloat(qty) || 0,
      buyPrice: parseFloat(price) || 0,
      buyDate: date,
      account,
    };
    try {
      const existing = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) ?? "[]") as PortfolioEntry[];
      existing.push(entry);
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(existing));
    } catch {}
    setSaved(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0a0a0a] border border-[#00ff88]/20 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 0 60px rgba(0,255,136,0.08)" }}>
        {saved ? (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#00ff88]/15 border border-[#00ff88]/30 flex items-center justify-center">
              <span className="text-[#00ff88] text-2xl">✓</span>
            </div>
            <div className="text-white font-bold text-lg">Ajouté au portefeuille !</div>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <div className="text-white font-bold text-base">Ajouter au portefeuille</div>
                <div className="text-gray-500 text-sm font-mono">{symbol} · {name}</div>
              </div>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-2xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1.5">Quantité</label>
                  <input type="number" min="0.001" step="any" value={qty} onChange={e => setQty(e.target.value)}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#00ff88]/30 transition-colors" />
                </div>
                <div>
                  <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1.5">
                    Prix d&apos;achat ({currency ?? "USD"})
                  </label>
                  <input type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)}
                    className="w-full bg-[#141414] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#00ff88]/30 transition-colors" />
                </div>
              </div>
              <div>
                <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1.5">Date d&apos;achat</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="w-full bg-[#141414] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#00ff88]/30 transition-colors" />
              </div>
              <div>
                <label className="text-gray-500 text-xs font-semibold uppercase tracking-wide block mb-1.5">Compte</label>
                <div className="flex gap-2">
                  {(["CTO", "PEA", "PEA-PME"] as const).map(a => (
                    <button key={a} onClick={() => setAccount(a)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${account === a ? "bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/25" : "bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              {total > 0 && (
                <div className="bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06] flex items-center justify-between">
                  <span className="text-gray-500 text-sm">Valeur totale</span>
                  <span className="text-white font-mono font-bold">
                    {total.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency ?? "USD"}
                  </span>
                </div>
              )}
              <button onClick={confirm}
                className="w-full py-3 rounded-xl font-bold text-sm text-black bg-[#00ff88] hover:bg-[#00ff88]/90 active:scale-95 transition-all">
                Confirmer l&apos;ajout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const ALL_INDICATORS = ["volume", "rsi", "macd", "bb", "ema9", "ema21", "ema50"] as const;
type Indicator = typeof ALL_INDICATORS[number];

function RatioCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const isNA = value === "N/A";
  return (
    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
      <div className="text-gray-500 text-xs mb-1">{label}</div>
      <div className={`font-mono font-bold text-sm ${isNA ? "text-gray-700" : highlight ? "text-[#00ff88]" : "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function SkeletonPulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-white/[0.06] rounded ${className}`} />;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StockDetail({ symbol, onClose, onAddToPortfolio }: StockDetailProps) {
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [ohlc, setOhlc] = useState<OHLCBar[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [period, setPeriod] = useState<Period>("1y");
  const [indicators, setIndicators] = useState<Set<string>>(new Set(["volume"]));
  const [mounted, setMounted] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("graphique");
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(t);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Fetch company info
  useEffect(() => {
    if (!symbol) return;
    setInfoLoading(true);
    setInfo(null);
    setLogoError(false);
    fetch(`/api/stocks/info/${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then((data: StockInfo) => setInfo(data))
      .catch(() => setInfo({ symbol }))
      .finally(() => setInfoLoading(false));
  }, [symbol]);

  // Fetch OHLC
  useEffect(() => {
    if (!symbol) return;
    const interval = periodToInterval(period);
    setChartLoading(true);
    fetch(`/api/stocks/ohlc/${encodeURIComponent(symbol)}?interval=${interval}&period=${period}`)
      .then(r => r.json())
      .then((data: OHLCBar[]) => setOhlc(Array.isArray(data) ? data : []))
      .catch(() => setOhlc([]))
      .finally(() => setChartLoading(false));
  }, [symbol, period]);

  const toggleIndicator = (ind: Indicator) => {
    setIndicators(prev => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });
  };

  const runAIAnalysis = async () => {
    if (!info || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setDetailTab("analyse");
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, info, type: "stock" }),
      });
      if (!res.ok) throw new Error();
      setAiAnalysis(await res.json() as AIAnalysis);
    } catch {
      setAiError("Impossible de contacter l'IA. Vérifiez votre clé API.");
    } finally {
      setAiLoading(false);
    }
  };

  const price = info?.regularMarketPrice;
  const changePercent = info?.regularMarketChangePercent;
  const high52 = info?.fiftyTwoWeekHigh;
  const low52 = info?.fiftyTwoWeekLow;
  const rangePercent = price != null && high52 != null && low52 != null && high52 !== low52
    ? Math.max(0, Math.min(100, ((price - low52) / (high52 - low52)) * 100))
    : null;
  const scoreData = info ? computeScore(info) : null;
  const flag = info?.country ? COUNTRY_FLAGS[info.country] ?? "🌐" : "";
  const exchLabel = info?.exchange ? EXCHANGE_LABELS[info.exchange] ?? info.exchange : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
      <div className="absolute inset-0" onClick={onClose} />

      <div className={`relative w-full max-w-5xl bg-[#050505] flex flex-col overflow-y-auto shadow-2xl transition-transform duration-300 ${mounted ? "translate-x-0" : "translate-x-full"}`}>

        {/* ── Header bar ── */}
        <div className="sticky top-0 z-10 bg-[#050505]/95 backdrop-blur border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-lg">←</button>

            {/* Logo */}
            {info?.logoUrl && !logoError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.logoUrl}
                alt={info.shortName ?? symbol}
                className="w-9 h-9 rounded-lg object-contain bg-white p-1"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-white/[0.07] border border-white/[0.08] flex items-center justify-center">
                <span className="text-[10px] font-black text-[#00ff88]">{symbol.slice(0, 3)}</span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xl text-white tracking-wider">{symbol}</span>
                {exchLabel && <span className="text-xs px-2 py-0.5 rounded bg-white/[0.07] text-gray-400 border border-white/[0.08]">{exchLabel}</span>}
                {info?.currency && <span className="text-xs px-2 py-0.5 rounded bg-white/[0.07] text-gray-400 border border-white/[0.08]">{info.currency}</span>}
              </div>
              {info?.shortName && <div className="text-gray-500 text-xs mt-0.5">{info.shortName}</div>}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-gray-400 hover:text-white transition-colors flex items-center justify-center text-lg">×</button>
        </div>

        {/* ── Price hero ── */}
        <div className="px-6 py-5 bg-[#0a0a0a] border-b border-white/[0.04]">
          {infoLoading ? (
            <div className="space-y-3">
              <SkeletonPulse className="h-5 w-48" />
              <SkeletonPulse className="h-10 w-36" />
              <SkeletonPulse className="h-4 w-full max-w-xs" />
            </div>
          ) : (
            <>
              <div className="text-gray-400 text-sm mb-1">{info?.longName ?? info?.shortName ?? symbol}</div>
              <div className="flex items-end gap-4 mb-4">
                <span className="text-4xl font-black text-white font-mono">
                  {price != null ? price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-gray-600">N/A</span>}
                </span>
                {changePercent != null && (
                  <span className={`text-xl font-bold mb-1 ${changePercent >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
                    {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                  </span>
                )}
                {price != null && info?.currency && (
                  <span className="text-gray-500 text-sm mb-1 font-mono">{info.currency}</span>
                )}
              </div>

              {/* 52-week range */}
              {rangePercent != null && (
                <div className="mb-4 max-w-lg">
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-1.5">
                    <div className="text-left">
                      <div className="text-gray-600 text-[10px]">52s bas</div>
                      <div className="font-mono text-white">{low52?.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div>
                    </div>
                    <div className="flex-1 relative h-2 bg-white/[0.06] rounded-full">
                      <div className="absolute top-0 h-full bg-gradient-to-r from-[#ff4444] via-amber-400 to-[#00ff88] rounded-full opacity-50" style={{ width: "100%" }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md border border-white/50 z-10"
                        style={{ left: `calc(${rangePercent}% - 6px)` }} />
                    </div>
                    <div className="text-right">
                      <div className="text-gray-600 text-[10px]">52s haut</div>
                      <div className="font-mono text-white">{high52?.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick badges row */}
              <div className="flex flex-wrap gap-2">
                {info?.marketCap != null && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
                    <div className="text-gray-500 text-[10px]">Cap.</div>
                    <div className="text-white text-sm font-mono font-bold">{fmtMoney(info.marketCap, info.currency)}</div>
                  </div>
                )}
                {info?.trailingPE != null && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
                    <div className="text-gray-500 text-[10px]">P/E</div>
                    <div className="text-white text-sm font-mono font-bold">{fmtNum(info.trailingPE)}</div>
                  </div>
                )}
                {info?.beta != null && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
                    <div className="text-gray-500 text-[10px]">Bêta</div>
                    <div className="text-white text-sm font-mono font-bold">{fmtNum(info.beta)}</div>
                  </div>
                )}
                {info?.dividendYield != null && info.dividendYield > 0 && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5">
                    <div className="text-gray-500 text-[10px]">Rendement</div>
                    <div className="text-[#00ff88] text-sm font-mono font-bold">{fmtPctDirect(info.dividendYield)}</div>
                  </div>
                )}
                {info?.sector && (
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-1.5">
                    <div className="text-purple-300 text-sm font-medium">{info.sector}</div>
                  </div>
                )}
                {flag && info?.country && (
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                    <span className="text-base">{flag}</span>
                    <span className="text-gray-300 text-sm">{info.country}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="px-6 flex gap-6 border-b border-white/[0.06] bg-[#050505]">
          {(["graphique", "analyse"] as DetailTab[]).map(t => (
            <button key={t} onClick={() => setDetailTab(t)}
              className={`py-3 text-sm font-semibold capitalize transition-all border-b-2 -mb-px ${detailTab === t ? "text-white border-[#00ff88]" : "text-gray-500 border-transparent hover:text-gray-300"}`}>
              {t === "graphique" ? "Graphique & Données" : "Analyse IA"}
            </button>
          ))}
        </div>

        {/* ── GRAPHIQUE TAB ── */}
        {detailTab === "graphique" && (
          <>
            {/* Timeframe + Indicators */}
            <div className="px-6 py-3 border-b border-white/[0.04] flex flex-wrap items-center gap-3">
              <div className="flex gap-1">
                {(["1d", "5d", "1mo", "6mo", "1y", "5y"] as Period[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${period === p ? "bg-[#00ff88]/15 text-[#00ff88] border-[#00ff88]/20" : "bg-transparent text-gray-500 border-white/[0.06] hover:text-gray-300"}`}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="w-px h-5 bg-white/10" />
              <div className="flex flex-wrap gap-1">
                {ALL_INDICATORS.map(ind => (
                  <button key={ind} onClick={() => toggleIndicator(ind)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${indicators.has(ind) ? "bg-blue-500/15 text-blue-400 border-blue-500/20" : "bg-transparent text-gray-600 border-white/[0.04] hover:text-gray-400"}`}>
                    {ind.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div className="px-6 py-5">
              <div className="bg-[#0a0a0a] rounded-2xl overflow-hidden border border-white/[0.04]" style={{ minHeight: 300 }}>
                {chartLoading ? (
                  <div className="flex items-center justify-center" style={{ height: 300 }}>
                    <div className="w-8 h-8 border-2 border-[#00ff88]/30 border-t-[#00ff88] rounded-full animate-spin" />
                  </div>
                ) : (
                  <div style={{ height: 300 }}>
                    <StockChart data={ohlc} indicators={indicators} />
                  </div>
                )}
              </div>
            </div>

            {/* Company Info + Financial Ratios */}
            {infoLoading ? (
              <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="bg-[#0a0a0a] rounded-2xl p-5 border border-white/[0.04] space-y-3">
                    <SkeletonPulse className="h-4 w-24" />
                    <SkeletonPulse className="h-3 w-full" />
                    <SkeletonPulse className="h-3 w-4/5" />
                    <SkeletonPulse className="h-3 w-3/5" />
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {[...Array(4)].map((_, j) => <SkeletonPulse key={j} className="h-12 rounded-xl" />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="px-6 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Company card */}
                  <div className="bg-[#0a0a0a] rounded-2xl p-5 border border-white/[0.04]">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 opacity-70">Entreprise</div>
                    {info?.longBusinessSummary && (
                      <p className="text-gray-400 text-sm leading-relaxed line-clamp-5 mb-4">{info.longBusinessSummary}</p>
                    )}
                    <div className="space-y-2">
                      {info?.industry && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">{info.sector ?? "—"}</span>
                          <span className="text-gray-500 text-xs">{info.industry}</span>
                        </div>
                      )}
                      {(info?.city ?? info?.country) && (
                        <div className="text-gray-500 text-xs flex items-center gap-1.5">
                          {flag && <span>{flag}</span>}
                          <span>{[info?.city, info?.country].filter(Boolean).join(", ")}</span>
                        </div>
                      )}
                      {info?.ceo && (
                        <div className="text-gray-500 text-xs">
                          👤 <span className="text-gray-400">{info.ceo}</span>
                        </div>
                      )}
                      {info?.fullTimeEmployees != null && (
                        <div className="text-gray-500 text-xs">
                          👥 {info.fullTimeEmployees.toLocaleString("fr-FR")} employés
                        </div>
                      )}
                      {info?.website && (
                        <a href={info.website} target="_blank" rel="noopener noreferrer"
                          className="text-blue-400 text-xs hover:text-blue-300 transition-colors flex items-center gap-1">
                          🔗 {info.website.replace(/^https?:\/\//, "").split("/")[0]}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Financial ratios */}
                  <div className="bg-[#0a0a0a] rounded-2xl p-5 border border-white/[0.04]">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 opacity-70">Ratios financiers</div>
                    <div className="grid grid-cols-2 gap-2">
                      <RatioCell label="P/E trailing" value={fmtNum(info?.trailingPE)} />
                      <RatioCell label="P/E forward" value={fmtNum(info?.forwardPE)} />
                      <RatioCell label="P/B" value={fmtNum(info?.priceToBook)} />
                      <RatioCell label="EPS" value={info?.trailingEps != null ? `${fmtNum(info.trailingEps)} ${info.currency ?? ""}`.trim() : "N/A"} />
                      <RatioCell label="Dividende" value={info?.dividendRate != null ? `${fmtNum(info.dividendRate)} ${info.currency ?? ""}`.trim() : "N/A"} />
                      <RatioCell label="Rendement" value={fmtPctDirect(info?.dividendYield)} highlight={!!info?.dividendYield && info.dividendYield > 0} />
                      <RatioCell label="ROE" value={fmtPctDecimal(info?.returnOnEquity)} />
                      <RatioCell label="ROA" value={fmtPctDecimal(info?.returnOnAssets)} />
                      <RatioCell label="Bêta" value={fmtNum(info?.beta)} />
                      <RatioCell label="Marge nette" value={fmtPctDecimal(info?.profitMargins)} />
                      <RatioCell label="Marge brute" value={fmtPctDecimal(info?.grossMargins)} />
                      <RatioCell label="Dette/FP" value={fmtNum(info?.debtToEquity)} />
                    </div>
                  </div>
                </div>

                {/* Growth & More ratios */}
                <div className="px-6 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0a0a0a] rounded-2xl p-5 border border-white/[0.04]">
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 opacity-70">Croissance & Cash-flow</div>
                    <div className="grid grid-cols-2 gap-2">
                      <RatioCell label="Croissance CA" value={fmtPctDecimal(info?.revenueGrowth)} />
                      <RatioCell label="Croissance BN" value={fmtPctDecimal(info?.earningsGrowth)} />
                      <RatioCell label="CA total" value={fmtMoney(info?.totalRevenue, info?.currency)} />
                      <RatioCell label="EBITDA" value={fmtMoney(info?.ebitda, info?.currency)} />
                      <RatioCell label="Free cash-flow" value={fmtMoney(info?.freeCashflow, info?.currency)} />
                      <RatioCell label="Marge oper." value={fmtPctDecimal(info?.operatingMargins)} />
                    </div>
                  </div>

                  {/* Score Moneyprinter */}
                  {scoreData && (
                    <div className="rounded-2xl p-5 border border-white/[0.06]"
                      style={{ background: `linear-gradient(135deg, #0a0a0a 0%, ${scoreData.color}08 100%)` }}>
                      <div className="flex items-center gap-5">
                        <div className="flex-shrink-0">
                          <svg width="130" height="90" viewBox="0 0 140 100">
                            <path d={arcPath(100)} fill="none" stroke="#1a1a1a" strokeWidth="8" strokeLinecap="round" />
                            <path d={arcPath(scoreData.score)} fill="none" stroke={scoreData.color} strokeWidth="8" strokeLinecap="round"
                              style={{ filter: `drop-shadow(0 0 6px ${scoreData.color}80)` }} />
                            <text x="70" y="66" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold" fontFamily="monospace">{scoreData.score}</text>
                            <text x="70" y="82" textAnchor="middle" fill="#666" fontSize="10">/ 100</text>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Score Moneyprinter</div>
                          <div className="text-2xl font-black mb-2" style={{ color: scoreData.color }}>{scoreData.label}</div>
                          <p className="text-gray-500 text-xs leading-relaxed">
                            {scoreData.score >= 80 ? "Fondamentaux solides, croissance positive et valorisation attractive."
                              : scoreData.score >= 65 ? "Bonne santé financière avec quelques réserves mineures."
                              : scoreData.score >= 50 ? "Profil équilibré — surveiller de près avant d'investir."
                              : scoreData.score >= 35 ? "Signaux d'alerte détectés. Analyse approfondie recommandée."
                              : "Fondamentaux dégradés. Risque élevé — prudence absolue."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* ── ANALYSE IA TAB ── */}
        {detailTab === "analyse" && (
          <div className="px-6 py-6 flex-1">
            {!aiAnalysis && !aiLoading && !aiError && (
              <div className="flex flex-col items-center justify-center py-16 gap-6">
                <div className="text-center">
                  <div className="text-5xl mb-4">🤖</div>
                  <div className="text-white font-bold text-xl mb-2">Analyse IA par Claude</div>
                  <div className="text-gray-500 text-sm max-w-sm">
                    Notre IA analyse les fondamentaux, la valorisation et les tendances pour vous donner un avis structuré.
                  </div>
                </div>
                <button onClick={runAIAnalysis}
                  className="px-8 py-4 rounded-xl font-bold text-sm text-white transition-all hover:scale-105 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #00ff88 100%)", boxShadow: "0 0 30px rgba(124,58,237,0.4)" }}>
                  ✨ ANALYSER AVEC CLAUDE IA
                </button>
              </div>
            )}

            {aiLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin" />
                  <div className="absolute inset-2 rounded-full border-2 border-[#00ff88]/20 border-t-[#00ff88] animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
                </div>
                <div className="text-gray-400 text-sm">Claude analyse {symbol}...</div>
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 max-w-sm text-center">{aiError}</div>
                <button onClick={runAIAnalysis} className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-white/[0.07] text-gray-300 hover:bg-white/[0.12] transition-colors">Réessayer</button>
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div className="space-y-4">
                <div className="rounded-2xl p-5 border"
                  style={{ background: "linear-gradient(135deg, #0a0a0a 0%, rgba(124,58,237,0.08) 100%)", borderColor: "rgba(124,58,237,0.2)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Recommandation Claude IA</div>
                      <div className="text-3xl font-black"
                        style={{ color: aiAnalysis.recommandation === "ACHETER" ? "#00ff88" : aiAnalysis.recommandation === "VENDRE" ? "#ff4444" : "#fbbf24" }}>
                        {aiAnalysis.recommandation}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-1">Confiance</div>
                      <div className="text-2xl font-bold text-white">{aiAnalysis.confiance}%</div>
                      <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1.5 ml-auto">
                        <div className="h-full rounded-full" style={{ width: `${aiAnalysis.confiance}%`, background: "linear-gradient(90deg, #7c3aed, #00ff88)" }} />
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{aiAnalysis.summary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-[#00ff88]/10">
                    <div className="text-[#00ff88] text-xs font-semibold uppercase tracking-widest mb-3">Points positifs</div>
                    <ul className="space-y-2">
                      {aiAnalysis.positifs.map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-[#00ff88] mt-0.5 flex-shrink-0">✓</span>{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-[#ff4444]/10">
                    <div className="text-[#ff4444] text-xs font-semibold uppercase tracking-widest mb-3">Points négatifs</div>
                    <ul className="space-y-2">
                      {aiAnalysis.negatifs.map((n, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-[#ff4444] mt-0.5 flex-shrink-0">✗</span>{n}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="bg-[#0a0a0a] rounded-2xl p-4 border border-white/[0.06]">
                  <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">Analyse détaillée</div>
                  <p className="text-gray-300 text-sm leading-relaxed">{aiAnalysis.detail}</p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <button onClick={runAIAnalysis} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
                    style={{ background: "linear-gradient(135deg, #7c3aed20, #4f46e520)", border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa" }}>
                    ↻ Actualiser
                  </button>
                  <p className="text-gray-600 text-xs leading-relaxed flex-1 text-right">{aiAnalysis.disclaimer}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Portfolio Modal ── */}
        {showPortfolioModal && (
          <PortfolioModal
            symbol={symbol}
            name={info?.shortName ?? info?.longName ?? symbol}
            currentPrice={price ?? undefined}
            currency={info?.currency}
            onClose={() => setShowPortfolioModal(false)}
          />
        )}

        {/* ── Bottom action bar ── */}
        <div className="sticky bottom-0 px-6 py-4 border-t border-white/[0.06] bg-[#050505]/95 backdrop-blur flex gap-3">
          <button onClick={() => setShowPortfolioModal(true)}
            className="flex-1 px-5 py-3 rounded-xl font-semibold text-sm bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/20 hover:bg-[#00ff88]/25 transition-colors">
            + Ajouter au portefeuille
          </button>
          <button onClick={runAIAnalysis} disabled={aiLoading}
            className="flex-1 px-5 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.3)" }}>
            {aiLoading ? "Analyse en cours..." : "✨ Analyse IA"}
          </button>
          <button className="px-5 py-3 rounded-xl font-semibold text-sm bg-white/[0.05] text-gray-300 border border-white/[0.08] hover:bg-white/[0.09] transition-colors">
            ☆
          </button>
        </div>
      </div>
    </div>
  );
}
