import Link from "next/link";
import { Market } from "@/lib/types";
import { opportunityScore, scoreGrade, potentialYield, yieldBadge, fmtProfit } from "@/lib/score";

const TAG_COLORS: Record<string, string> = {
  Crypto:    "text-yellow-400 bg-yellow-400/10",
  Politics:  "text-red-400 bg-red-400/10",
  Economics: "text-blue-400 bg-blue-400/10",
  Sports:    "text-purple-400 bg-purple-400/10",
};

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props { market: Market; index?: number }

export default function MarketCard({ market, index = 0 }: Props) {
  const yesPct = Math.round(market.yes_price * 100);
  const noPct  = 100 - yesPct;
  const label  = market.tags[0] ?? market.category ?? "Other";
  const tagColor = TAG_COLORS[label] ?? "text-gray-400 bg-gray-400/10";
  const score  = opportunityScore(market);
  const grade  = scoreGrade(score);
  const yld    = potentialYield(market);

  return (
    <Link
      href={`/markets/${market.id}`}
      style={{ animationDelay: `${Math.min(index * 45, 500)}ms` }}
      className={[
        "group relative flex flex-col gap-3 rounded-2xl p-5 overflow-hidden",
        "transition-all duration-200 cursor-pointer animate-fade-slide-up",
        "hover:scale-[1.025] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50",
        grade.glow
          ? "bg-gray-900 border border-orange-500/25 hover:border-orange-400/50"
          : "bg-gray-900 border border-gray-800 hover:border-gray-600",
      ].join(" ")}
    >
      {/* HOT ambient glow */}
      {grade.glow && (
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/8 via-transparent to-transparent pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${tagColor}`}>
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${grade.ring}`}>
            <span className={grade.color}>{score}</span>
            <span className={`${grade.color} opacity-60`}>{grade.label}</span>
          </span>
          {market.end_date && (
            <span className="text-[11px] text-gray-500">{fmtDate(market.end_date)}</span>
          )}
        </div>
      </div>

      {/* Question */}
      <p className="text-white text-[0.88rem] font-semibold leading-snug line-clamp-3 group-hover:text-gray-100 transition-colors">
        {market.question}
      </p>

      {/* Probability bar with gradients */}
      <div className="space-y-1.5">
        <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-800/80">
          <div
            className="bg-gradient-to-r from-emerald-700 to-emerald-400 transition-all duration-500"
            style={{ width: `${yesPct}%` }}
          />
          <div
            className="bg-gradient-to-l from-red-700 to-red-400 transition-all duration-500"
            style={{ width: `${noPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] font-bold tracking-wide">
          <span className="text-emerald-400">YES {yesPct}%</span>
          <span className="text-red-400">NO {noPct}%</span>
        </div>
      </div>

      {/* Yield badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-500 font-medium">Mise $10 →</span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${yieldBadge(yld.yesBet)}`}>
          YES {fmtProfit(yld.yesBet)}
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${yieldBadge(yld.noBet)}`}>
          NO {fmtProfit(yld.noBet)}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800/80 text-[11px]">
        <div>
          <p className="text-gray-500 mb-0.5 uppercase tracking-wider text-[10px]">Vol 24h</p>
          <p className="text-white font-semibold">{fmtVol(market.volume24h)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5 uppercase tracking-wider text-[10px]">Total</p>
          <p className="text-white font-semibold">{fmtVol(market.volume)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5 uppercase tracking-wider text-[10px]">Liquidité</p>
          <p className="text-white font-semibold">{fmtVol(market.liquidity)}</p>
        </div>
      </div>

      {/* Score accent line */}
      <div
        className="absolute bottom-0 left-0 h-[2px] opacity-50 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          width: `${score}%`,
          background: grade.glow
            ? "linear-gradient(to right, #f97316, #fb923c)"
            : "linear-gradient(to right, #10b981, #3b82f6)",
        }}
      />
    </Link>
  );
}
