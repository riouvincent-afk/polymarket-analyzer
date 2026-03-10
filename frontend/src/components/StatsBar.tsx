import { Market } from "@/lib/types";

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  markets: Market[];
  total: number;
}

export default function StatsBar({ markets, total }: Props) {
  const totalVolume = markets.reduce((s, m) => s + m.volume, 0);
  const totalVol24h = markets.reduce((s, m) => s + m.volume24h, 0);
  const totalLiquidity = markets.reduce((s, m) => s + m.liquidity, 0);

  const stats = [
    { label: "Markets", value: total.toString() },
    { label: "Total Volume", value: formatVolume(totalVolume) },
    { label: "Volume 24h", value: formatVolume(totalVol24h) },
    { label: "Liquidity", value: formatVolume(totalLiquidity) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <p className="text-xs text-gray-500 mb-1">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}
