"use client";

import {
  createContext, useCallback, useContext, useEffect,
  useRef, useState, ReactNode,
} from "react";
import {
  BotState, BotCoin, SentimentData,
  createInitialState, processBotCycle,
} from "./bot";
import { fetchMarkets } from "./api";
import { Market } from "./types";

// ── Persistence ───────────────────────────────────────────────────────────────
const LS_KEY = "moneyprinter_bot_v3"; // v3: 4-layer architecture, crypto-only trades

function loadState(): BotState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BotState;
      // Sanity check: v3 state has `weights` and `polyHistory`
      if (parsed.weights && Array.isArray(parsed.polyHistory)) {
        // Merge with initial state so any new fields get their defaults
        return { ...createInitialState(), ...parsed };
      }
    }
  } catch {}
  return createInitialState();
}

function saveState(s: BotState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

// ── Context ───────────────────────────────────────────────────────────────────
interface BotContextValue {
  state: BotState;
  markets: Market[];
  toggle: () => void;
  reset: () => void;
}

const BotContext = createContext<BotContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function BotProvider({ children }: { children: ReactNode }) {
  const [state, setState]     = useState<BotState>(() => createInitialState());
  const [markets, setMarkets] = useState<Market[]>([]);
  const [coins, setCoins]     = useState<BotCoin[]>([]);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [mounted, setMounted] = useState(false);
  const stateRef = useRef<BotState>(state);

  // Hydrate from localStorage after first client render
  useEffect(() => {
    const s = loadState();
    stateRef.current = s;
    setState(s);
    setMounted(true);
  }, []);

  // Polymarket markets — used for L1 smart money + L3 arbitrage snapshots
  useEffect(() => {
    const load = () =>
      fetchMarkets({ limit: 100, order: "volume24h", ascending: false, closed: false })
        .then((r) => setMarkets(r.markets))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Top-100 coins with sparkline — used for L2, L4, and live price updates
  useEffect(() => {
    const load = () =>
      fetch("/api/crypto/signals")
        .then((r) => r.json())
        .then((data: unknown) => setCoins(Array.isArray(data) ? (data as BotCoin[]) : []))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  // Sentiment data — used for L2 (CryptoPanic, optional)
  useEffect(() => {
    const load = () =>
      fetch("/api/sentiment")
        .then((r) => r.json())
        .then((data: unknown) => setSentiment(data as SentimentData))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000); // every 5 min (rate-limit friendly)
    return () => clearInterval(t);
  }, []);

  // Bot engine — runs every 10 s regardless of current page
  useEffect(() => {
    if (!mounted) return;
    const tick = setInterval(() => {
      if (!stateRef.current.isActive) return;
      const next = processBotCycle(stateRef.current, markets, coins, sentiment);
      stateRef.current = next;
      setState(next);
      saveState(next);
    }, 10_000);
    return () => clearInterval(tick);
  }, [mounted, markets, coins, sentiment]);

  const toggle = useCallback(() => {
    const cur = stateRef.current;
    const next: BotState = { ...cur, isActive: !cur.isActive };
    const msg = next.isActive ? "▶ Bot activé — 4 couches actives" : "⏸ Bot mis en pause";
    const entry = { id: Math.random().toString(36).slice(2), ts: Date.now(), level: "info" as const, msg };
    const s: BotState = { ...next, logs: [entry, ...next.logs] };
    stateRef.current = s;
    setState(s);
    saveState(s);
  }, []);

  const reset = useCallback(() => {
    const fresh = createInitialState();
    stateRef.current = fresh;
    setState(fresh);
    saveState(fresh);
  }, []);

  return (
    <BotContext.Provider value={{ state, markets, toggle, reset }}>
      {children}
    </BotContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useBotContext(): BotContextValue {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error("useBotContext must be used inside BotProvider");
  return ctx;
}
