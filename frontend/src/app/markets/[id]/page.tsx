"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchMarket } from "@/lib/api";
import { Market } from "@/lib/types";
import Header from "@/components/Header";
import PriceChart from "@/components/PriceChart";

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function MarketPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarket(id)
      .then(setMarket)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const yesPct = market ? Math.round(market.yes_price * 100) : 0;
  const noPct = 100 - yesPct;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back
        </button>

        {loading && (
          <div className="space-y-4">
            <div className="h-8 bg-gray-800 rounded animate-pulse w-3/4" />
            <div className="h-48 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-red-400 font-medium">Market not found</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
          </div>
        )}

        {market && (
          <>
            {/* Tags */}
            <div className="flex gap-2 flex-wrap">
              {market.tags.map((tag) => (
                <span key={tag} className="text-xs px-2.5 py-1 bg-gray-800 text-gray-300 rounded-full">
                  {tag}
                </span>
              ))}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold leading-snug">{market.question}</h1>

            {/* Probability card */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
              <div className="flex h-5 rounded-full overflow-hidden bg-gray-800">
                <div className="bg-emerald-500 transition-all" style={{ width: `${yesPct}%` }} />
                <div className="bg-red-500 transition-all" style={{ width: `${noPct}%` }} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-400">{yesPct}%</p>
                  <p className="text-sm text-gray-400 mt-1">YES</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-red-400">{noPct}%</p>
                  <p className="text-sm text-gray-400 mt-1">NO</p>
                </div>
              </div>
            </div>

            {/* Price chart */}
            <PriceChart marketId={id} />

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Volume 24h", value: formatVolume(market.volume24h) },
                { label: "Total Volume", value: formatVolume(market.volume) },
                { label: "Liquidity", value: formatVolume(market.liquidity) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="text-lg font-bold">{value}</p>
                </div>
              ))}
            </div>

            {/* End date */}
            {market.end_date && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Resolution date</p>
                  <p className="font-medium">{formatDate(market.end_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">Days left</p>
                  <p className={`text-lg font-bold ${daysLeft(market.end_date) <= 7 ? "text-red-400" : "text-white"}`}>
                    {daysLeft(market.end_date)}
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {market.description && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-5 space-y-2">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Description</h2>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                  {market.description}
                </p>
              </div>
            )}

            {/* Polymarket link */}
            {market.slug && (
              <a
                href={`https://polymarket.com/event/${market.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center py-3 border border-gray-700 rounded-xl text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                View on Polymarket ↗
              </a>
            )}
          </>
        )}
      </main>
    </div>
  );
}
