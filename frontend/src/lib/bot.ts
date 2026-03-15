/**
 * Moneyprinter Bot — 4-layer paper trading engine (crypto only).
 *
 * Layer 1 — Smart Money Detection:  unusual volume spikes on crypto Polymarket markets
 * Layer 2 — Sentiment vs Price:     CryptoPanic feed (euphoria/panic contrarian signals)
 * Layer 3 — Temporal Arbitrage:     Polymarket probability moved but crypto price hasn't
 * Layer 4 — Technical baseline:     RSI + Bollinger + MA + Momentum (from cryptoStrategy)
 *
 * Auto-learning: each layer's weight adjusts based on its historical win rate.
 */

import { Market } from "./types";
import { analyzeCoin, BotCoin } from "./cryptoStrategy";
export type { BotCoin };

// ── Signal types ──────────────────────────────────────────────────────────────
export type SignalType = "smart_money" | "sentiment" | "arbitrage" | "technical";
export type TradeSide  = "LONG" | "SHORT";
export type TradeStatus = "open" | "closed_profit" | "closed_loss";

// ── Auto-learning weight ───────────────────────────────────────────────────────
export interface SignalWeight {
  weight: number;   // 0.3 – 2.0, updated after each close
  wins: number;
  losses: number;
  total: number;
  winRate: number;  // cached
}

export const DEFAULT_WEIGHTS: Record<SignalType, SignalWeight> = {
  smart_money: { weight: 1.0, wins: 0, losses: 0, total: 0, winRate: 0 },
  sentiment:   { weight: 1.0, wins: 0, losses: 0, total: 0, winRate: 0 },
  arbitrage:   { weight: 1.0, wins: 0, losses: 0, total: 0, winRate: 0 },
  technical:   { weight: 1.0, wins: 0, losses: 0, total: 0, winRate: 0 },
};

// ── Raw signal (from one layer, before combining) ─────────────────────────────
export interface RawSignal {
  type: SignalType;
  layer: 1 | 2 | 3 | 4;
  coinId: string;
  coinSymbol: string;
  direction: TradeSide;
  strength: number;   // 0–100
  details: string;
}

// ── Trade ─────────────────────────────────────────────────────────────────────
export interface Trade {
  id: string;
  coinId: string;
  coinSymbol: string;
  coinName: string;
  side: TradeSide;
  stake: number;
  entryPrice: number;
  currentPrice: number;
  quantity: number;           // coins owned = stake / entryPrice
  highestPrice: number;       // for LONG trailing stop
  lowestPrice: number;        // for SHORT trailing stop
  trailingStopPrice: number;
  trailingStopPct: number;
  takeProfitPrice: number;
  takeProfitPct: number;
  openedAt: number;
  closedAt?: number;
  exitPrice?: number;
  pnl?: number;
  status: TradeStatus;
  signalType: SignalType;
  signalScore: number;
  signalDetails: string;
  layer: 1 | 2 | 3 | 4;
}

// ── Polymarket snapshot for L1 + L3 detection ────────────────────────────────
export interface PolyPoint {
  id: string;
  question: string;
  yes_price: number;
  volume24h: number;
  coinId: string;
  coinSymbol: string;
}
export interface PolySnapshot {
  ts: number;
  points: PolyPoint[];
}

// ── Sentiment data (from /api/sentiment) ─────────────────────────────────────
export interface SentimentData {
  available: boolean;
  coins: Record<string, number>; // coinGecko id → 0–100
  ts: number;
  reason?: string;
}

// ── Log ───────────────────────────────────────────────────────────────────────
export type LogLevel = "info" | "buy" | "sell" | "warn" | "layer";
export interface BotLog {
  id: string;
  ts: number;
  level: LogLevel;
  msg: string;
}

