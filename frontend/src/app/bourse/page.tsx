"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import dynamic from "next/dynamic";
import BoursePortfolioTab from "./BoursePortfolioTab";

const BourseGlobe     = dynamic(() => import("./BourseGlobe"),    { ssr: false });
const StockDetailPanel = dynamic(() => import("./StockDetail"),   { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface Quote {
  symbol: string; regularMarketPrice: number; regularMarketChange: number;
  regularMarketChangePercent: number; regularMarketVolume: number | null;
  marketCap: number | null; dayHigh: number | null; dayLow: number | null;
  yearHigh: number | null; yearLow: number | null;
  currency: string; exchange: string; marketState: string;
}
interface MacroQuote { symbol: string; shortName: string; price: number; change: number; changePct: number; currency: string; marketState: string; }
interface MacroData { forex: MacroQuote[]; commodities: MacroQuote[]; macro: MacroQuote[]; fearGreed: { cnn: { score: number; rating: string } | null; crypto: { score: number; rating: string } | null }; }
interface OHLCBar { time: number; open: number; high: number; low: number; close: number; volume?: number; }
interface SearchResult { symbol: string; name: string; exchange: string; type: string; }

// ── Constants ─────────────────────────────────────────────────────────────────
const WATCHLIST_KEY = "moneyprinter_watchlist_v1";

const INDICES = [
  { symbol: "^GSPC",     label: "S&P 500",       flag: "🇺🇸", country: "États-Unis", tz: "America/New_York",  oh: 9,  om: 30, ch: 16, cm: 0  },
  { symbol: "^IXIC",     label: "Nasdaq",         flag: "🇺🇸", country: "États-Unis", tz: "America/New_York",  oh: 9,  om: 30, ch: 16, cm: 0  },
  { symbol: "^DJI",      label: "Dow Jones",      flag: "🇺🇸", country: "États-Unis", tz: "America/New_York",  oh: 9,  om: 30, ch: 16, cm: 0  },
  { symbol: "^RUT",      label: "Russell 2000",   flag: "🇺🇸", country: "États-Unis", tz: "America/New_York",  oh: 9,  om: 30, ch: 16, cm: 0  },
  { symbol: "^GDAXI",    label: "DAX",            flag: "🇩🇪", country: "Allemagne",  tz: "Europe/Berlin",     oh: 9,  om: 0,  ch: 17, cm: 30 },
  { symbol: "^FCHI",     label: "CAC 40",         flag: "🇫🇷", country: "France",     tz: "Europe/Paris",      oh: 9,  om: 0,  ch: 17, cm: 30 },
  { symbol: "^FTSE",     label: "FTSE 100",       flag: "🇬🇧", country: "Royaume-Uni",tz: "Europe/London",     oh: 8,  om: 0,  ch: 16, cm: 30 },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50",  flag: "🇪🇺", country: "Europe",    tz: "Europe/Paris",      oh: 9,  om: 0,  ch: 17, cm: 30 },
  { symbol: "^SSMI",     label: "SMI",            flag: "🇨🇭", country: "Suisse",    tz: "Europe/Zurich",     oh: 9,  om: 0,  ch: 17, cm: 30 },
  { symbol: "^IBEX",     label: "IBEX 35",        flag: "🇪🇸", country: "Espagne",   tz: "Europe/Madrid",     oh: 9,  om: 0,  ch: 17, cm: 30 },
  { symbol: "^N225",     label: "Nikkei 225",     flag: "🇯🇵", country: "Japon",     tz: "Asia/Tokyo",        oh: 9,  om: 0,  ch: 15, cm: 30 },
  { symbol: "^HSI",      label: "Hang Seng",      flag: "🇭🇰", country: "Hong Kong", tz: "Asia/Hong_Kong",    oh: 9,  om: 30, ch: 16, cm: 0  },
  { symbol: "000001.SS", label: "Shanghai",       flag: "🇨🇳", country: "Chine",     tz: "Asia/Shanghai",     oh: 9,  om: 30, ch: 15, cm: 0  },
  { symbol: "^KS11",     label: "KOSPI",          flag: "🇰🇷", country: "Corée",     tz: "Asia/Seoul",        oh: 9,  om: 0,  ch: 15, cm: 30 },
  { symbol: "^AXJO",     label: "ASX 200",        flag: "🇦🇺", country: "Australie", tz: "Australia/Sydney",  oh: 10, om: 0,  ch: 16, cm: 0  },
  { symbol: "^GSPTSE",   label: "TSX",            flag: "🇨🇦", country: "Canada",    tz: "America/Toronto",   oh: 9,  om: 30, ch: 16, cm: 0  },
];

type StockMeta = { name: string; sector: string };
const ALL_STOCK_META: Record<string, StockMeta> = {
  TSM: { name: "TSMC", sector: "Technology" }, NVO: { name: "Novo Nordisk", sector: "Healthcare" },
  ASML: { name: "ASML Holding", sector: "Technology" }, SAP: { name: "SAP SE (ADR)", sector: "Technology" },
  AZN: { name: "AstraZeneca (ADR)", sector: "Healthcare" }, SHEL: { name: "Shell plc (ADR)", sector: "Energy" },
  TM: { name: "Toyota Motor (ADR)", sector: "Automotive" }, NVS: { name: "Novartis (ADR)", sector: "Healthcare" },
  SNY: { name: "Sanofi (ADR)", sector: "Healthcare" }, HSBC: { name: "HSBC Holdings (ADR)", sector: "Finance" },
  RY: { name: "Royal Bank of Canada", sector: "Finance" }, RIO: { name: "Rio Tinto (ADR)", sector: "Industrials" },
  AAPL: { name: "Apple Inc.", sector: "Technology" }, MSFT: { name: "Microsoft Corp.", sector: "Technology" },
  NVDA: { name: "NVIDIA Corp.", sector: "Technology" }, AMZN: { name: "Amazon.com Inc.", sector: "Consumer" },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology" }, META: { name: "Meta Platforms", sector: "Technology" },
  TSLA: { name: "Tesla Inc.", sector: "Automotive" }, JPM: { name: "JPMorgan Chase", sector: "Finance" },
  UNH: { name: "UnitedHealth Group", sector: "Healthcare" }, V: { name: "Visa Inc.", sector: "Finance" },
  LLY: { name: "Eli Lilly", sector: "Healthcare" }, JNJ: { name: "Johnson & Johnson", sector: "Healthcare" },
  XOM: { name: "ExxonMobil Corp.", sector: "Energy" }, MA: { name: "Mastercard Inc.", sector: "Finance" },
  HD: { name: "Home Depot Inc.", sector: "Consumer" }, PG: { name: "Procter & Gamble", sector: "Consumer" },
  AVGO: { name: "Broadcom Inc.", sector: "Technology" }, MRK: { name: "Merck & Co.", sector: "Healthcare" },
  PEP: { name: "PepsiCo Inc.", sector: "Consumer" }, COST: { name: "Costco Wholesale", sector: "Consumer" },
  ABBV: { name: "AbbVie Inc.", sector: "Healthcare" }, KO: { name: "Coca-Cola Co.", sector: "Consumer" },
  WMT: { name: "Walmart Inc.", sector: "Consumer" }, CRM: { name: "Salesforce Inc.", sector: "Technology" },
  NFLX: { name: "Netflix Inc.", sector: "Media" }, AMD: { name: "Advanced Micro Devices", sector: "Technology" },
  BAC: { name: "Bank of America", sector: "Finance" }, DIS: { name: "Walt Disney Co.", sector: "Media" },
  INTC: { name: "Intel Corp.", sector: "Technology" }, PLTR: { name: "Palantir Technologies", sector: "Technology" },
  "MC.PA": { name: "LVMH", sector: "Consumer" }, "TTE.PA": { name: "TotalEnergies", sector: "Energy" },
  "SAN.PA": { name: "Sanofi", sector: "Healthcare" }, "AIR.PA": { name: "Airbus SE", sector: "Industrials" },
  "BNP.PA": { name: "BNP Paribas", sector: "Finance" }, "OR.PA": { name: "L'Oréal", sector: "Consumer" },
  "AI.PA": { name: "Air Liquide", sector: "Industrials" }, "SU.PA": { name: "Schneider Electric", sector: "Industrials" },
  "CS.PA": { name: "AXA SA", sector: "Finance" }, "ACA.PA": { name: "Crédit Agricole", sector: "Finance" },
  "GLE.PA": { name: "Société Générale", sector: "Finance" }, "KER.PA": { name: "Kering SA", sector: "Consumer" },
  "RI.PA": { name: "Pernod Ricard", sector: "Consumer" }, "SAF.PA": { name: "Safran SA", sector: "Industrials" },
  "CAP.PA": { name: "Capgemini SE", sector: "Technology" }, "RMS.PA": { name: "Hermès International", sector: "Consumer" },
  "HSBA.L": { name: "HSBC Holdings", sector: "Finance" }, "BP.L": { name: "BP plc", sector: "Energy" },
  "RIO.L": { name: "Rio Tinto", sector: "Industrials" }, "SHEL.L": { name: "Shell plc", sector: "Energy" },
  "AZN.L": { name: "AstraZeneca", sector: "Healthcare" }, "GSK.L": { name: "GSK plc", sector: "Healthcare" },
  "ULVR.L": { name: "Unilever plc", sector: "Consumer" }, "BARC.L": { name: "Barclays plc", sector: "Finance" },
  "LLOY.L": { name: "Lloyds Banking", sector: "Finance" },
  "SAP.DE": { name: "SAP SE", sector: "Technology" }, "SIE.DE": { name: "Siemens AG", sector: "Industrials" },
  "ALV.DE": { name: "Allianz SE", sector: "Finance" }, "BMW.DE": { name: "BMW AG", sector: "Automotive" },
  "BAS.DE": { name: "BASF SE", sector: "Industrials" }, "BAYN.DE": { name: "Bayer AG", sector: "Healthcare" },
  "VOW3.DE": { name: "Volkswagen AG", sector: "Automotive" }, "ADS.DE": { name: "Adidas AG", sector: "Consumer" },
  "7203.T": { name: "Toyota Motor", sector: "Automotive" }, "9984.T": { name: "SoftBank Group", sector: "Technology" },
  "6758.T": { name: "Sony Group Corp.", sector: "Technology" }, "6861.T": { name: "Keyence Corp.", sector: "Technology" },
  "0700.HK": { name: "Tencent Holdings", sector: "Technology" }, "0941.HK": { name: "China Mobile", sector: "Technology" },
  "1299.HK": { name: "AIA Group", sector: "Finance" },
};

const TOP50_WORLD = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","TSM","LLY",
  "NVO","JPM","V","UNH","MA","XOM","WMT","COST","JNJ","PG",
  "HD","ASML","MRK","ABBV","KO","PEP","BAC","CRM","NFLX","AMD",
  "MC.PA","TTE.PA","RMS.PA","OR.PA","AIR.PA","SAP","AZN","SHEL","NVS","RIO",
  "TM","SNY","HSBC","RY","0700.HK","9984.T","7203.T","6758.T","SIE.DE","BNP.PA",
];

const EXCHANGE_DATA = [
  { id: "WORLD", name: "Monde — Top 50", flag: "🌐", currency: "—", symbols: TOP50_WORLD },
  { id: "US", name: "NYSE / NASDAQ", flag: "🇺🇸", currency: "USD", symbols: ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","JPM","UNH","V","LLY","JNJ","XOM","MA","HD","PG","AVGO","MRK","PEP","COST","ABBV","KO","WMT","CRM","NFLX","AMD","BAC","DIS","INTC","PLTR"] },
  { id: "FR", name: "Euronext Paris", flag: "🇫🇷", currency: "EUR", symbols: ["MC.PA","TTE.PA","SAN.PA","AIR.PA","BNP.PA","OR.PA","AI.PA","SU.PA","CS.PA","ACA.PA","GLE.PA","KER.PA","RI.PA","SAF.PA","CAP.PA","RMS.PA"] },
  { id: "UK", name: "London LSE", flag: "🇬🇧", currency: "GBP", symbols: ["HSBA.L","BP.L","RIO.L","SHEL.L","AZN.L","GSK.L","ULVR.L","BARC.L","LLOY.L"] },
  { id: "DE", name: "Frankfurt Xetra", flag: "🇩🇪", currency: "EUR", symbols: ["SAP.DE","SIE.DE","ALV.DE","BMW.DE","BAS.DE","BAYN.DE","VOW3.DE","ADS.DE"] },
  { id: "JP", name: "Tokyo TSE", flag: "🇯🇵", currency: "JPY", symbols: ["7203.T","9984.T","6758.T","6861.T"] },
  { id: "HK", name: "Hong Kong HKEX", flag: "🇭🇰", currency: "HKD", symbols: ["0700.HK","0941.HK","1299.HK"] },
];

const SECTOR_CLS: Record<string, string> = {
  Technology: "bg-blue-500/[0.12] text-blue-400 border-blue-500/25",
  Finance: "bg-violet-500/[0.12] text-violet-400 border-violet-500/25",
  Healthcare: "bg-sky-500/[0.12] text-sky-400 border-sky-500/25",
  Consumer: "bg-amber-500/[0.12] text-amber-400 border-amber-500/25",
  Energy: "bg-orange-500/[0.12] text-orange-400 border-orange-500/25",
  Media: "bg-pink-500/[0.12] text-pink-400 border-pink-500/25",
  Automotive: "bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/25",
  Industrials: "bg-yellow-500/[0.12] text-yellow-400 border-yellow-500/25",
  Utilities: "bg-teal-500/[0.12] text-teal-400 border-teal-500/25",
};

const EARNINGS_EVENTS = [
  { ticker: "TSLA",  date: "2026-04-22", est: "-15%", impact: "Fort",  type: "Earnings", logo: "TSLA", poly: "tesla"    },
  { ticker: "JPM",   date: "2026-04-14", est: "+8%",  impact: "Moyen", type: "Earnings", logo: "JPM",  poly: "jpmorgan" },
  { ticker: "META",  date: "2026-04-29", est: "+18%", impact: "Fort",  type: "Earnings", logo: "META", poly: "meta"     },
  { ticker: "GOOGL", date: "2026-04-29", est: "+10%", impact: "Fort",  type: "Earnings", logo: "GOOGL",poly: "google"   },
  { ticker: "AMZN",  date: "2026-05-01", est: "+22%", impact: "Fort",  type: "Earnings", logo: "AMZN", poly: "amazon"   },
  { ticker: "AAPL",  date: "2026-05-01", est: "+5%",  impact: "Fort",  type: "Earnings", logo: "AAPL", poly: "apple"    },
  { ticker: "MSFT",  date: "2026-04-30", est: "+12%", impact: "Fort",  type: "Earnings", logo: "MSFT", poly: "microsoft"},
  { ticker: "NVDA",  date: "2026-05-28", est: "+65%", impact: "Fort",  type: "Earnings", logo: "NVDA", poly: "nvidia"   },
];
const MACRO_EVENTS = [
  { title: "FOMC Meeting",        date: "2026-03-18", impact: "Fort",  category: "Fed",         forecast: "Inchangé",    previous: "4.25-4.50%" },
  { title: "US CPI (Fév)",        date: "2026-03-20", impact: "Fort",  category: "Inflation",   forecast: "+2.8% YoY",  previous: "+3.0% YoY"  },
  { title: "US GDP Q4 Final",     date: "2026-03-25", impact: "Moyen", category: "Croissance",  forecast: "+2.3%",       previous: "+2.3%"      },
  { title: "Core PCE (Fév)",      date: "2026-03-28", impact: "Fort",  category: "Inflation",   forecast: "+2.6%",       previous: "+2.8%"      },
  { title: "US NFP (Mar)",        date: "2026-04-04", impact: "Fort",  category: "Emploi",      forecast: "+180K",       previous: "+151K"      },
  { title: "US CPI (Mar)",        date: "2026-04-10", impact: "Fort",  category: "Inflation",   forecast: "+2.6% YoY",  previous: "+2.8% YoY"  },
  { title: "BCE Meeting",         date: "2026-04-22", impact: "Fort",  category: "BCE",         forecast: "-25bp",       previous: "2.65%"      },
  { title: "US GDP Q1 Advance",   date: "2026-04-29", impact: "Fort",  category: "Croissance",  forecast: "+1.8%",       previous: "+2.3%"      },
];
const MACRO_DESC: Record<string, { name: string; desc: string }> = {
  "^TNX": { name: "US 10Y", desc: "Taux obligataire" },
  "^VIX": { name: "VIX", desc: "Indice de volatilité" },
  "DX-Y.NYB": { name: "DXY", desc: "Dollar Index" },
  "^IRX": { name: "US 3M", desc: "Taux court terme" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMarketStatus(tz: string, oh: number, om: number, ch: number, cm: number): "OPEN" | "CLOSED" {
  try {
    const now = new Date();
    const fmt = (o: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).formatToParts(now);
    const day = fmt({ weekday: "short" }).find(p => p.type === "weekday")?.value;
    if (day === "Sat" || day === "Sun") return "CLOSED";
    const parts = fmt({ hour: "numeric", minute: "numeric", hour12: false });
    const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
    return h * 60 + m >= oh * 60 + om && h * 60 + m < ch * 60 + cm ? "OPEN" : "CLOSED";
  } catch { return "CLOSED"; }
}

function seededSparkline(changePct: number, symbol: string, n = 20): number[] {
  const seed = symbol.split("").reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  const rand = (s: number) => { const x = Math.sin(s) * 9999; return x - Math.floor(x); };
  const pts = [0];
  for (let i = 1; i < n - 1; i++) {
    const drift = changePct * (i / (n - 1));
    const noise = (rand(seed + i) - 0.5) * Math.abs(changePct) * 0.6;
    pts.push(pts[i - 1] + (drift + noise - pts[i - 1]) * 0.2);
  }
  pts.push(changePct);
  return pts;
}

const Sparkline = memo(function Sparkline({ data, color = "#00ff88", w = 72, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} className="bg-white/[0.04] rounded" />;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
});

const fmtPct = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const fmtBig = (v: number) => Math.abs(v) >= 1e12 ? (v/1e12).toFixed(1)+"T" : Math.abs(v) >= 1e9 ? (v/1e9).toFixed(1)+"B" : Math.abs(v) >= 1e6 ? (v/1e6).toFixed(1)+"M" : v.toFixed(0);
const pctColor = (v: number) => v > 0 ? "#00ff88" : v < 0 ? "#ff4444" : "#6b7280";
const pctCls   = (v: number) => v > 0 ? "text-[#00ff88]" : v < 0 ? "text-[#ff4444]" : "text-gray-500";

const SkeletonRow = memo(function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-white/[0.03]">
      <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-white/[0.04] rounded-lg" /><div className="space-y-1.5"><div className="h-3 w-16 bg-white/[0.06] rounded" /><div className="h-2 w-24 bg-white/[0.03] rounded" /></div></div></td>
      <td className="px-3 py-3.5"><div className="h-5 w-20 bg-white/[0.04] rounded-lg" /></td>
      <td className="px-3 py-3.5 text-right"><div className="h-4 w-16 bg-white/[0.06] rounded ml-auto" /></td>
      <td className="px-3 py-3.5"><div className="h-4 w-20 bg-white/[0.04] rounded mx-auto" /></td>
      <td className="px-3 py-3.5 text-right"><div className="h-4 w-12 bg-white/[0.04] rounded ml-auto" /></td>
      <td className="px-3 py-3.5 text-right"><div className="h-4 w-14 bg-white/[0.04] rounded ml-auto" /></td>
      <td className="px-3 py-3.5"><div className="w-16 h-6 bg-white/[0.04] rounded ml-auto" /></td>
      <td className="px-3 py-3.5"><div className="h-5 w-5 bg-white/[0.04] rounded ml-auto" /></td>
    </tr>
  );
});

// ── StockSearch ───────────────────────────────────────────────────────────────
function StockSearch({ onSelect }: { onSelect: (sym: string) => void }) {
  const [q, setQ] = useState(""), [results, setResults] = useState<SearchResult[]>([]), [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`).then(r => r.json()) as SearchResult[];
        if (Array.isArray(d)) { setResults(d.slice(0, 8)); setOpen(true); }
      } catch { setResults([]); }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600 w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Rechercher une action..."
          className="w-64 bg-[#0d0d0d] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-[#e0e0e0] text-sm placeholder-gray-600 focus:outline-none focus:border-[#00ff88]/30 transition-colors" />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-[#0d0d0d] border border-white/[0.08] rounded-2xl shadow-2xl z-50 overflow-hidden">
          {results.map(s => (
            <button key={s.symbol} onMouseDown={() => { onSelect(s.symbol); setQ(""); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] text-left transition-colors border-b border-white/[0.04] last:border-0">
              <div className="w-9 h-7 bg-white/[0.03] border border-white/[0.06] rounded-lg flex items-center justify-center shrink-0">
                <span className="text-[9px] font-black text-[#00ff88]">{s.symbol.slice(0,4)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[#e0e0e0] text-sm font-semibold">{s.symbol}</div>
                <div className="text-gray-500 text-xs truncate">{s.name}</div>
              </div>
              <div className="text-gray-600 text-xs shrink-0">{s.exchange}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── IndicesTab ────────────────────────────────────────────────────────────────
function IndicesTab({ onViewStock }: { onViewStock: (s: string) => void }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"cards" | "heatmap">("cards");

  useEffect(() => {
    const syms = INDICES.map(i => i.symbol).join(",");
    fetch(`/api/bourse/quotes?symbols=${encodeURIComponent(syms)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setQuotes(d as Quote[]); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const qmap = useMemo(() => {
    const m: Record<string, Quote> = {};
    (quotes as (Quote & { symbol?: string; regularMarketChangePercent?: number; regularMarketPrice?: number })[]).forEach(q => { m[q.symbol] = q; });
    return m;
  }, [quotes]);

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white font-bold text-lg">Indices Mondiaux</h3>
        <div className="flex gap-1 p-0.5 bg-white/[0.04] border border-white/[0.06] rounded-lg">
          {(["cards", "heatmap"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${view === v ? "bg-white/[0.08] text-white" : "text-gray-500 hover:text-gray-300"}`}>
              {v === "cards" ? "📊 Cartes" : "🟩 Heatmap"}
            </button>
          ))}
        </div>
      </div>

      {view === "heatmap" ? (
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
          {INDICES.map(idx => {
            const q = qmap[idx.symbol];
            const pct = q?.regularMarketChangePercent ?? 0;
            const abs = Math.min(Math.abs(pct) / 3, 1);
            const bg = pct > 0 ? `rgba(0,255,136,${0.08 + abs * 0.25})` : pct < 0 ? `rgba(255,68,68,${0.08 + abs * 0.25})` : "rgba(100,100,100,0.08)";
            const bc = pct > 0 ? `rgba(0,255,136,${0.15 + abs * 0.3})` : pct < 0 ? `rgba(255,68,68,${0.15 + abs * 0.3})` : "rgba(100,100,100,0.1)";
            return (
              <button key={idx.symbol} onClick={() => onViewStock(idx.symbol)}
                className="rounded-xl p-3 text-left transition-all hover:scale-105"
                style={{ background: bg, border: `1px solid ${bc}` }}>
                <div className="text-lg mb-1">{idx.flag}</div>
                <div className="text-white text-xs font-bold leading-tight">{idx.label}</div>
                {loading ? <div className="h-3 w-12 bg-white/[0.06] rounded mt-1.5 animate-pulse" /> : (
                  <div className={`text-xs font-mono font-bold mt-1 ${pctCls(pct)}`}>{fmtPct(pct)}</div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {INDICES.map(idx => {
            const q = qmap[idx.symbol];
            const pct = q?.regularMarketChangePercent ?? 0;
            const price = q?.regularMarketPrice;
            const status = getMarketStatus(idx.tz, idx.oh, idx.om, idx.ch, idx.cm);
            const spark = seededSparkline(pct, idx.symbol);
            const hi = q?.dayHigh, lo = q?.dayLow;
            const dayRange = hi && lo && price ? Math.max(0, Math.min(100, ((price - lo) / (hi - lo)) * 100)) : null;
            return (
              <button key={idx.symbol} onClick={() => onViewStock(idx.symbol)}
                className="group bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-4 text-left transition-all hover:border-white/[0.12] hover:shadow-[0_0_20px_rgba(0,255,136,0.04)]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xl">{idx.flag}</span>
                      <div>
                        <div className="text-white font-bold text-sm">{idx.label}</div>
                        <div className="text-gray-600 text-[10px]">{idx.country}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${status === "OPEN" ? "bg-[#00ff88] animate-pulse" : "bg-gray-700"}`} />
                    <span className={`text-[10px] font-semibold ${status === "OPEN" ? "text-[#00ff88]" : "text-gray-600"}`}>
                      {status === "OPEN" ? "Ouvert" : "Fermé"}
                    </span>
                  </div>
                </div>

                {loading ? (
                  <div className="space-y-2">
                    <div className="h-6 w-28 bg-white/[0.06] rounded animate-pulse" />
                    <div className="h-4 w-16 bg-white/[0.04] rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between mb-2">
                      <div>
                        <div className="text-white font-mono font-bold text-xl">
                          {price != null ? price.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}
                        </div>
                        <div className={`font-mono font-bold text-sm ${pctCls(pct)}`}>{fmtPct(pct)}</div>
                      </div>
                      <Sparkline data={spark} color={pct >= 0 ? "#00ff88" : "#ff4444"} />
                    </div>

                    {dayRange != null && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                          <span>{lo?.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</span>
                          <span className="text-gray-500">Range 24h</span>
                          <span>{hi?.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden relative">
                          <div className="absolute h-full bg-gradient-to-r from-[#ff4444] via-amber-400 to-[#00ff88]" style={{ width: "100%", opacity: 0.4 }} />
                          <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-md"
                            style={{ left: `calc(${dayRange}% - 5px)` }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ActionsTab ────────────────────────────────────────────────────────────────
type QuickFilter = "all" | "gainers" | "losers" | "volume" | "watchlist";

function ActionsTab({ onViewStock, activeExchange, onExchangeChange }: {
  onViewStock: (s: string) => void; activeExchange: string; onExchangeChange: (id: string) => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState("marketCap");
  const [asc, setAsc] = useState(false);
  const [quick, setQuick] = useState<QuickFilter>("all");

  const exchDef = useMemo(() => EXCHANGE_DATA.find(e => e.id === activeExchange) ?? EXCHANGE_DATA[0], [activeExchange]);
  const SECTORS = useMemo(() => ["All", ...Array.from(new Set(exchDef.symbols.map(s => ALL_STOCK_META[s]?.sector).filter(Boolean) as string[]))], [exchDef]);

  useEffect(() => {
    try { const r = localStorage.getItem(WATCHLIST_KEY); if (r) setWatchlist(JSON.parse(r) as string[]); } catch {}
  }, []);

  useEffect(() => {
    if (!exchDef.symbols.length) return;
    setLoading(true); setSector("All"); setQuick("all");
    fetch(`/api/stocks/quotes?symbols=${encodeURIComponent(exchDef.symbols.join(","))}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setQuotes(d as Quote[]); })
      .catch(() => {}).finally(() => setLoading(false));
  }, [exchDef]);

  const toggleWL = useCallback((sym: string) => setWatchlist(prev => {
    const next = prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym];
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    return next;
  }), []);

  const onSort = useCallback((col: string) => {
    if (sort === col) setAsc(a => !a); else { setSort(col); setAsc(false); }
  }, [sort]);

  const rows = useMemo(() => {
    let list = quotes.filter(q => {
      if (sector !== "All" && ALL_STOCK_META[q.symbol]?.sector !== sector) return false;
      if (quick === "watchlist" && !watchlist.includes(q.symbol)) return false;
      if (quick === "gainers" && q.regularMarketChangePercent <= 0) return false;
      if (quick === "losers" && q.regularMarketChangePercent >= 0) return false;
      return true;
    });
    if (quick === "volume") list = [...list].sort((a, b) => (b.regularMarketVolume ?? 0) - (a.regularMarketVolume ?? 0));
    else list = [...list].sort((a, b) => {
      const va = (a as unknown as Record<string, number>)[sort] ?? 0;
      const vb = (b as unknown as Record<string, number>)[sort] ?? 0;
      return asc ? va - vb : vb - va;
    });
    return list;
  }, [quotes, sector, sort, asc, quick, watchlist]);

  const Th = ({ col, label, right = true }: { col: string; label: string; right?: boolean }) => (
    <th onClick={() => onSort(col)} className={`px-3 py-3.5 text-gray-600 text-xs font-semibold uppercase tracking-wide cursor-pointer hover:text-gray-400 select-none transition-colors ${right ? "text-right" : "text-left"}`}>
      {label}{sort === col ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Exchange filter */}
      <div className="flex flex-wrap gap-2">
        {EXCHANGE_DATA.map(ex => (
          <button key={ex.id} onClick={() => onExchangeChange(ex.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeExchange === ex.id ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20" : "bg-[#0d0d0d] text-gray-500 border border-white/[0.06] hover:border-white/[0.10] hover:text-gray-300"}`}>
            <span>{ex.flag}</span><span>{ex.name}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <StockSearch onSelect={sym => onViewStock(sym)} />
        <div className="flex gap-1">
          {([["all","Tous"], ["gainers","🚀 Hausse"], ["losers","📉 Baisse"], ["volume","📊 Volume"], ["watchlist","⭐ Favoris"]] as [QuickFilter, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setQuick(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${quick === id ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20" : "text-gray-500 bg-white/[0.03] border border-white/[0.05] hover:text-gray-300"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {SECTORS.map(s => (
            <button key={s} onClick={() => setSector(s)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${sector === s ? "text-[#e0e0e0] bg-white/[0.08] border border-white/[0.12]" : "text-gray-600 hover:text-gray-400 bg-white/[0.02] border border-white/[0.04]"}`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="text-left px-4 py-3.5 text-gray-600 text-xs font-semibold uppercase tracking-wide">Titre</th>
              <th className="text-left px-3 py-3.5 text-gray-600 text-xs font-semibold uppercase tracking-wide">Secteur</th>
              <Th col="regularMarketPrice" label="Prix" />
              <th className="px-3 py-3.5 text-gray-600 text-xs font-semibold uppercase tracking-wide text-center">Var %</th>
              <Th col="regularMarketVolume" label="Volume" />
              <Th col="marketCap" label="Cap." />
              <th className="px-3 py-3.5 text-gray-600 text-xs font-semibold uppercase tracking-wide text-right">7j</th>
              <th className="px-3 py-3.5 w-8 text-gray-600 text-xs font-semibold uppercase">⭐</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>{[...Array(10)].map((_, i) => <SkeletonRow key={i} />)}</tbody>
          ) : (
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-600 text-sm">Aucun résultat</td></tr>
              ) : rows.map(q => {
                const meta = ALL_STOCK_META[q.symbol];
                const sectorCls = meta ? SECTOR_CLS[meta.sector] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20" : "";
                const pct = q.regularMarketChangePercent;
                const spark = seededSparkline(pct, q.symbol);
                const inWL = watchlist.includes(q.symbol);
                return (
                  <tr key={q.symbol} onClick={() => onViewStock(q.symbol)}
                    className="border-b border-white/[0.03] hover:bg-white/[0.025] cursor-pointer transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-white/[0.04] border border-white/[0.06] rounded-lg flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-black text-[#00ff88]">{q.symbol.slice(0, 4)}</span>
                        </div>
                        <div>
                          <div className="text-[#e0e0e0] font-mono font-bold text-sm">{q.symbol}</div>
                          <div className="text-gray-500 text-xs truncate max-w-[140px]">{meta?.name ?? q.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      {meta && <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sectorCls}`}>{meta.sector}</span>}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-bold text-[#e0e0e0]">
                      {q.regularMarketPrice.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-1 bg-white/[0.05] rounded-full overflow-hidden relative shrink-0">
                          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10" />
                          <div className="absolute top-0 bottom-0 rounded-full"
                            style={{ [pct >= 0 ? "left" : "right"]: "50%", width: `${Math.min(Math.abs(pct) / 6 * 50, 50)}%`, backgroundColor: pctColor(pct), opacity: 0.8 }} />
                        </div>
                        <span className="text-xs font-mono font-bold w-14 shrink-0" style={{ color: pctColor(pct) }}>{fmtPct(pct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right text-gray-400 text-sm font-mono">{q.regularMarketVolume != null ? fmtBig(q.regularMarketVolume) : "—"}</td>
                    <td className="px-3 py-3.5 text-right text-gray-400 text-sm font-mono">{q.marketCap != null ? fmtBig(q.marketCap) : "—"}</td>
                    <td className="px-3 py-3.5 text-right">
                      <Sparkline data={spark} color={pct >= 0 ? "#00ff88" : "#ff4444"} w={64} h={24} />
                    </td>
                    <td className="px-3 py-3.5" onClick={e => { e.stopPropagation(); toggleWL(q.symbol); }}>
                      <span className={`text-lg cursor-pointer transition-colors ${inWL ? "text-amber-400" : "text-gray-700 hover:text-gray-500"}`}>{inWL ? "★" : "☆"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

// ── CatalyseurTab ─────────────────────────────────────────────────────────────
const CAT_TYPE_CLS: Record<string, string> = {
  Earnings: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Fed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BCE: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Inflation: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Emploi: "bg-green-500/15 text-green-400 border-green-500/30",
  Croissance: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};
const IMPACT_CLS: Record<string, string> = {
  Fort: "bg-red-500/10 text-red-400 border-red-500/20",
  Moyen: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Faible: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

function CatalyseurTab() {
  const today = "2026-03-15";
  const allEvents = [
    ...EARNINGS_EVENTS.map(e => ({ ...e, category: "Earnings", isEarning: true })),
    ...MACRO_EVENTS.map(e => ({ ...e, ticker: "", logo: "", est: "", poly: "", isEarning: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const thisWeek = allEvents.filter(e => e.date >= today && e.date <= "2026-03-21");
  const thisMonth = allEvents.filter(e => e.date > "2026-03-21" && e.date <= "2026-03-31");
  const later = allEvents.filter(e => e.date > "2026-03-31");

  const Section = ({ title, events }: { title: string; events: typeof allEvents }) => (
    events.length > 0 ? (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-gray-500 text-xs font-bold uppercase tracking-widest">{title}</div>
          <div className="flex-1 h-px bg-white/[0.05]" />
          <div className="text-gray-600 text-xs">{events.length} événement{events.length > 1 ? "s" : ""}</div>
        </div>
        <div className="space-y-2">
          {events.map((ev, i) => (
            <div key={i} className="flex gap-4 group">
              {/* Timeline */}
              <div className="flex flex-col items-center pt-1 w-4 shrink-0">
                <div className={`w-2 h-2 rounded-full mt-1 ${ev.impact === "Fort" ? "bg-red-400" : ev.impact === "Moyen" ? "bg-amber-400" : "bg-gray-600"}`} />
                {i < events.length - 1 && <div className="w-px flex-1 bg-white/[0.05] mt-1" />}
              </div>
              {/* Card */}
              <div className="flex-1 mb-2 bg-[#0d0d0d] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.10] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {ev.ticker && <span className="font-mono font-bold text-[#00ff88] text-sm">{ev.ticker}</span>}
                      <div className="text-white font-semibold text-sm">{(ev as { title?: string }).title || `Résultats ${ev.ticker}`}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CAT_TYPE_CLS[ev.category] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>{ev.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${IMPACT_CLS[ev.impact] ?? ""}`}>Impact {ev.impact}</span>
                      {(ev as { forecast?: string }).forecast && <span className="text-gray-500 text-xs">Prévu: {(ev as { forecast?: string }).forecast}</span>}
                      {ev.est && <span className={`text-xs font-mono font-bold ${ev.est.startsWith("+") ? "text-[#00ff88]" : "text-[#ff4444]"}`}>Est. {ev.est}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-white font-mono text-sm font-bold">{new Date(ev.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                    <div className="text-gray-600 text-xs">{new Date(ev.date).toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white font-bold text-lg">Calendrier des Catalyseurs</h3>
        <div className="flex gap-2 text-xs">
          {[["Fort","bg-red-400"],["Moyen","bg-amber-400"],["Faible","bg-gray-600"]].map(([l,c]) => (
            <div key={l} className="flex items-center gap-1.5 text-gray-500"><div className={`w-2 h-2 rounded-full ${c}`} />{l}</div>
          ))}
        </div>
      </div>
      <Section title="Cette semaine" events={thisWeek} />
      <Section title="Ce mois" events={thisMonth} />
      <Section title="À venir" events={later} />
    </div>
  );
}

// ── MacroTab ──────────────────────────────────────────────────────────────────
function MacroTab() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bourse/macro").then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const FG = ({ score, label, title }: { score: number; label: string; title: string }) => {
    const color = score >= 75 ? "#00ff88" : score >= 55 ? "#22c55e" : score >= 45 ? "#fbbf24" : score >= 25 ? "#f97316" : "#ff4444";
    const text = label.toLowerCase().includes("greed") ? label : score >= 75 ? "Avidité extrême" : score >= 55 ? "Avidité" : score >= 45 ? "Neutre" : score >= 25 ? "Peur" : "Peur extrême";
    return (
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-5">
        <div className="text-gray-500 text-xs font-semibold uppercase tracking-widest mb-3">{title}</div>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
              <circle cx="40" cy="40" r="30" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle cx="40" cy="40" r="30" fill="none" stroke={color} strokeWidth="8"
                strokeDasharray={`${(score / 100) * 188} 188`} strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${color}60)` }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-black text-lg">{score}</span>
            </div>
          </div>
          <div>
            <div className="text-xl font-black mb-0.5" style={{ color }}>{text}</div>
            <div className="text-gray-600 text-xs">/100</div>
          </div>
        </div>
      </div>
    );
  };

  const QuoteCard = ({ q, label, pct, sym, loading }: { q: MacroQuote | undefined; label?: string; pct?: boolean; sym?: string; loading?: boolean }) => {
    const item = q ?? (sym ? data?.macro.find(x => x.symbol === sym) : null);
    if (!item && !loading) return null;
    const val = item?.price ?? 0;
    const chg = item?.changePct ?? 0;
    return (
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-xl p-3">
        <div className="text-gray-500 text-xs mb-1 truncate">{label ?? item?.shortName}</div>
        {loading ? <div className="h-5 w-16 bg-white/[0.06] rounded animate-pulse" /> : (
          <>
            <div className="text-white font-mono font-bold text-base">
              {pct ? val.toFixed(2) + "%" : val.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
            </div>
            <div className={`font-mono text-xs font-bold mt-0.5 ${pctCls(chg)}`}>{fmtPct(chg)}</div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Key macro indicators */}
      <div>
        <h3 className="text-white font-bold text-base mb-4">Indicateurs clés</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data?.macro.map(q => (
            <QuoteCard key={q.symbol} q={q} label={MACRO_DESC[q.symbol]?.desc ?? q.shortName} pct={["^TNX","^IRX"].includes(q.symbol)} />
          )) ?? ([...Array(4)].map((_, i) => <QuoteCard key={i} q={undefined} loading={true} />))}
        </div>
      </div>

      {/* Fear & Greed */}
      {(data?.fearGreed.cnn || data?.fearGreed.crypto) && (
        <div>
          <h3 className="text-white font-bold text-base mb-4">Fear & Greed Index</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.fearGreed.cnn && <FG score={data.fearGreed.cnn.score} label={data.fearGreed.cnn.rating} title="Bourse (CNN)" />}
            {data?.fearGreed.crypto && <FG score={data.fearGreed.crypto.score} label={data.fearGreed.crypto.rating} title="Crypto (Alternative.me)" />}
          </div>
        </div>
      )}

      {/* Forex */}
      {(loading || (data?.forex.length ?? 0) > 0) && (
        <div>
          <h3 className="text-white font-bold text-base mb-4">Forex Live</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {loading ? [...Array(6)].map((_, i) => <QuoteCard key={i} q={undefined} />) :
              data?.forex.map(q => <QuoteCard key={q.symbol} q={q} />)}
          </div>
        </div>
      )}

      {/* Commodities */}
      {(loading || (data?.commodities.length ?? 0) > 0) && (
        <div>
          <h3 className="text-white font-bold text-base mb-4">Matières premières</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {loading ? [...Array(6)].map((_, i) => <QuoteCard key={i} q={undefined} />) :
              data?.commodities.map(q => <QuoteCard key={q.symbol} q={q} />)}
          </div>
        </div>
      )}

      {/* Economic Calendar */}
      <div>
        <h3 className="text-white font-bold text-base mb-4">Calendrier économique</h3>
        <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                {["Date","Événement","Catégorie","Impact","Prévu","Précédent"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-gray-600 text-xs font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MACRO_EVENTS.map((ev, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-gray-400 text-sm font-mono whitespace-nowrap">
                    {new Date(ev.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </td>
                  <td className="px-4 py-3 text-white text-sm font-medium">{ev.title}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CAT_TYPE_CLS[ev.category] ?? "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>{ev.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${IMPACT_CLS[ev.impact] ?? ""}`}>{ev.impact}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm font-mono">{ev.forecast}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm font-mono">{ev.previous}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "indices",      label: "Indices",      icon: "📈" },
  { id: "actions",      label: "Actions",      icon: "🏢" },
  { id: "catalyseurs",  label: "Catalyseurs",  icon: "📅" },
  { id: "portefeuille", label: "Portefeuille", icon: "💼" },
  { id: "macro",        label: "Macro",        icon: "🌐" },
];

export default function BoursePage() {
  const [activeTab, setActiveTab] = useState("indices");
  const [activeExchange, setActiveExchange] = useState("WORLD");
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [globeQuotes, setGlobeQuotes] = useState<Record<string, { price: number; pct: number }>>({});
  const tabsRef = useRef<HTMLDivElement>(null);

  // Fetch globe index quotes
  useEffect(() => {
    const symbols = ["^GSPC","^FTSE","^N225","^HSI","000001.SS","^FCHI","^GDAXI","^AXJO","^BSESN","^BVSP"].join(",");
    fetch(`/api/bourse/quotes?symbols=${encodeURIComponent(symbols)}`)
      .then(r => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) return;
        const map: Record<string, { price: number; pct: number }> = {};
        (d as { symbol: string; regularMarketPrice: number; regularMarketChangePercent: number }[])
          .forEach(q => { map[q.symbol] = { price: q.regularMarketPrice, pct: q.regularMarketChangePercent }; });
        setGlobeQuotes(map);
      }).catch(() => {});
  }, []);

  const scrollToTabs = () => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleExchangeSelect = useCallback((id: string) => {
    setActiveExchange(id);
    setActiveTab("actions");
    setTimeout(scrollToTabs, 100);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0]">
      {/* ── Hero: full viewport height globe ─────────────────── */}
      <div className="relative h-screen overflow-hidden">
        {/* CSS starfield behind globe */}
        <div className="absolute inset-0 bg-[#030305]" />

        {/* Globe fills entire hero */}
        <div className="absolute inset-0">
          <BourseGlobe onExchangeSelect={handleExchangeSelect} quotes={globeQuotes} />
        </div>

        {/* Overlay text — top left */}
        <div className="absolute top-1/2 left-0 -translate-y-1/2 px-12 z-10 pointer-events-none max-w-xl">
          <div className="text-[#00ff88] text-xs font-bold tracking-[0.5em] uppercase mb-4 opacity-90">
            Marchés Mondiaux
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-white leading-none tracking-tight mb-5">
            MARCHÉS<br />
            <span style={{ WebkitTextStroke: "1px rgba(255,255,255,0.4)", color: "transparent" }}>FINANCIERS</span>
          </h1>
          <p className="text-gray-400 text-base leading-relaxed mb-8 max-w-sm">
            Explorez les principales places boursières du monde grâce à un globe interactif en temps réel.
          </p>
          <button
            onClick={scrollToTabs}
            className="pointer-events-auto px-6 py-3 rounded-xl text-sm font-bold border border-[#00ff88]/30 text-[#00ff88] hover:bg-[#00ff88] hover:text-black transition-all"
            style={{ backdropFilter: "blur(12px)", background: "rgba(0,255,136,0.05)" }}>
            Explorer les marchés →
          </button>
        </div>

        {/* Scroll indicator */}
        <button onClick={scrollToTabs}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-gray-600 hover:text-gray-400 transition-colors">
          <div className="w-5 h-8 border border-gray-700 rounded-full flex justify-center pt-1.5">
            <div className="w-1 h-2 bg-gray-600 rounded-full animate-bounce" />
          </div>
        </button>
      </div>

      {/* ── Tabs section ──────────────────────────────────────── */}
      <div ref={tabsRef} className="max-w-[1600px] mx-auto px-4 md:px-6 py-10">
        {/* Tab navigation */}
        <div className="flex gap-0.5 mb-8 bg-[#0a0a0a] border border-white/[0.06] rounded-2xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === t.id
                  ? "bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
              }`}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "indices" && (
          <IndicesTab onViewStock={sym => { setSelectedStock(sym); }} />
        )}
        {activeTab === "actions" && (
          <ActionsTab
            activeExchange={activeExchange}
            onExchangeChange={setActiveExchange}
            onViewStock={sym => setSelectedStock(sym)}
          />
        )}
        {activeTab === "catalyseurs" && <CatalyseurTab />}
        {activeTab === "portefeuille" && <BoursePortfolioTab />}
        {activeTab === "macro" && <MacroTab />}
      </div>

      {/* Stock detail sliding panel */}
      {selectedStock && (
        <StockDetailPanel
          symbol={selectedStock}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  );
}
