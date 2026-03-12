import Link from "next/link";
import { Market } from "@/lib/types";
import { opportunityScore, scoreGrade } from "@/lib/score";

const MEDALS = ["🥇", "🥈", "🥉"];

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function TopBets({ markets }: { markets: Market[] }) {
  const top3 = [...markets]
    .map((m) => ({ market: m, score: opportunityScore(m) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (top3.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-white">Top Opportunités</span>
        <span className="text-xs text-gray-500 font-normal">score basé sur volume 24h · liquidité · incertitude</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {top3.map(({ market, score }, i) => {
          const grade = scoreGrade(score);
          const yesPct = Math.round(market.yes_price * 100);
          const noPct = 100 - yesPct;
          const label = market.tags[0] ?? market.category ?? "Other";

          return (
            <Link
              key={market.id}
              href={`/markets/${market.id}`}
              className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-500 transition-colors overflow-hidden"
            >
              {/* Rank + score */}
              <div className="flex items-center justify-between">
                <span className="text-xl leading-none">{MEDALS[i]}</span>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${grade.ring}`}>
                  <span className={grade.color}>{score}</span>
                  <span className={`${grade.color} opacity-70`}>{grade.label}</span>
                </div>
              </div>

              {/* Tag + question */}
              <div className="space-y-1.5">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                <p className="text-white font-semibold leading-snug line-clamp-2 text-sm">
                  {market.question}
                </p>
              </div>

              {/* Probability bar */}
              <div className="space-y-1">
                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800">
                  <div className="bg-emerald-500" style={{ width: `${yesPct}%` }} />
                  <div className="bg-red-500" style={{ width: `${noPct}%` }} />
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-emerald-400">YES {yesPct}%</span>
                  <span className="text-red-400">NO {noPct}%</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex gap-4 pt-1 border-t border-gray-800 text-xs">
                <div>
                  <p className="text-gray-500">Vol 24h</p>
                  <p className="text-white font-medium">{fmt(market.volume24h)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Liquidité</p>
                  <p className="text-white font-medium">{fmt(market.liquidity)}</p>
                </div>
              </div>

              {/* Score bar background accent */}
              <div
                className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-emerald-500 to-blue-500 opacity-60"
                style={{ width: `${score}%` }}
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
