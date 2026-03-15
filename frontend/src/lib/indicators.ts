/** Simple Moving Average of the last `period` elements */
export function sma(prices: number[], period: number): number {
  const slice = prices.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * RSI (Relative Strength Index) — Wilder's smoothing, default 14 periods.
 * Returns 50 when there is insufficient data.
 */
export function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  const slice = prices.slice(-(period + 1));
  const changes: number[] = [];
  for (let i = 1; i < slice.length; i++) changes.push(slice[i] - slice[i - 1]);
  const avgGain = changes.reduce((s, c) => s + (c > 0 ? c : 0), 0) / period;
  const avgLoss = changes.reduce((s, c) => s + (c < 0 ? -c : 0), 0) / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  /** (4 × std) / middle — normalized bandwidth */
  bandwidth: number;
}

/** Bollinger Bands — 20-period SMA ± 2 standard deviations */
export function bollingerBands(prices: number[], period = 20): BollingerBands {
  const slice = prices.slice(-period);
  if (slice.length < 4) {
    const p = prices.at(-1) ?? 0;
    return { upper: p, middle: p, lower: p, bandwidth: 0 };
  }
  const middle = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((s, p) => s + (p - middle) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance);
  return {
    upper: middle + 2 * std,
    lower: middle - 2 * std,
    middle,
    bandwidth: middle > 0 ? (4 * std) / middle : 0,
  };
}

/**
 * Exponential Moving Average — returns array of same length as prices.
 * Values before period is reached are NaN.
 */
export function ema(prices: number[], period: number): number[] {
  const result = new Array(prices.length).fill(NaN) as number[];
  if (prices.length < period) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  result[period - 1] = sum / period;
  for (let i = period; i < prices.length; i++) {
    result[i] = prices[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

/**
 * MACD (12/26/9 by default). Returns arrays of same length as prices.
 * Values are NaN until sufficient data is available.
 */
export function macd(
  prices: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: number[]; signal: number[]; histogram: number[] } {
  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);
  const line = emaFast.map((f, i) => (isNaN(f) || isNaN(emaSlow[i]) ? NaN : f - emaSlow[i]));
  // Signal = EMA of MACD line (starting from first valid MACD value)
  const firstValid = slow - 1;
  const emaOfMacd = ema(line.slice(firstValid), signalPeriod);
  const signal = new Array(prices.length).fill(NaN) as number[];
  emaOfMacd.forEach((v, i) => { signal[firstValid + i] = v; });
  const histogram = line.map((m, i) => (isNaN(m) || isNaN(signal[i]) ? NaN : m - signal[i]));
  return { line, signal, histogram };
}

/**
 * Price volatility as coefficient of variation (%).
 * Uses sparkline prices (typically 168 hourly points for 7 days).
 */
export function volatilityPct(prices: number[]): number {
  if (prices.length < 2) return 0;
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (mean === 0) return 0;
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  return (Math.sqrt(variance) / mean) * 100;
}
