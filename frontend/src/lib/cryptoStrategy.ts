/**
 * Multi-strategy crypto signal analyzer.
 * Combines Momentum, RSI, Bollinger Bands, Volume Anomaly, MA7/MA25 crossover.
 */
import { sma, rsi as calcRsi, bollingerBands, volatilityPct } from "./indicators";

/** Matches the CoinGecko /coins/markets response with sparkline=true */
export interface BotCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency: number | null;
  sparkline_in_7d?: { price: number[] };
}

export interface SignalComponent {
  dir: "LONG" | "SHORT" | "NEUTRAL";
  strength: number; // 0–100
  label: string;    // short label for display, e.g. "RSI 28"
}

export interface CryptoSignal {
  coin: BotCoin;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  score: number; // 0–100 composite strength
  components: {
    momentum: SignalComponent;
    rsi: SignalComponent;
    bollinger: SignalComponent;
    volume: SignalComponent;
    ma: SignalComponent;
  };
  takeProfitPct: number;   // dynamic, based on volatility
  trailingStopPct: number; // dynamic
  volatility: number;      // CV % from sparkline
}

// ── Individual signal calculators ─────────────────────────────────────────────

function momentumSignal(coin: BotCoin): SignalComponent {
  const d = coin.price_change_percentage_24h ?? 0;
  const w = coin.price_change_percentage_7d_in_currency ?? 0;
  const m = d * 0.6 + (w / 7) * 0.4;
  const dir: SignalComponent["dir"] = m > 0.5 ? "LONG" : m < -0.5 ? "SHORT" : "NEUTRAL";
  const strength = Math.min(100, (Math.abs(m) / 6) * 100);
  return { dir, strength, label: `Mom${m > 0 ? "+" : ""}${m.toFixed(1)}%` };
}

function rsiSignal(prices: number[]): SignalComponent {
  const r = calcRsi(prices, 14);
  const lbl = `RSI${r.toFixed(0)}`;
  if (r < 25) return { dir: "LONG",    strength: 100,                         label: lbl };
  if (r < 35) return { dir: "LONG",    strength: 40 + ((35 - r) / 10) * 60,   label: lbl };
  if (r > 75) return { dir: "SHORT",   strength: 100,                         label: lbl };
  if (r > 65) return { dir: "SHORT",   strength: 40 + ((r - 65) / 10) * 60,   label: lbl };
  if (r < 45) return { dir: "LONG",    strength: ((45 - r) / 10) * 30,        label: lbl };
  if (r > 55) return { dir: "SHORT",   strength: ((r - 55) / 10) * 30,        label: lbl };
  return { dir: "NEUTRAL", strength: 0, label: lbl };
}

function bollingerSignal(prices: number[], currentPrice: number): SignalComponent {
  const bb = bollingerBands(prices, 20);
  if (bb.bandwidth === 0) return { dir: "NEUTRAL", strength: 0, label: "BB–" };
  if (currentPrice < bb.lower) {
    const pct = ((bb.lower - currentPrice) / bb.lower) * 100;
    return { dir: "LONG",  strength: Math.min(100, (pct / 4) * 100), label: `BB↓${pct.toFixed(1)}%` };
  }
  if (currentPrice > bb.upper) {
    const pct = ((currentPrice - bb.upper) / bb.upper) * 100;
    return { dir: "SHORT", strength: Math.min(100, (pct / 4) * 100), label: `BB↑${pct.toFixed(1)}%` };
  }
  return { dir: "NEUTRAL", strength: 0, label: "BB–" };
}

function volumeSignal(coin: BotCoin, primaryDir: SignalComponent["dir"]): SignalComponent {
  if (coin.market_cap <= 0) return { dir: "NEUTRAL", strength: 0, label: "Vol–" };
  const ratio = coin.total_volume / coin.market_cap;
  const lbl = `Vol${(ratio * 100).toFixed(1)}%`;
  // > 20% vol/mktcap = strong anomaly, > 12% = moderate
  if (ratio > 0.20) {
    const str = Math.min(100, ((ratio - 0.15) / 0.15) * 100);
    return { dir: primaryDir !== "NEUTRAL" ? primaryDir : "NEUTRAL", strength: str, label: lbl };
  }
  if (ratio > 0.12) {
    return { dir: primaryDir !== "NEUTRAL" ? primaryDir : "NEUTRAL", strength: 30, label: lbl };
  }
  return { dir: "NEUTRAL", strength: 0, label: lbl };
}

function maSignal(prices: number[]): SignalComponent {
  if (prices.length < 26) return { dir: "NEUTRAL", strength: 0, label: "MA–" };
  const ma7  = sma(prices, 7);
  const ma25 = sma(prices, 25);
  if (ma25 === 0) return { dir: "NEUTRAL", strength: 0, label: "MA–" };
  const pct = ((ma7 - ma25) / ma25) * 100;
  const dir: SignalComponent["dir"] = Math.abs(pct) < 0.05 ? "NEUTRAL" : pct > 0 ? "LONG" : "SHORT";
  const strength = Math.min(100, Math.abs(pct) * 15);
  return { dir, strength, label: `MA${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` };
}

// ── Composite analyzer ────────────────────────────────────────────────────────

export function analyzeCoin(coin: BotCoin): CryptoSignal {
  const prices = coin.sparkline_in_7d?.price ?? [];
  const volPct = volatilityPct(prices);

  const momentum = momentumSignal(coin);
  const rsiComp  = rsiSignal(prices);
  const bbComp   = bollingerSignal(prices, coin.current_price);
  const maComp   = maSignal(prices);
  const volComp  = volumeSignal(coin, momentum.dir);

  // Composite score (weighted average of component strengths)
  const score = Math.round(
    momentum.strength * 0.25 +
    rsiComp.strength  * 0.20 +
    bbComp.strength   * 0.20 +
    volComp.strength  * 0.15 +
    maComp.strength   * 0.20,
  );

  // Direction: weighted vote (each component casts its strength × weight)
  const toLong  = (s: SignalComponent, w: number) => s.dir === "LONG"  ? s.strength * w : 0;
  const toShort = (s: SignalComponent, w: number) => s.dir === "SHORT" ? s.strength * w : 0;
  const longVote  = toLong(momentum, 0.25) + toLong(rsiComp, 0.20) + toLong(bbComp, 0.20) + toLong(volComp, 0.15) + toLong(maComp, 0.20);
  const shortVote = toShort(momentum, 0.25) + toShort(rsiComp, 0.20) + toShort(bbComp, 0.20) + toShort(volComp, 0.15) + toShort(maComp, 0.20);
  const direction: CryptoSignal["direction"] =
    longVote  > shortVote + 5 ? "LONG"  :
    shortVote > longVote  + 5 ? "SHORT" : "NEUTRAL";

  // Dynamic TP and trailing stop based on volatility
  const takeProfitPct   = volPct < 3 ? 8  : volPct < 8 ? 15 : 25;
  const trailingStopPct = volPct < 3 ? 3  : volPct < 8 ? 5  : 8;

  return {
    coin, direction, score,
    components: { momentum, rsi: rsiComp, bollinger: bbComp, volume: volComp, ma: maComp },
    takeProfitPct, trailingStopPct, volatility: volPct,
  };
}
