"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PricePoint {
  t: number;
  p: number;
}

interface Props {
  marketId: string;
}

const INTERVALS = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1m" },
  { label: "All", value: "max" },
];

function formatTime(ts: number, interval: string): string {
  const d = new Date(ts * 1000);
  if (interval === "1d") return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PriceChart({ marketId }: Props) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [interval, setInterval] = useState("1w");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch(`/api/markets/${marketId}/history?interval=${interval}&fidelity=60`)
      .then((r) => r.json())
      .then((d) => setData(d.history ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [marketId, interval]);

  const yesColor = "#10b981";
  const currentPrice = data.length ? data[data.length - 1].p : null;
  const firstPrice = data.length ? data[0].p : null;
  const priceChange = currentPrice !== null && firstPrice !== null ? currentPrice - firstPrice : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">YES probability</h2>
          {currentPrice !== null && (
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">{Math.round(currentPrice * 100)}%</span>
              {priceChange !== null && (
                <span className={`text-sm font-medium ${priceChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {priceChange >= 0 ? "+" : ""}{Math.round(priceChange * 100)}%
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1">
          {INTERVALS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setInterval(value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                interval === value
                  ? "bg-emerald-500 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-48 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
          No price history available
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
          No data for this period
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={yesColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={yesColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              tickFormatter={(t) => formatTime(t, interval)}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={50}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(t) => formatTime(t as number, interval)}
              formatter={(v: unknown) => [`${Math.round((v as number) * 100)}%`, "YES"] as [string, string]}
            />
            <Area
              type="monotone"
              dataKey="p"
              stroke={yesColor}
              strokeWidth={2}
              fill="url(#yesGrad)"
              dot={false}
              activeDot={{ r: 4, fill: yesColor }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
