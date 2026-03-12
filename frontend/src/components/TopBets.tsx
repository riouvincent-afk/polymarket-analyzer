import Link from "next/link";
import { Market } from "@/lib/types";
import { opportunityScore, scoreGrade, potentialYield, yieldBadge, fmtProfit } from "@/lib/score";

const RANK_STYLES = [
  { medal: "🥇", border: "border-yellow-500/30 hover:border-yellow-400/60", bg: "from-yellow-500/6" },
  { medal: "🥈", border: "border-gray-500/30 hover:border-gray-400/50",   bg: "from-gray-500/5"   },
  { medal: "🥉", border: "border-orange-800/30 hover:border-orange-700/50", bg: "from-orange-800/5" },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
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
      {/* Section header */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-base font-bold text-white tracking-tight">Top Opportunités</h2>
        <span className="text-[11px] text-gray-500">
          vol 24h élevé · bonne liquidité · prix proche de 50/50
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {top3.map(({ market, score }, i) => {
          const grade    = scoreGrade(score);
          const yesPct   = Math.round(market.yes_price * 100);
          const noPct    = 100 - yesPct;
          const label    = market.tags[0] ?? market.category ?? "Other";
          const yld      = potentialYield(market);
          const rankStyle = RANK_STYLES[i];

          return (
            <Link
              key={market.id}
              href={`/markets/${market.id}`}
              style={{ animationDelay: `${i * 80}ms` }}
              className={[
                "group relative flex flex-col gap-3 rounded-2xl p-5 overflow-hidden",
                "bg-gray-900 border transition-all duration-200 cursor-pointer animate-fade-slide-up",
                "hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50",
                rankStyle.border,
              ].join(" ")}
            >
              {/* Ambient gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${rankStyle.bg} to-transparent pointer-events-none`} />

              {/* Rank + score */}
              <div className="flex items-center justify-between">
                <span className="text-xl leading-none select-none">{rankStyle.medal}</span>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${grade.ring}`}>
                  <span className={`text-sm font-extrabold ${grade.color}`}>{score}</span>
                  <span className={`${grade.color} opacity-60 text-[10px] uppercase tracking-widest`}>{grade.label}</span>
                </div>
              </div>

              {/* Category + question */}
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">{label}</p>
                <p className="text-white text-sm font-semibold leading-snug line-clamp-2 group-hover:text-gray-100 transition-colors">
                  {market.question}
                </p>
              </div>

              {/* Probability bar */}
              <div className="space-y-1.5">
                <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
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
                <span className="text-[11px] text-gray-500">Mise $10 →</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${yieldBadge(yld.yesBet)}`}>
                  YES {fmtProfit(yld.yesBet)}
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${yieldBadge(yld.noBet)}`}>
                  NO {fmtProfit(yld.noBet)}
                </span>
              </div>

              {/* Footer stats */}
              <div className="flex gap-5 pt-2 border-t border-gray-800/80 text-[11px]">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Vol 24h</p>
                  <p className="text-white font-semibold">{fmt(market.volume24h)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Liquidité</p>
                  <p className="text-white font-semibold">{fmt(market.liquidity)}</p>
                </div>
              </div>

              {/* Score bar accent */}
              <div
                className="absolute bottom-0 left-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity duration-300"
                style={{ width: `${score}%`, background: "linear-gradient(to right, #f59e0b, #f97316)" }}
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
