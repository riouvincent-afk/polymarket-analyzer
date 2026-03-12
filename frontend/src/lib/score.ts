import { Market } from "./types";

export interface YieldResult {
  yesBet: number;      // profit on $10 YES bet
  noBet: number;       // profit on $10 NO bet
  yesPct: number;      // ROI %
  noPct: number;
  bestSide: "YES" | "NO";
  bestProfit: number;
  bestPct: number;
  bestPrice: number;
}

/** Potential profit for a $10 bet on each side. */
export function potentialYield(market: Market, stake = 10): YieldResult {
  const yesBet = stake / market.yes_price - stake;
  const noBet  = stake / market.no_price  - stake;
  const yesPct = (yesBet / stake) * 100;
  const noPct  = (noBet  / stake) * 100;
  // "best" = side with better expected value proxy (less extreme price = more uncertain)
  const bestSide   = market.yes_price <= market.no_price ? "YES" : "NO";
  const bestProfit = bestSide === "YES" ? yesBet : noBet;
  const bestPct    = bestSide === "YES" ? yesPct : noPct;
  const bestPrice  = bestSide === "YES" ? market.yes_price : market.no_price;
  return { yesBet, noBet, yesPct, noPct, bestSide, bestProfit, bestPct, bestPrice };
}

/**
 * Opportunity score 0–100 combining:
 * - Volume 24h   (45%) — activity/momentum
 * - Liquidity    (35%) — ease of entry/exit
 * - Uncertainty  (20%) — price not at extreme (best near 50/50)
 */
export function opportunityScore(market: Market): number {
  const vol = Math.min(Math.log10(market.volume24h + 1) / 7, 1); // ~10M → 1.0
  const liq = Math.min(Math.log10(market.liquidity + 1) / 6, 1); // ~1M → 1.0
  const uncertainty = 1 - Math.abs(market.yes_price - 0.5) * 2;  // 50/50 → 1, 0%/100% → 0

  return Math.round((vol * 0.45 + liq * 0.35 + uncertainty * 0.20) * 100);
}

export function scoreGrade(score: number): {
  label: string;
  color: string;
  ring: string;
} {
  if (score >= 70)
    return { label: "HOT", color: "text-orange-400", ring: "border-orange-400/40 bg-orange-400/10" };
  if (score >= 50)
    return { label: "GOOD", color: "text-emerald-400", ring: "border-emerald-400/40 bg-emerald-400/10" };
  if (score >= 30)
    return { label: "FAIR", color: "text-blue-400", ring: "border-blue-400/40 bg-blue-400/10" };
  return { label: "LOW", color: "text-gray-500", ring: "border-gray-700 bg-gray-800" };
}