// ── Layer activity (for UI) ───────────────────────────────────────────────────
export interface LayerActivity {
  ts: number | null;
  msg: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
export interface BotConfig {
  initialCapital: number;
  minBetPct: number;
  maxBetPct: number;
  maxOpenTrades: number;
  maxTradesPerCoin: number;
  minWeightedScore: number;       // minimum combined score to open a trade
  smartMoneyMultiple: number;     // spike must be Nx rolling average (default 10)
  sentimentEuphoria: number;      // > this = euphoria → contrarian SHORT
  sentimentPanic: number;         // < this = panic → reversal LONG
  arbitrageGapPP: number;         // Polymarket must move this many pp (default 5)
  arbitrageMinMinutes: number;    // minimum time window in minutes (default 15)
}

export const DEFAULT_CONFIG: BotConfig = {
  initialCapital: 100,
  minBetPct: 2,
  maxBetPct: 5,
  maxOpenTrades: 5,
  maxTradesPerCoin: 1,
  minWeightedScore: 45,
  smartMoneyMultiple: 10,
  sentimentEuphoria: 70,
  sentimentPanic: 30,
  arbitrageGapPP: 5,
  arbitrageMinMinutes: 15,
};

// Take-profit / trailing-stop per layer (% of entry price)
const LAYER_TPSL: Record<number, { tp: number; sl: number }> = {
  1: { tp: 20, sl: 7 }, // smart money: high conviction, large TP
  2: { tp: 15, sl: 5 }, // sentiment: contrarian, medium hold
  3: { tp: 12, sl: 5 }, // arbitrage: quick convergence expected
  4: { tp: 15, sl: 5 }, // technical: standard
};

// ── State ─────────────────────────────────────────────────────────────────────
export interface BotState {
  isActive: boolean;
  capital: number;
  openTrades: Trade[];
  closedTrades: Trade[];
  logs: BotLog[];
  cycleCount: number;
  lastCycleAt: number | null;
  config: BotConfig;
  weights: Record<SignalType, SignalWeight>;
  polyHistory: PolySnapshot[];          // last 30 snapshots (~30 min)
  lastSentiment: SentimentData | null;
  // Layer UI activity
  l1Activity: LayerActivity;
  l2Coins: Record<string, number>;      // latest sentiment scores per coinId
  l3Activity: LayerActivity;
  lastSignals: CombinedSignal[];        // combined signals from latest cycle (for UI)
}

// ── Coin → CoinGecko ID mapping for Polymarket question parsing ───────────────
const CRYPTO_MAP: Array<{ kws: string[]; coinId: string; sym: string }> = [
  { kws: ["bitcoin", "btc"],          coinId: "bitcoin",      sym: "BTC" },
  { kws: ["ethereum", "eth", "ether"], coinId: "ethereum",    sym: "ETH" },
  { kws: ["solana", "sol"],           coinId: "solana",       sym: "SOL" },
  { kws: ["xrp", "ripple"],           coinId: "ripple",       sym: "XRP" },
  { kws: ["bnb", "binance coin"],     coinId: "binancecoin",  sym: "BNB" },
  { kws: ["dogecoin", "doge"],        coinId: "dogecoin",     sym: "DOGE" },
  { kws: ["cardano", "ada"],          coinId: "cardano",      sym: "ADA" },
  { kws: ["avalanche", "avax"],       coinId: "avalanche-2",  sym: "AVAX" },
  { kws: ["chainlink", "link"],       coinId: "chainlink",    sym: "LINK" },
  { kws: ["polkadot", "dot"],         coinId: "polkadot",     sym: "DOT" },
];

function detectCoin(question: string): { coinId: string; sym: string } | null {
  const q = question.toLowerCase();
  for (const { kws, coinId, sym } of CRYPTO_MAP) {
    if (kws.some((kw) => q.includes(kw))) return { coinId, sym };
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function addLog(state: BotState, level: LogLevel, msg: string): BotState {
  const entry: BotLog = { id: uid(), ts: Date.now(), level, msg };
  return { ...state, logs: [entry, ...state.logs].slice(0, 200) };
}

function fmtUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1)     return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

/** Position size scales from minBetPct (at minScore) to maxBetPct (minScore+100). */
function stakeForScore(state: BotState, score: number): number {
  const range = state.config.maxBetPct - state.config.minBetPct;
  const t = Math.max(0, Math.min(1, (score - state.config.minWeightedScore) / 100));
  const pct = state.config.minBetPct + range * t;
  return parseFloat(((pct / 100) * state.capital).toFixed(2));
}

// ── Layer 1: Smart Money Detection ────────────────────────────────────────────
function layer1(polyHistory: PolySnapshot[], cfg: BotConfig): RawSignal[] {
  if (polyHistory.length < 5) return [];

  const latest = polyHistory[polyHistory.length - 1];
  const prev   = polyHistory[polyHistory.length - 2];
  const signals: RawSignal[] = [];

  for (const cur of latest.points) {
    const prevPt = prev.points.find((p) => p.id === cur.id);
    if (!prevPt) continue;

    const curDelta = Math.max(0, cur.volume24h - prevPt.volume24h);
    if (curDelta < 500) continue; // ignore noise < $500

    // Build rolling average delta from older snapshots
    const rollingDeltas: number[] = [];
    for (let i = 1; i < polyHistory.length - 1; i++) {
      const a = polyHistory[i - 1].points.find((p) => p.id === cur.id);
      const b = polyHistory[i].points.find((p) => p.id === cur.id);
      if (a && b) {
        const d = Math.max(0, b.volume24h - a.volume24h);
        if (d > 0) rollingDeltas.push(d);
      }
    }
    if (rollingDeltas.length < 3) continue;

    const avgDelta = rollingDeltas.reduce((a, b) => a + b, 0) / rollingDeltas.length;
    if (avgDelta <= 0) continue;

    const multiple = curDelta / avgDelta;
    if (multiple < cfg.smartMoneyMultiple) continue;

    // Direction: yes_price rising = smart money betting YES = bullish crypto → LONG
    const direction: TradeSide = cur.yes_price >= prevPt.yes_price ? "LONG" : "SHORT";
    const strength = Math.min(100, 50 + (multiple / cfg.smartMoneyMultiple) * 25);

    signals.push({
      type: "smart_money", layer: 1,
      coinId: cur.coinId, coinSymbol: cur.coinSymbol,
      direction, strength,
      details: `$${(curDelta / 1_000).toFixed(0)}K bet (×${multiple.toFixed(0)} moy) · "${cur.question.slice(0, 38)}…"`,
    });
  }
  return signals;
}

// ── Layer 2: Sentiment vs Price ───────────────────────────────────────────────
function layer2(
  sentiment: SentimentData | null,
  coins: BotCoin[],
  cfg: BotConfig,
): RawSignal[] {
  if (!sentiment?.available) return [];
  const coinMap = new Map(coins.map((c) => [c.id, c]));
  const signals: RawSignal[] = [];

  for (const [coinId, score] of Object.entries(sentiment.coins)) {
    const coin = coinMap.get(coinId);
    if (!coin) continue;
    const d24h = coin.price_change_percentage_24h ?? 0;
    const flat  = Math.abs(d24h) < 1.5; // price stagnant

    if (score >= cfg.sentimentEuphoria && flat) {
      // Euphoria + flat price → contrarian SHORT
      const str = Math.min(100, ((score - cfg.sentimentEuphoria) / (100 - cfg.sentimentEuphoria)) * 100);
      signals.push({
        type: "sentiment", layer: 2,
        coinId, coinSymbol: coin.symbol.toUpperCase(),
        direction: "SHORT", strength: str,
        details: `Euphorie ${score}% / prix ${d24h > 0 ? "+" : ""}${d24h.toFixed(1)}% → contrarian SHORT`,
      });
    } else if (score <= cfg.sentimentPanic && flat) {
      // Panic + flat price → reversal LONG
      const str = Math.min(100, ((cfg.sentimentPanic - score) / cfg.sentimentPanic) * 100);
      signals.push({
        type: "sentiment", layer: 2,
        coinId, coinSymbol: coin.symbol.toUpperCase(),
        direction: "LONG", strength: str,
        details: `Panique ${score}% / prix ${d24h > 0 ? "+" : ""}${d24h.toFixed(1)}% → reversal LONG`,
      });
    }
  }
  return signals;
}

// ── Layer 3: Temporal Arbitrage ───────────────────────────────────────────────
function layer3(
  polyHistory: PolySnapshot[],
  coins: BotCoin[],
  cfg: BotConfig,
): RawSignal[] {
  if (polyHistory.length < 2) return [];
  const coinMap = new Map(coins.map((c) => [c.id, c]));
  const now = Date.now();
  const minMs = cfg.arbitrageMinMinutes * 60_000;
  const signals: RawSignal[] = [];

  // Find oldest snapshot at least arbitrageMinMinutes ago
  const oldSnap = [...polyHistory].find((s) => now - s.ts >= minMs);
  if (!oldSnap) return [];

  const latest  = polyHistory[polyHistory.length - 1];
  const elapsed = (now - oldSnap.ts) / 60_000; // minutes

  for (const cur of latest.points) {
    const old = oldSnap.points.find((p) => p.id === cur.id);
    if (!old) continue;
    const coin = coinMap.get(cur.coinId);
    if (!coin) continue;

    // Probability delta in percentage points
    const polyDeltaPP = (cur.yes_price - old.yes_price) * 100;
    if (Math.abs(polyDeltaPP) < cfg.arbitrageGapPP) continue;

    // Approximate crypto price change over elapsed window
    const d24h = coin.price_change_percentage_24h ?? 0;
    const estCryptoDelta = (d24h / 24) * (elapsed / 60); // prorated to elapsed time

    // Gap = how much more poly moved than crypto
    const gap = Math.abs(polyDeltaPP) - Math.abs(estCryptoDelta) * 2;
    if (gap < cfg.arbitrageGapPP / 2) continue;

    const direction: TradeSide = polyDeltaPP > 0 ? "LONG" : "SHORT";
    const strength = Math.min(100, (Math.abs(polyDeltaPP) / cfg.arbitrageGapPP) * 40 + 20);

    signals.push({
      type: "arbitrage", layer: 3,
      coinId: cur.coinId, coinSymbol: cur.coinSymbol,
      direction, strength,
      details: `Poly ${polyDeltaPP > 0 ? "+" : ""}${polyDeltaPP.toFixed(1)}pp · crypto ${estCryptoDelta > 0 ? "+" : ""}${estCryptoDelta.toFixed(1)}% (${Math.round(elapsed)}min) → gap`,
    });
  }
  return signals;
}

// ── Layer 4: Technical (RSI + Bollinger + MA + Momentum) ─────────────────────
function layer4(coins: BotCoin[]): RawSignal[] {
  const signals: RawSignal[] = [];
  for (const coin of coins) {
    if (!coin.sparkline_in_7d?.price.length) continue;
    const sig = analyzeCoin(coin);
    if (sig.score < 65 || sig.direction === "NEUTRAL") continue;
    signals.push({
      type: "technical", layer: 4,
      coinId: coin.id, coinSymbol: coin.symbol.toUpperCase(),
      direction: sig.direction, strength: sig.score,
      details: Object.values(sig.components).map((c) => c.label).join(" · "),
    });
  }
  return signals;
}

// ── Signal combining with weights ─────────────────────────────────────────────
export interface CombinedSignal {
  coinId: string;
  coinName: string;
  coinSymbol: string;
  direction: TradeSide;
  weightedScore: number;
  primaryType: SignalType;
  primaryLayer: 1 | 2 | 3 | 4;
  details: string;
  agreementCount: number;
}

function combineSignals(
  raw: RawSignal[],
  weights: Record<SignalType, SignalWeight>,
  coinMap: Map<string, BotCoin>,
): CombinedSignal[] {
  const byId = new Map<string, {
    long: number; short: number;
    sigs: Array<RawSignal & { ws: number }>;
  }>();

  for (const s of raw) {
    const ws = s.strength * weights[s.type].weight;
    if (!byId.has(s.coinId)) byId.set(s.coinId, { long: 0, short: 0, sigs: [] });
    const e = byId.get(s.coinId)!;
    if (s.direction === "LONG") e.long += ws;
    else e.short += ws;
    e.sigs.push({ ...s, ws });
  }

  const result: CombinedSignal[] = [];
  for (const [coinId, { long, short, sigs }] of byId) {
    const coin = coinMap.get(coinId);
    if (!coin) continue;
    const direction: TradeSide = long >= short ? "LONG" : "SHORT";
    const agreeing = sigs.filter((s) => s.direction === direction).sort((a, b) => b.ws - a.ws);
    if (!agreeing.length) continue;

    const primary = agreeing[0];
    const baseScore = Math.max(long, short);
    // Agreement bonus: +10% per extra layer agreeing
    const bonus = 1 + (agreeing.length - 1) * 0.10;

    result.push({
      coinId, coinName: coin.name, coinSymbol: primary.coinSymbol,
      direction, weightedScore: baseScore * bonus,
      primaryType: primary.type, primaryLayer: primary.layer,
      details: agreeing.map((s) => `[L${s.layer}] ${s.details}`).join(" | "),
      agreementCount: agreeing.length,
    });
  }
  return result.sort((a, b) => b.weightedScore - a.weightedScore);
}

// ── Auto-learning: update weights after close ─────────────────────────────────
function learnFromClosed(
  weights: Record<SignalType, SignalWeight>,
  closed: Trade[],
): Record<SignalType, SignalWeight> {
  let w = { ...weights };
  for (const t of closed) {
    const type = t.signalType;
    const won  = (t.pnl ?? 0) > 0;
    const cur  = w[type];
    const wins   = cur.wins   + (won ? 1 : 0);
    const losses = cur.losses + (won ? 0 : 1);
    const total  = cur.total  + 1;
    const winRate = wins / total;
    // Weight formula: 0.3 (all losses) → 2.0 (all wins)
    const weight = parseFloat(Math.max(0.3, Math.min(2.0, 0.3 + 1.7 * winRate)).toFixed(3));
    w = { ...w, [type]: { weight, wins, losses, total, winRate } };
  }
  return w;
}

// ── Initial state ─────────────────────────────────────────────────────────────
export function createInitialState(): BotState {
  return {
    isActive: false,
    capital: DEFAULT_CONFIG.initialCapital,
    openTrades: [], closedTrades: [], logs: [],
    cycleCount: 0, lastCycleAt: null,
    config: DEFAULT_CONFIG,
    weights: { ...DEFAULT_WEIGHTS },
    polyHistory: [],
    lastSentiment: null,
    l1Activity: { ts: null, msg: "En attente de données Polymarket…" },
    l2Coins: {},
    l3Activity: { ts: null, msg: "En attente de données historiques…" },
    lastSignals: [],
  };
}

// ── Main engine ───────────────────────────────────────────────────────────────
export function processBotCycle(
  state: BotState,
  markets: Market[],
  coins: BotCoin[],
  sentiment: SentimentData | null,
): BotState {
  if (!state.isActive) return state;

  let s: BotState = {
    ...state,
    cycleCount: state.cycleCount + 1,
    lastCycleAt: Date.now(),
    lastSentiment: sentiment ?? state.lastSentiment,
    l2Coins: sentiment?.available ? { ...state.l2Coins, ...sentiment.coins } : state.l2Coins,
  };

  const coinMap = new Map<string, BotCoin>(coins.map((c) => [c.id, c]));

  // ── Store Polymarket snapshot (crypto-related markets only) ──────────────
  const newPoints: PolyPoint[] = [];
  for (const m of markets) {
    const coin = detectCoin(m.question);
    if (!coin) continue;
    newPoints.push({ id: m.id, question: m.question, yes_price: m.yes_price, volume24h: m.volume24h, coinId: coin.coinId, coinSymbol: coin.sym });
  }
  s = { ...s, polyHistory: [...s.polyHistory, { ts: Date.now(), points: newPoints }].slice(-30) };

  // ── Update open positions & collect exits ────────────────────────────────
  const stillOpen: Trade[] = [];
  const nowClosed: Trade[] = [];

  for (const raw of s.openTrades) {
    let t = { ...raw };
    const coin = coinMap.get(t.coinId);
    if (coin) t = { ...t, currentPrice: coin.current_price };

    // Update trailing stop
    if (t.side === "LONG" && t.currentPrice > t.highestPrice) {
      t = { ...t, highestPrice: t.currentPrice, trailingStopPrice: t.currentPrice * (1 - t.trailingStopPct / 100) };
    } else if (t.side === "SHORT" && t.currentPrice < t.lowestPrice) {
      t = { ...t, lowestPrice: t.currentPrice, trailingStopPrice: t.currentPrice * (1 + t.trailingStopPct / 100) };
    }

    // Check exit conditions
    const pnl = (t.side === "LONG" ? 1 : -1) * (t.currentPrice - t.entryPrice) * t.quantity;
    let exit: TradeStatus | null = null;

    if (t.side === "LONG") {
      if (t.currentPrice >= t.takeProfitPrice) exit = "closed_profit";
      else if (t.currentPrice <= t.trailingStopPrice) exit = pnl >= 0 ? "closed_profit" : "closed_loss";
    } else {
      if (t.currentPrice <= t.takeProfitPrice) exit = "closed_profit";
      else if (t.currentPrice >= t.trailingStopPrice) exit = pnl >= 0 ? "closed_profit" : "closed_loss";
    }

    if (exit) {
      const closed: Trade = { ...t, closedAt: Date.now(), exitPrice: t.currentPrice, pnl, status: exit };
      nowClosed.push(closed);
      s = { ...s, capital: parseFloat((s.capital + t.stake + pnl).toFixed(2)) };
      const pct = (pnl / t.stake) * 100;
      const icon = exit === "closed_profit" ? "✅" : "⚠️";
      s = addLog(s, exit === "closed_profit" ? "sell" : "warn",
        `${icon} [L${t.layer}] ${t.coinSymbol} ${t.side} | ${fmtUsd(t.entryPrice)} → ${fmtUsd(t.currentPrice)} | ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} € (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`,
      );
    } else {
      stillOpen.push(t);
    }
  }
  s = { ...s, openTrades: stillOpen, closedTrades: [...nowClosed, ...s.closedTrades].slice(0, 100) };

  // ── Auto-learning: update weights for newly closed trades ────────────────
  if (nowClosed.length > 0) {
    s = { ...s, weights: learnFromClosed(s.weights, nowClosed) };
    for (const t of nowClosed) {
      const won = (t.pnl ?? 0) > 0;
      const w   = s.weights[t.signalType];
      s = addLog(s, "info",
        `🧠 Auto-apprentissage [L${t.layer}/${t.signalType}]: ${won ? "WIN" : "LOSS"} → WR ${(w.winRate * 100).toFixed(0)}% · poids ×${w.weight.toFixed(2)}`,
      );
    }
  }

  // ── Generate signals from all 4 layers ───────────────────────────────────
  const rawSignals: RawSignal[] = [
    ...layer1(s.polyHistory, s.config),
    ...layer2(s.lastSentiment, coins, s.config),
    ...layer3(s.polyHistory, coins, s.config),
    ...layer4(coins),
  ];

  // Log layer activity every 3 cycles
  if (s.cycleCount % 3 === 0) {
    const l1Signals = rawSignals.filter((r) => r.layer === 1);
    if (l1Signals.length > 0) {
      const top = l1Signals[0];
      const msg = `${top.coinSymbol} ${top.direction === "LONG" ? "🟢" : "🔴"} ${top.direction} str:${top.strength.toFixed(0)} — ${top.details}`;
      s = addLog(s, "layer", `[L1 Smart Money] ${msg}`);
      s = { ...s, l1Activity: { ts: Date.now(), msg: top.details } };
    }
    const l2Signals = rawSignals.filter((r) => r.layer === 2);
    for (const sig of l2Signals.slice(0, 2)) {
      s = addLog(s, "layer", `[L2 Sentiment] ${sig.coinSymbol} ${sig.direction === "LONG" ? "🟢" : "🔴"} ${sig.direction} — ${sig.details}`);
    }
    const l3Signals = rawSignals.filter((r) => r.layer === 3);
    if (l3Signals.length > 0) {
      const top = l3Signals[0];
      const msg = `${top.coinSymbol} ${top.direction === "LONG" ? "🟢" : "🔴"} ${top.direction} str:${top.strength.toFixed(0)} — ${top.details}`;
      s = addLog(s, "layer", `[L3 Arbitrage] ${msg}`);
      s = { ...s, l3Activity: { ts: Date.now(), msg: top.details } };
    }
    const l4Signals = rawSignals.filter((r) => r.layer === 4).sort((a, b) => b.strength - a.strength);
    for (const sig of l4Signals.slice(0, 3)) {
      s = addLog(s, "layer", `[L4 Technical] ${sig.coinSymbol} ${sig.direction === "LONG" ? "🟢" : "🔴"} ${sig.direction} score:${sig.strength.toFixed(0)} — ${sig.details}`);
    }
  }

  // ── Combine signals and open new positions ────────────────────────────────
  const combined = combineSignals(rawSignals, s.weights, coinMap);
  s = { ...s, lastSignals: combined };
  const tradeCounts = new Map<string, number>();
  for (const t of s.openTrades) tradeCounts.set(t.coinId, (tradeCounts.get(t.coinId) ?? 0) + 1);

  for (const entry of combined) {
    if (s.openTrades.length >= s.config.maxOpenTrades) break;
    if ((tradeCounts.get(entry.coinId) ?? 0) >= s.config.maxTradesPerCoin) continue;
    if (entry.weightedScore < s.config.minWeightedScore) continue;

    const stake = stakeForScore(s, entry.weightedScore);
    if (stake <= 0 || stake > s.capital) continue;

    const coin = coinMap.get(entry.coinId);
    if (!coin) continue;

    const ep   = coin.current_price;
    const tpsl = LAYER_TPSL[entry.primaryLayer] ?? { tp: 15, sl: 5 };
    const side = entry.direction;
    const qty  = stake / ep;
    const tp   = side === "LONG" ? ep * (1 + tpsl.tp / 100) : ep * (1 - tpsl.tp / 100);
    const sl   = side === "LONG" ? ep * (1 - tpsl.sl / 100) : ep * (1 + tpsl.sl / 100);

    const trade: Trade = {
      id: uid(), coinId: entry.coinId, coinSymbol: entry.coinSymbol, coinName: entry.coinName,
      side, stake, entryPrice: ep, currentPrice: ep, quantity: qty,
      highestPrice: ep, lowestPrice: ep,
      trailingStopPrice: sl, trailingStopPct: tpsl.sl,
      takeProfitPrice: tp, takeProfitPct: tpsl.tp,
      openedAt: Date.now(), status: "open",
      signalType: entry.primaryType, signalScore: entry.weightedScore,
      signalDetails: entry.details.slice(0, 180),
      layer: entry.primaryLayer,
    };

    s = { ...s, openTrades: [...s.openTrades, trade], capital: parseFloat((s.capital - stake).toFixed(2)) };
    tradeCounts.set(entry.coinId, (tradeCounts.get(entry.coinId) ?? 0) + 1);

    const agr = entry.agreementCount > 1 ? ` (${entry.agreementCount} couches)` : "";
    s = addLog(s, "buy",
      `📈 [L${entry.primaryLayer}·${entry.primaryType}]${agr} ${entry.coinSymbol} ${side} @ ${fmtUsd(ep)} | score:${entry.weightedScore.toFixed(0)} TP+${tpsl.tp}% SL-${tpsl.sl}% trail | ${stake.toFixed(2)} €`,
    );
  }

  return s;
}

// ── P&L helpers (exported for UI) ────────────────────────────────────────────
export function tradePnl(trade: Trade): number {
  const dir = trade.side === "LONG" ? 1 : -1;
  return (trade.currentPrice - trade.entryPrice) * trade.quantity * dir;
}

export function tradePnlPct(trade: Trade): number {
  return (tradePnl(trade) / trade.stake) * 100;
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export interface BotStats {
  totalPnl: number;
  winRate: number;
  wins: number;
  losses: number;
  totalTrades: number;
  lockedCapital: number;
  freeCapital: number;
}

export function computeStats(state: BotState): BotStats {
  const locked = state.openTrades.reduce((s, t) => s + t.stake, 0);
  const closed = state.closedTrades;
  const wins   = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0).length;
  return {
    totalPnl:      parseFloat((state.capital - state.config.initialCapital).toFixed(2)),
    winRate:       closed.length ? Math.round((wins / closed.length) * 100) : 0,
    wins, losses,
    totalTrades:   closed.length,
    lockedCapital: parseFloat(locked.toFixed(2)),
    freeCapital:   parseFloat((state.capital - locked).toFixed(2)),
  };
}
