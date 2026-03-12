import { Market } from "./types";

export interface YieldResult {
  yesBet: number;
  noBet: number;
  yesPct: number;
  noPct: number;
  bestSide: "YES" | "NO";
  bestProfit: number;
  bestPct: number;
  bestPrice: number;
}

/** Profit for a $10 bet on each side. */
export function potentialYield(market: Market, stake = 10): YieldResult {
  const yesBet = stake / market.yes_price - stake;
  const noBet  = stake / market.no_price  - stake;
  const yesPct = (yesBet / stake) * 100;
  const noPct  = (noBet  / stake) * 100;
  const bestSide   = market.yes_price <= market.no_price ? "YES" : "NO";
  const bestProfit = bestSide === "YES" ? yesBet : noBet;
  const bestPct    = bestSide === "YES" ? yesPct : noPct;
  const bestPrice  = bestSide === "YES" ? market.yes_price : market.no_price;
  return { yesBet, noBet, yesPct, noPct, bestSide, bestProfit, bestPct, bestPrice };
}

/**
 * Opportunity score 0–100.
 *
 * Formula crosses volume and proximity so only markets that are BOTH
 * liquid AND genuinely uncertain rank high:
 *
 *   proximity = (1 - |p_yes - 0.5| × 2)²   → sharp cosine-like, 50/50 → 1
 *   heat      = vol_norm × proximity         → high volume AND uncertain
 *
 *   score = heat × 0.40 + liq × 0.30 + vol × 0.15 + proximity × 0.15
 */
export function opportunityScore(market: Market): number {
  const vol      = Math.min(Math.log10(market.volume24h + 1) / 7, 1); // $10M → 1
  const liq      = Math.min(Math.log10(market.liquidity  + 1) / 6, 1); // $1M  → 1
  const proximity = Math.pow(1 - Math.abs(market.yes_price - 0.5) * 2, 2);
  const heat     = vol * proximity;

  return Math.round((heat * 0.40 + liq * 0.30 + vol * 0.15 + proximity * 0.15) * 100);
}

export interface ScoreGrade {
  label: string;
  color: string;
  ring: string;
  glow: boolean;
}

export function scoreGrade(score: number): ScoreGrade {
  if (score >= 60)
    return { label: "HOT",  color: "text-orange-300", ring: "border-orange-500/40 bg-orange-500/10", glow: true  };
  if (score >= 40)
    return { label: "GOOD", color: "text-emerald-300", ring: "border-emerald-500/40 bg-emerald-500/10", glow: false };
  if (score >= 20)
    return { label: "FAIR", color: "text-blue-300",    ring: "border-blue-500/40 bg-blue-500/10",    glow: false };
  return   { label: "LOW",  color: "text-gray-500",   ring: "border-gray-700 bg-gray-800",           glow: false };
}

export function yieldBadge(profit: number, stake = 10): string {
  const roi = (profit / stake) * 100;
  if (roi > 500) return "bg-orange-500/20 text-orange-300 border border-orange-500/30";
  if (roi > 100) return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25";
  if (roi > 20)  return "bg-blue-500/15 text-blue-300 border border-blue-500/25";
  return               "bg-gray-700/50 text-gray-400 border border-gray-700";
}

export function fmtProfit(profit: number): string {
  if (profit >= 1000) return `+$${(profit / 1000).toFixed(1)}K`;
  return `+$${profit.toFixed(1)}`;
}
