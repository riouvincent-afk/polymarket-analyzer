"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useBotContext } from "@/lib/BotContext";
import type { Market } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────────
interface CoinMarket {
  id: string; symbol: string; name: string; image: string;
  current_price: number; market_cap_rank: number;
  ath: number; ath_change_percentage: number;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_1h_in_currency: number | null;
  total_volume: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}
function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function pctColor(n: number | null): string {
  if (n == null) return "#666";
  return n >= 0 ? "#00ff88" : "#ef4444";
}
function fmtLarge(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// ── Pulse dot ──────────────────────────────────────────────────────────────────
function LiveDot({ color = "#00ff88" }: { color?: string }) {
  return <span className="inline-flex items-center justify-center w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />;
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Card({ children, accent = "#00ff88", className = "" }: { children: React.ReactNode; accent?: string; className?: string }) {
  return (
    <div
      className={`rounded-2xl border p-6 flex flex-col ${className}`}
      style={{ background: "#0d0d0d", borderColor: accent + "22", boxShadow: `0 0 40px ${accent}08` }}
    >
      {children}
    </div>
  );
}

// ── CARD 1: Meilleur signal ────────────────────────────────────────────────────
function BestSignalCard() {
  const { state, toggle } = useBotContext();
  const signals = (state.lastSignals ?? []) as import("@/lib/bot").CombinedSignal[];
  const top     = signals[0];

  const LAYER_COLORS: Record<number, string> = { 1: "#a78bfa", 2: "#38bdf8", 3: "#00ff88", 4: "#fb923c" };
  const accentColor = top ? LAYER_COLORS[top.primaryLayer] ?? "#00ff88" : "#00ff88";

  return (
    <Card accent={accentColor} className="relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accentColor}08, transparent 70%)` }} />

      <div className="relative z-10 flex-1">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.25em", color: accentColor + "99" }}>Meilleur signal</p>
            <h2 style={{ color: "#e8e8e8", fontWeight: 700, fontSize: "1rem", marginTop: "2px" }}>Signal du moment</h2>
          </div>
          <div className="flex items-center gap-2">
            <LiveDot color={state.isActive ? "#00ff88" : "#444"} />
            <span style={{ fontSize: "10px", color: state.isActive ? "#00ff8888" : "#444", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {state.isActive ? "Live" : "Pause"}
            </span>
          </div>
        </div>

        {top ? (
          <div>
            <div className="flex items-start gap-3 mb-4">
              <div>
                <p style={{ color: "#666", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.3rem" }}>
                  {top.coinName} · {top.coinSymbol}
                </p>
                <p className="neon-text font-black" style={{ fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em", lineHeight: 1, color: accentColor, textShadow: `0 0 20px ${accentColor}66` }}>
                  {top.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
                </p>
              </div>
              <div className="ml-auto text-right">
                <div className="inline-flex flex-col items-center justify-center rounded-xl px-3 py-2" style={{ background: accentColor + "15", border: `1px solid ${accentColor}25` }}>
                  <span style={{ color: accentColor, fontWeight: 900, fontSize: "1.4rem", lineHeight: 1 }}>{Math.round(top.weightedScore * 100)}</span>
                  <span style={{ color: "#666", fontSize: "9px", textTransform: "uppercase" }}>/100</span>
                </div>
              </div>
            </div>

            <p style={{ color: "#777", fontSize: "0.78rem", lineHeight: 1.6, marginBottom: "1rem" }}>{top.details}</p>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: accentColor + "12", color: accentColor, border: `1px solid ${accentColor}25` }}>
                L{top.primaryLayer} {["", "Smart Money", "Sentiment", "Arbitrage", "Auto-ML"][top.primaryLayer]}
              </span>
              {top.agreementCount > 1 && (
                <span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 600 }}>★ {top.agreementCount} couches en accord</span>
              )}
            </div>

            {signals.length > 1 && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#1a1a1a" }}>
                <p style={{ color: "#444", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.5rem" }}>Autres signaux</p>
                <div className="space-y-1">
                  {signals.slice(1, 4).map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span style={{ color: "#666", fontSize: "11px" }}>{s.coinSymbol}</span>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: s.direction === "LONG" ? "#00ff88" : "#ef4444" }}>
                        {s.direction === "LONG" ? "▲" : "▼"} {s.direction}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            <p style={{ color: "#333", fontSize: "2.5rem", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>—</p>
            <p style={{ color: "#555", fontSize: "0.82rem", marginBottom: "1.2rem" }}>
              {state.isActive ? "Analyse en cours…" : "Bot en pause"}
            </p>
            {!state.isActive && (
              <button onClick={toggle} style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#00ff88", padding: "8px 20px", border: "1px solid #00ff8830", borderRadius: 6, background: "transparent", cursor: "pointer" }}>
                Activer le bot
              </button>
            )}
          </div>
        )}
      </div>

      <Link href="/signals" style={{ marginTop: "auto", paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #1a1a1a" }}>
        <span style={{ color: "#444", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.12em" }}>Tous les signaux</span>
        <span style={{ color: "#555", fontSize: "12px" }}>→</span>
      </Link>
    </Card>
  );
}

// ── CARD 2: Top Polymarket ─────────────────────────────────────────────────────
function TopPolyCard() {
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/markets?limit=20&order=volume24h&ascending=false&closed=false")
      .then(r => r.json())
      .then((d: unknown) => {
        const data = d as { markets?: Market[] };
        if (data.markets?.length) {
          // Best opportunity: highest volume with price not too extreme (30-70%)
          const scored = data.markets.map(m => ({
            m,
            score: m.volume24h * (1 - Math.abs(m.yes_price - 0.5) * 2),
          }));
          scored.sort((a, b) => b.score - a.score);
          setMarket(scored[0]?.m ?? data.markets[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const accent = "#a78bfa";
  const prob   = market ? Math.round(market.yes_price * 100) : 0;
  const probColor = prob >= 65 ? "#00ff88" : prob <= 35 ? "#ef4444" : "#f59e0b";

  return (
    <Card accent={accent} className="relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accent}08, transparent 70%)` }} />
      <div className="relative z-10 flex-1">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.25em", color: accent + "99" }}>Polymarket</p>
            <h2 style={{ color: "#e8e8e8", fontWeight: 700, fontSize: "1rem", marginTop: "2px" }}>Top opportunité</h2>
          </div>
          <span style={{ fontSize: "1.4rem" }}>📊</span>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 bg-gray-800 rounded w-3/4" />
            <div className="h-3 bg-gray-800 rounded w-1/2" />
            <div className="h-8 bg-gray-800 rounded mt-4" />
          </div>
        ) : market ? (
          <div>
            <p style={{ color: "#e0e0e0", fontWeight: 600, fontSize: "0.92rem", lineHeight: 1.4, marginBottom: "1.2rem" }}>
              {market.question}
            </p>

            {/* Probability bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ color: "#666", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Probabilité OUI</span>
                <span style={{ color: probColor, fontWeight: 900, fontSize: "1.2rem" }}>{prob}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
                <div style={{ width: `${prob}%`, height: "100%", background: `linear-gradient(to right, ${probColor}88, ${probColor})`, borderRadius: "9999px", transition: "width 0.5s ease" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span style={{ color: "#00ff88", fontSize: "10px", fontWeight: 700 }}>OUI {fmtPrice(market.yes_price)}</span>
                <span style={{ color: "#ef4444", fontSize: "10px", fontWeight: 700 }}>NON {fmtPrice(market.no_price)}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <p style={{ color: "#444", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Volume 24h</p>
                <p style={{ color: "#e0e0e0", fontWeight: 700, fontSize: "0.85rem" }}>{fmtLarge(market.volume24h)}</p>
              </div>
              <div>
                <p style={{ color: "#444", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Liquidité</p>
                <p style={{ color: "#e0e0e0", fontWeight: 700, fontSize: "0.85rem" }}>{fmtLarge(market.liquidity)}</p>
              </div>
              {market.end_date && (
                <div>
                  <p style={{ color: "#444", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Clôture</p>
                  <p style={{ color: "#e0e0e0", fontWeight: 700, fontSize: "0.85rem" }}>{new Date(market.end_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p style={{ color: "#444" }}>Aucune donnée disponible</p>
        )}
      </div>

      <Link href="/markets" style={{ marginTop: "auto", paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #1a1a1a" }}>
        <span style={{ color: "#444", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.12em" }}>Radar complet</span>
        <span style={{ color: "#555", fontSize: "12px" }}>→</span>
      </Link>
    </Card>
  );
}

// ── CARD 3: Top Crypto ─────────────────────────────────────────────────────────
function TopCryptoCard() {
  const [coins,   setCoins]   = useState<CoinMarket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crypto/markets")
      .then(r => r.json())
      .then((d: unknown) => {
        if (Array.isArray(d)) setCoins(d as CoinMarket[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Best opportunity: coins closest to ATH with strong 24h momentum
  const topCoin = useMemo(() => {
    if (!coins.length) return null;
    return [...coins]
      .filter(c => c.price_change_percentage_24h_in_currency != null)
      .sort((a, b) => {
        const scoreA = (a.price_change_percentage_24h_in_currency ?? 0) - (a.ath_change_percentage ?? 0) * 0.1;
        const scoreB = (b.price_change_percentage_24h_in_currency ?? 0) - (b.ath_change_percentage ?? 0) * 0.1;
        return scoreB - scoreA;
      })[0] ?? null;
  }, [coins]);

  const accent  = "#00ff88";
  const chg24h  = topCoin?.price_change_percentage_24h_in_currency ?? null;
  const athDist = topCoin?.ath_change_percentage ?? null;

  return (
    <Card accent={accent} className="relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accent}08, transparent 70%)` }} />
      <div className="relative z-10 flex-1">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.25em", color: accent + "99" }}>Crypto</p>
            <h2 style={{ color: "#e8e8e8", fontWeight: 700, fontSize: "1rem", marginTop: "2px" }}>Meilleure opportunité</h2>
          </div>
          <span style={{ fontSize: "1.4rem" }}>₿</span>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-800 rounded-full" />
              <div className="flex-1"><div className="h-4 bg-gray-800 rounded w-1/2 mb-1" /><div className="h-3 bg-gray-800 rounded w-1/4" /></div>
            </div>
            <div className="h-6 bg-gray-800 rounded mt-3 w-2/3" />
          </div>
        ) : topCoin ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <img src={topCoin.image} alt={topCoin.name} className="w-10 h-10 rounded-full" />
              <div>
                <p style={{ color: "#e8e8e8", fontWeight: 700, fontSize: "1rem" }}>{topCoin.name}</p>
                <p style={{ color: "#555", fontSize: "11px", textTransform: "uppercase" }}>{topCoin.symbol} · #{topCoin.market_cap_rank}</p>
              </div>
              <div className="ml-auto text-right">
                <p style={{ color: "#e0e0e0", fontWeight: 900, fontSize: "1.1rem" }}>{fmtPrice(topCoin.current_price)}</p>
                <p style={{ color: pctColor(chg24h), fontWeight: 700, fontSize: "0.82rem" }}>{fmtPct(chg24h)} 24h</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* 24h performance bar */}
              <div>
                <div className="flex justify-between mb-1">
                  <span style={{ color: "#555", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Performance 24h</span>
                  <span style={{ color: pctColor(chg24h), fontSize: "11px", fontWeight: 700 }}>{fmtPct(chg24h)}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
                  <div style={{
                    width: `${Math.min(Math.abs(chg24h ?? 0) * 5, 100)}%`,
                    height: "100%",
                    background: chg24h != null && chg24h >= 0 ? "#00ff88" : "#ef4444",
                    borderRadius: "9999px",
                  }} />
                </div>
              </div>

              {/* ATH distance */}
              <div>
                <div className="flex justify-between mb-1">
                  <span style={{ color: "#555", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Distance ATH</span>
                  <span style={{ color: "#f59e0b", fontSize: "11px", fontWeight: 700 }}>{fmtPct(athDist)}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
                  <div style={{
                    width: `${Math.max(0, 100 - Math.abs(athDist ?? 100))}%`,
                    height: "100%",
                    background: "linear-gradient(to right, #f59e0b88, #f59e0b)",
                    borderRadius: "9999px",
                  }} />
                </div>
              </div>
            </div>

            {/* Mini ranking */}
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#1a1a1a" }}>
              <p style={{ color: "#333", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.5rem" }}>Top 5 performers 24h</p>
              {[...coins]
                .sort((a, b) => (b.price_change_percentage_24h_in_currency ?? 0) - (a.price_change_percentage_24h_in_currency ?? 0))
                .slice(0, 4)
                .map(c => (
                  <div key={c.id} className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-1.5">
                      <img src={c.image} alt={c.name} className="w-4 h-4 rounded-full" />
                      <span style={{ color: "#777", fontSize: "11px" }}>{c.symbol.toUpperCase()}</span>
                    </div>
                    <span style={{ color: "#00ff88", fontSize: "11px", fontWeight: 700 }}>+{(c.price_change_percentage_24h_in_currency ?? 0).toFixed(2)}%</span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <p style={{ color: "#444" }}>Aucune donnée disponible</p>
        )}
      </div>

      <Link href="/crypto" style={{ marginTop: "auto", paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #1a1a1a" }}>
        <span style={{ color: "#444", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.12em" }}>Marché crypto complet</span>
        <span style={{ color: "#555", fontSize: "12px" }}>→</span>
      </Link>
    </Card>
  );
}

// ── CARD 4: Bot Performance ────────────────────────────────────────────────────
function BotPerformanceCard() {
  const { state, toggle } = useBotContext();
  const accent = "#fb923c";

  const trades    = state.openTrades ?? [];
  const logs      = state.logs       ?? [];
  const signals   = (state.lastSignals ?? []) as import("@/lib/bot").CombinedSignal[];

  // Paper trading P&L from trades
  const totalTrades = trades.length;
  const winCount    = trades.filter(t => t.entryPrice && t.currentPrice && t.currentPrice > t.entryPrice).length;
  const winRate     = totalTrades > 0 ? Math.round((winCount / totalTrades) * 100) : null;

  // P&L simulation: each trade 1 unit at entry price
  const paperPL = trades.reduce((s, t) => {
    if (!t.entryPrice || !t.currentPrice) return s;
    const pct = (t.currentPrice - t.entryPrice) / t.entryPrice;
    return s + pct * 100;
  }, 0);

  const recentLogs = logs.slice(0, 5);

  return (
    <Card accent={accent} className="relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accent}08, transparent 70%)` }} />
      <div className="relative z-10 flex-1">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.25em", color: accent + "99" }}>Bot Engine</p>
            <h2 style={{ color: "#e8e8e8", fontWeight: 700, fontSize: "1rem", marginTop: "2px" }}>Performance</h2>
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: state.isActive ? "#00ff8815" : "#ffffff08",
              border: `1px solid ${state.isActive ? "#00ff8830" : "#333"}`,
              color: state.isActive ? "#00ff88" : "#666",
              fontSize: "11px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em",
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${state.isActive ? "animate-pulse" : ""}`} style={{ background: state.isActive ? "#00ff88" : "#444" }} />
            {state.isActive ? "Actif" : "Pause"}
          </button>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Cycles",    value: (state.cycleCount ?? 0).toString(),  color: accent },
            { label: "Win rate",  value: winRate != null ? `${winRate}%` : "—", color: "#00ff88" },
            { label: "P&L sim.", value: totalTrades > 0 ? `${paperPL >= 0 ? "+" : ""}${paperPL.toFixed(1)}%` : "—", color: paperPL >= 0 ? "#00ff88" : "#ef4444" },
          ].map(m => (
            <div key={m.label} className="rounded-xl p-3 text-center" style={{ background: "#141414", border: "1px solid #1e1e1e" }}>
              <p style={{ color: m.color, fontWeight: 900, fontSize: "1.1rem", lineHeight: 1 }}>{m.value}</p>
              <p style={{ color: "#444", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "3px" }}>{m.label}</p>
            </div>
          ))}
        </div>

        {/* Layer weights */}
        {state.weights && (
          <div className="mb-4">
            <p style={{ color: "#333", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.6rem" }}>Poids des couches</p>
            {Object.entries(state.weights).map(([layer, w]) => {
              const colors: Record<string, string> = { smart_money: "#a78bfa", sentiment: "#38bdf8", arbitrage: "#00ff88", ml_pattern: "#fb923c" };
              const labels: Record<string, string> = { smart_money: "Smart Money", sentiment: "Sentiment", arbitrage: "Arbitrage", ml_pattern: "Auto-ML" };
              const color = colors[layer] ?? "#666";
              const weight = (w as import("@/lib/bot").SignalWeight).weight * 100;
              return (
                <div key={layer} className="flex items-center gap-2 mb-1.5">
                  <span style={{ color: "#555", fontSize: "10px", width: 70 }}>{labels[layer]}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
                    <div style={{ width: `${weight}%`, height: "100%", background: color, borderRadius: "9999px" }} />
                  </div>
                  <span style={{ color, fontSize: "10px", fontWeight: 700, width: 30, textAlign: "right" }}>{weight.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Recent logs */}
        {recentLogs.length > 0 && (
          <div>
            <p style={{ color: "#333", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.5rem" }}>Derniers logs</p>
            <div className="space-y-0.5">
              {recentLogs.map(log => (
                <p key={log.id} style={{
                  fontSize: "10px",
                  color: log.level === "warn" ? "#f59e0b88" : log.level === "layer" ? "#38bdf888" : "#444",
                  lineHeight: 1.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {log.msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Signal count */}
        {signals.length > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: "#1a1a1a" }}>
            <span style={{ color: "#444", fontSize: "10px" }}>Signaux actifs</span>
            <span style={{ color: accent, fontWeight: 700, fontSize: "0.9rem" }}>{signals.length}</span>
          </div>
        )}
      </div>

      <Link href="/bot" style={{ marginTop: "auto", paddingTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #1a1a1a" }}>
        <span style={{ color: "#444", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.12em" }}>Configurer le bot</span>
        <span style={{ color: "#555", fontSize: "12px" }}>→</span>
      </Link>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const { state } = useBotContext();
  const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen" style={{ background: "#080808" }}>
      {/* Top bar */}
      <div style={{ background: "#0a0a0a", borderBottom: "1px solid #ffffff08", padding: "1rem 1.5rem" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 style={{ color: "#e8e8e8", fontWeight: 700, fontSize: "1.25rem", letterSpacing: "-0.02em" }}>Dashboard</h1>
            <p style={{ color: "#444", fontSize: "11px", marginTop: "2px" }}>Vue globale · {now}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "#00ff8810", border: "1px solid #00ff8820" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              <span style={{ color: "#00ff88", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Live</span>
            </div>
            <span style={{ color: "#333", fontSize: "11px" }}>
              Bot : <span style={{ color: state.isActive ? "#00ff88" : "#555" }}>{state.isActive ? "Actif" : "Pause"}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <BestSignalCard />
          <TopPolyCard />
          <TopCryptoCard />
          <BotPerformanceCard />
        </div>

        {/* Quick nav */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/signals", label: "Tous les signaux", icon: "⚡", color: "#00ff88" },
            { href: "/markets", label: "Radar Polymarket", icon: "📊", color: "#a78bfa" },
            { href: "/crypto",  label: "Marchés Crypto",   icon: "₿",  color: "#38bdf8" },
            { href: "/bot",     label: "Bot Config",       icon: "🤖", color: "#fb923c" },
          ].map(link => (
            <Link key={link.href} href={link.href}>
              <div
                className="rounded-xl p-4 border text-center transition-all hover:scale-[1.02]"
                style={{ background: "#0d0d0d", borderColor: link.color + "20", boxShadow: `0 0 20px ${link.color}06`, cursor: "pointer" }}
              >
                <span style={{ fontSize: "1.5rem" }}>{link.icon}</span>
                <p style={{ color: "#888", fontSize: "11px", marginTop: "6px", fontWeight: 500 }}>{link.label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
