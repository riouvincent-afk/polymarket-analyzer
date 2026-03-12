import Link from "next/link";
import { Market } from "@/lib/types";
import { opportunityScore, scoreGrade } from "@/lib/score";

const TAG_COLORS: Record<string, string> = {
  Crypto: "text-yellow-400 bg-yellow-400/10",
  Politics: "text-red-400 bg-red-400/10",
  Economics: "text-blue-400 bg-blue-400/10",
  Sports: "text-purple-400 bg-purple-400/10",
};

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MarketCard({ market }: { market: Market }) {
  const yesPct = Math.round(market.yes_price * 100);
  const noPct = 100 - yesPct;
  const label = market.tags[0] ?? market.category ?? "Other";
  const tagColor = TAG_COLORS[label] ?? "text-gray-400 bg-gray-400/10";
  const score = opportunityScore(market);
  const grade = scoreGrade(score);

  return (
    <Link href={`/markets/${market.id}`} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4 hover:border-gray-600 transition-colors cursor-pointer">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${tagColor}`}>
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${grade.ring} ${grade.color}`}>
            {score} {grade.label}
          </span>
          {market.end_date && (
            <span className="text-xs text-gray-500">{formatDate(market.end_date)}</span>
          )}
        </div>
      </div>

      {/* Question */}
      <p className="text-white font-medium leading-snug line-clamp-3">{market.question}</p>

      {/* Probability bar */}
      <div className="space-y-1.5">
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
          <div className="bg-emerald-500 transition-all" style={{ width: `${yesPct}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${noPct}%` }} />
        </div>
        <div className="flex justify-between text-xs font-semibold">
          <span className="text-emerald-400">YES {yesPct}%</span>
          <span className="text-red-400">NO {noPct}%</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-800 text-xs">
        <div>
          <p className="text-gray-500 mb-0.5">Vol 24h</p>
          <p className="text-white font-medium">{formatVolume(market.volume24h)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">Total Vol</p>
          <p className="text-white font-medium">{formatVolume(market.volume)}</p>
        </div>
        <div>
          <p className="text-gray-500 mb-0.5">Liquidity</p>
          <p className="text-white font-medium">{formatVolume(market.liquidity)}</p>
        </div>
      </div>
    </Link>
  );
}
