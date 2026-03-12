"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";

/* ─── Types ─── */
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
}

/* ─── Helpers ─── */
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function pctColor(v: number): string {
  if (v > 3)  return "text-emerald-400";
  if (v > 0)  return "text-emerald-300";
  if (v < -3) return "text-red-400";
  if (v < 0)  return "text-red-300";
  return "text-gray-400";
}

function pctBg(v: number): string {
  if (v > 3)  return "bg-emerald-500/15 border-emerald-500/30 text-emerald-300";
  if (v > 0)  return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  if (v < -3) return "bg-red-500/15 border-red-500/30 text-red-300";
  if (v < 0)  return "bg-red-500/10 border-red-500/20 text-red-400";
  return "bg-gray-700/50 border-gray-700 text-gray-400";
}

/** Simple momentum projection based on 24h + 7d trend */
function projection(coin: Coin): {
  label: string;
  value: number;
  color: string;
  bar: string;
  icon: string;
} {
  const d = coin.price_change_percentage_24h ?? 0;
  const w = (coin.price_change_percentage_7d_in_currency ?? 0) / 7;
  const momentum = d * 0.6 + w * 0.4; // weighted momentum

  if (momentum > 2)  return { label: "Haussier fort",  value: momentum, color: "text-emerald-400", bar: "bg-emerald-500", icon: "↑↑" };
  if (momentum > 0.5) return { label: "Haussier",       value: momentum, color: "text-emerald-300", bar: "bg-emerald-400", icon: "↑"  };
  if (momentum < -2) return { label: "Baissier fort",   value: momentum, color: "text-red-400",     bar: "bg-red-500",    icon: "↓↓" };
  if (momentum < -0.5) return { label: "Baissier",      value: momentum, color: "text-red-300",     bar: "bg-red-400",    icon: "↓"  };
  return               { label: "Neutre",               value: momentum, color: "text-yellow-400",  bar: "bg-yellow-500", icon: "→"  };
}

/* ─── Skeleton ─── */
function Skeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-800" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-20 bg-gray-800 rounded" />
          <div className="h-2.5 w-10 bg-gray-800 rounded" />
        </div>
      </div>
      <div className="h-7 w-28 bg-gray-800 rounded" />
      <div className="h-16 bg-gray-800 rounded-lg" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-10 bg-gray-800 rounded" />
        <div className="h-10 bg-gray-800 rounded" />
      </div>
    </div>
  );
}

/* ─── Main ─── */
export default function CryptoPage() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/crypto")
      .then((r) => {
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setCoins(Array.isArray(data) ? data : []);
        setLastUpdate(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  const totalMcap = coins.reduce((s, c) => s + c.market_cap, 0);
  const btc = coins.find((c) => c.id === "bitcoin");
  const btcDominance = btc ? ((btc.market_cap / totalMcap) * 100).toFixed(1) : "—";
  const avgChange = coins.length
    ? (coins.reduce((s, c) => s + (c.price_change_percentage_24h ?? 0), 0) / coins.length).toFixed(2)
    : "0";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Page header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Crypto <span className="text-emerald-400">Live</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Prix en temps réel · projection de tendance · indicateurs clés
            </p>
          </div>
          {lastUpdate && (
            <button
              onClick={load}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Mis à jour {lastUpdate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </button>
          )}
        </div>

        {/* Stats bar */}
        {!loading && coins.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Market Cap Total", value: fmtLarge(totalMcap), accent: "text-emerald-400", icon: "◎" },
              { label: "Dominance BTC",    value: `${btcDominance}%`,  accent: "text-yellow-400",  icon: "₿" },
              { label: "Variation moy. 24h", value: `${Number(avgChange) >= 0 ? "+" : ""}${avgChange}%`,
                accent: Number(avgChange) >= 0 ? "text-emerald-400" : "text-red-400", icon: "⚡" },
              { label: "Actifs suivis",   value: coins.length.toString(), accent: "text-blue-400", icon: "◈" },
            ].map(({ label, value, accent, icon }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`text-xs ${accent} opacity-70`}>{icon}</span>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">{label}</p>
                </div>
                <p className={`text-xl font-bold ${accent}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-16">
            <p className="text-red-400 font-medium">Impossible de charger les données crypto</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
            <button onClick={load} className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-medium rounded-lg transition-colors">
              Réessayer
            </button>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} />)
            : coins.map((coin, i) => {
                const proj = projection(coin);
                const d = coin.price_change_percentage_24h ?? 0;
                const w = coin.price_change_percentage_7d_in_currency ?? 0;
                const range = coin.high_24h - coin.low_24h;
                const pricePos = range > 0
                  ? ((coin.current_price - coin.low_24h) / range) * 100
                  : 50;

                return (
                  <div
                    key={coin.id}
                    style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                    className="group bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-gray-600 hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 transition-all duration-200 animate-fade-slide-up"
                  >
                    {/* Coin header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={coin.image} alt={coin.name} className="w-9 h-9 rounded-full" />
                        <div>
                          <p className="text-sm font-bold text-white">{coin.name}</p>
                          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">{coin.symbol}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-600 font-medium">#{coin.market_cap_rank}</span>
                    </div>

                    {/* Price + 24h change */}
                    <div className="flex items-end justify-between">
                      <p className="text-2xl font-extrabold text-white tracking-tight">{fmtPrice(coin.current_price)}</p>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${pctBg(d)}`}>
                          {d >= 0 ? "+" : ""}{d.toFixed(2)}% 24h
                        </span>
                        <span className={`text-[10px] font-medium ${pctColor(w)}`}>
                          {w >= 0 ? "+" : ""}{w.toFixed(2)}% 7j
                        </span>
                      </div>
                    </div>

                    {/* 24h range bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span>Bas 24h {fmtPrice(coin.low_24h)}</span>
                        <span>Haut 24h {fmtPrice(coin.high_24h)}</span>
                      </div>
                      <div className="relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-yellow-500 to-emerald-500 opacity-40 rounded-full" />
                        <div
                          className="absolute top-0 bottom-0 w-1.5 bg-white rounded-full shadow-sm"
                          style={{ left: `calc(${pricePos}% - 3px)` }}
                        />
                      </div>
                    </div>

                    {/* Projection / trend */}
                    <div className="bg-gray-800/60 rounded-xl px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-base font-black ${proj.color}`}>{proj.icon}</span>
                          <span className={`text-xs font-bold ${proj.color}`}>{proj.label}</span>
                        </div>
                        <span className={`text-xs font-semibold ${proj.color}`}>
                          Momentum {proj.value >= 0 ? "+" : ""}{proj.value.toFixed(2)}%
                        </span>
                      </div>
                      {/* Momentum bar */}
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${proj.bar}`}
                          style={{ width: `${Math.min(Math.abs(proj.value) * 10, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500">
                        Basé sur variation 24h (60%) + tendance 7j (40%)
                      </p>
                    </div>

                    {/* Volume + Market cap */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-800/80 text-[11px]">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Volume 24h</p>
                        <p className="text-white font-semibold">{fmtLarge(coin.total_volume)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Market Cap</p>
                        <p className="text-white font-semibold">{fmtLarge(coin.market_cap)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      </main>
    </div>
  );
}
