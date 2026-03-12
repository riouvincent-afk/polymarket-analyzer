import { Market } from "@/lib/types";

function fmtVol(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const STATS_CONFIG = [
  { key: "markets",    label: "Marchés",    icon: "◈", accent: "text-emerald-400" },
  { key: "totalVol",   label: "Volume Total", icon: "◎", accent: "text-blue-400"    },
  { key: "vol24h",     label: "Volume 24h",  icon: "⚡", accent: "text-yellow-400"  },
  { key: "liquidity",  label: "Liquidité",   icon: "◉", accent: "text-purple-400"  },
];

interface Props { markets: Market[]; total: number }

export default function StatsBar({ markets, total }: Props) {
  const totalVol   = markets.reduce((s, m) => s + m.volume,    0);
  const totalVol24 = markets.reduce((s, m) => s + m.volume24h, 0);
  const totalLiq   = markets.reduce((s, m) => s + m.liquidity, 0);

  const values: Record<string, string> = {
    markets:   total.toString(),
    totalVol:  fmtVol(totalVol),
    vol24h:    fmtVol(totalVol24),
    liquidity: fmtVol(totalLiq),
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {STATS_CONFIG.map(({ key, label, icon, accent }) => (
        <div
          key={key}
          className="relative bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 overflow-hidden group hover:border-gray-700 transition-colors"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-xs ${accent} opacity-70`}>{icon}</span>
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">{label}</p>
          </div>
          <p className={`text-xl font-bold ${accent}`}>{values[key]}</p>
          <div className={`absolute bottom-0 left-0 right-0 h-[1px] opacity-20 bg-gradient-to-r ${
            key === "markets"   ? "from-emerald-500 to-transparent" :
            key === "totalVol"  ? "from-blue-500 to-transparent"    :
            key === "vol24h"    ? "from-yellow-500 to-transparent"  :
                                  "from-purple-500 to-transparent"
          }`} />
        </div>
      ))}
    </div>
  );
}
