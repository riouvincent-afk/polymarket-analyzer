import { Market } from "./types";

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
