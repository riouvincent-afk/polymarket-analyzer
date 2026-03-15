"use client";

import { useState } from "react";
import {
  Trade, BotLog, SignalType, SignalWeight,
  tradePnl, tradePnlPct, computeStats,
} from "@/lib/bot";
import { useBotContext } from "@/lib/BotContext";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  if (n >= 1)     return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "jamais";
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)  return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}min`;
  return `${Math.floor(sec / 3600)}h`;
}

const SIGNAL_LABELS: Record<SignalType, string> = {
  smart_money: "Smart Money",
  sentiment:   "Sentiment",
  arbitrage:   "Arbitrage",
  technical:   "Technical",
};

const LAYER_COLORS: Record<number, { bg: string; border: string; text: string; badge: string }> = {
  1: { bg: "bg-purple-500/10",  border: "border-purple-500/25", text: "text-purple-300", badge: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  2: { bg: "bg-blue-500/10",    border: "border-blue-500/25",   text: "text-blue-300",   badge: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  3: { bg: "bg-orange-500/10",  border: "border-orange-500/25", text: "text-orange-300", badge: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  4: { bg: "bg-teal-500/10",    border: "border-teal-500/25",   text: "text-teal-300",   badge: "bg-teal-500/20 text-teal-300 border-teal-500/30" },
};

// ── Atoms ─────────────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${active ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />;
}

function SentimentBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "bg-red-500" : score <= 30 ? "bg-emerald-500" : "bg-yellow-500";
  const tag   = score >= 70 ? "Euphorie" : score <= 30 ? "Panique" : "Neutre";
  const tagColor = score >= 70 ? "text-red-400" : score <= 30 ? "text-emerald-400" : "text-yellow-400";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-gray-400 w-8">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-6 text-right">{score}</span>
      <span className={`text-[10px] font-semibold w-14 ${tagColor}`}>{tag}</span>
    </div>
  );
}

function WeightBar({ type, w }: { type: SignalType; w: SignalWeight }) {
  const pct  = ((w.weight - 0.3) / 1.7) * 100; // normalize 0.3–2.0 → 0–100%
  const color = w.weight >= 1.5 ? "bg-emerald-500" : w.weight <= 0.6 ? "bg-red-500" : "bg-blue-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-20 shrink-0">{SIGNAL_LABELS[type]}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-white w-8 text-right">×{w.weight.toFixed(2)}</span>
      <span className="text-[10px] text-gray-600 w-20 text-right">
        {w.total > 0 ? `${(w.winRate * 100).toFixed(0)}% (${w.wins}/${w.total})` : "—"}
      </span>
    </div>
  );
}

// ── Layer card ────────────────────────────────────────────────────────────────
function LayerCard({
  layer, title, subtitle, lastTs, children,
}: {
  layer: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  lastTs?: number | null;
  children: React.ReactNode;
}) {
  const c = LAYER_COLORS[layer];
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>L{layer}</span>
            <p className={`text-xs font-bold ${c.text}`}>{title}</p>
          </div>
          <p className="text-[10px] text-gray-600 mt-0.5">{subtitle}</p>
        </div>
        {lastTs !== undefined && (
          <span className="text-[10px] text-gray-600 shrink-0">{timeAgo(lastTs)}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Trade row ─────────────────────────────────────────────────────────────────
function TradeRow({ trade }: { trade: Trade }) {
  const pnl    = tradePnl(trade);
  const pnlPct = tradePnlPct(trade);
  const pos    = pnl >= 0;
  const c      = LAYER_COLORS[trade.layer];

  return (
    <div className="py-3 border-b border-gray-800/60 last:border-0">
      <div className="flex items-center gap-3">
        {/* Layer + coin */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${c.badge}`}>L{trade.layer}</span>
            <span className="text-sm font-bold text-white">{trade.coinSymbol}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              trade.side === "LONG"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                : "bg-red-500/15 text-red-400 border-red-500/25"
            }`}>{trade.side}</span>
            <span className="text-[10px] text-gray-500">{SIGNAL_LABELS[trade.signalType]}</span>
            <span className="text-[10px] text-gray-600">score:{trade.signalScore.toFixed(0)}</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{trade.coinName}</p>
        </div>

        {/* Price */}
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-400">
            {fmtUsd(trade.entryPrice)}
            <span className="text-gray-600 mx-1">→</span>
            <span className="font-semibold text-white">{fmtUsd(trade.currentPrice)}</span>
          </p>
        </div>

        {/* P&L */}
        <div className={`text-right shrink-0 w-20 ${pos ? "text-emerald-400" : "text-red-400"}`}>
          <p className="text-xs font-bold">{pos ? "+" : ""}{pnl.toFixed(2)} €</p>
          <p className="text-[10px]">{pos ? "+" : ""}{pnlPct.toFixed(1)}%</p>
        </div>

        <div className="shrink-0 text-[10px] text-gray-500">{trade.stake.toFixed(2)} €</div>
      </div>

      {/* TP / trailing stop */}
      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
        <span>TP {fmtUsd(trade.takeProfitPrice)} (+{trade.takeProfitPct}%)</span>
        <span className="text-gray-700">·</span>
        <span>SL trail {fmtUsd(trade.trailingStopPrice)} (-{trade.trailingStopPct}%)</span>
      </div>
    </div>
  );
}

function ClosedRow({ trade }: { trade: Trade }) {
  const pnl    = trade.pnl ?? 0;
  const pnlPct = (pnl / trade.stake) * 100;
  const pos    = pnl >= 0;
  const c      = LAYER_COLORS[trade.layer];
  const statusLabel = trade.status === "closed_profit" ? "PROFIT" : "PERTE";
  const statusColor = trade.status === "closed_profit"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25"
    : "bg-red-500/15 text-red-300 border-red-500/25";

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-800/60 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${c.badge}`}>L{trade.layer}</span>
          <span className="text-xs font-bold text-white">{trade.coinSymbol}</span>
          <span className={`text-[10px] font-bold ${trade.side === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{trade.side}</span>
          <span className="text-[10px] text-gray-500">{SIGNAL_LABELS[trade.signalType]}</span>
        </div>
        <p className="text-[10px] text-gray-600 mt-0.5">{fmtUsd(trade.entryPrice)} → {fmtUsd(trade.exitPrice ?? trade.currentPrice)}</p>
      </div>
      <div className={`text-right shrink-0 w-16 ${pos ? "text-emerald-400" : "text-red-400"}`}>
        <p className="text-xs font-bold">{pos ? "+" : ""}{pnl.toFixed(2)} €</p>
        <p className="text-[10px]">{pos ? "+" : ""}{pnlPct.toFixed(1)}%</p>
      </div>
      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>{statusLabel}</span>
    </div>
  );
}

// ── Log line ──────────────────────────────────────────────────────────────────
function LogLine({ log }: { log: BotLog }) {
  const color: Record<BotLog["level"], string> = {
    info:  "text-gray-400",
    buy:   "text-emerald-400",
    sell:  "text-blue-400",
    warn:  "text-orange-400",
    layer: "text-purple-400",
  };
  const time = new Date(log.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div className="flex items-start gap-2 py-1 border-b border-gray-800/40 last:border-0 text-xs font-mono">
      <span className="text-gray-600 shrink-0">{time}</span>
      <span className={`${color[log.level]} break-all`}>{log.msg}</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BotPage() {
  const { state, toggle, reset } = useBotContext();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const stats = computeStats(state);
  const pnlPos = stats.totalPnl >= 0;

  const coinIdToSymbol: Record<string, string> = {
    bitcoin: "BTC", ethereum: "ETH", solana: "SOL", ripple: "XRP",
    binancecoin: "BNB", dogecoin: "DOGE", cardano: "ADA",
    "avalanche-2": "AVAX", chainlink: "LINK", polkadot: "DOT",
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Bot Trading</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              4 couches · Paper trading crypto · Auto-apprentissage · Tourne en arrière-plan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors">Reset</button>
            <button
              onClick={toggle}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                state.isActive
                  ? "bg-red-500/15 hover:bg-red-500/25 border-red-500/30 text-red-300"
                  : "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300"
              }`}
            >
              <StatusDot active={state.isActive} />
              {state.isActive ? "Désactiver le Bot" : "Activer le Bot"}
            </button>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="col-span-2 sm:col-span-1 bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Capital</p>
            <p className="text-2xl font-extrabold text-white">{state.capital.toFixed(2)} €</p>
            <div className="mt-2">
              <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (state.capital / state.config.initialCapital) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>Investi {stats.lockedCapital.toFixed(2)} €</span>
                <span>Libre {stats.freeCapital.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">P&L Total</p>
            <p className={`text-2xl font-extrabold ${pnlPos ? "text-emerald-400" : "text-red-400"}`}>
              {pnlPos ? "+" : ""}{stats.totalPnl.toFixed(2)} €
            </p>
            <p className={`text-xs mt-1 ${pnlPos ? "text-emerald-600" : "text-red-600"}`}>
              {pnlPos ? "+" : ""}{((stats.totalPnl / state.config.initialCapital) * 100).toFixed(1)}%
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Win Rate</p>
            <p className="text-2xl font-extrabold text-white">{stats.winRate}%</p>
            <p className="text-xs text-gray-600 mt-1">{stats.wins}W / {stats.losses}L · {stats.totalTrades} trades</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Statut</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusDot active={state.isActive} />
              <p className="text-sm font-bold text-white">{state.isActive ? "Actif" : "En pause"}</p>
            </div>
            <p className="text-xs text-gray-600 mt-1.5">
              {state.openTrades.length}/{state.config.maxOpenTrades} positions · cycle #{state.cycleCount}
            </p>
          </div>
        </div>

        {/* ── 4-Layer status panel ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

          {/* L1 Smart Money */}
          <LayerCard layer={1} title="Smart Money" subtitle="Mises whales sur Polymarket crypto" lastTs={state.l1Activity.ts}>
            {state.l1Activity.ts ? (
              <p className="text-[10px] text-gray-400 leading-relaxed">{state.l1Activity.msg}</p>
            ) : (
              <p className="text-[10px] text-gray-600">
                Surveillance active · détecte les mises {state.config.smartMoneyMultiple}× la moyenne
              </p>
            )}
            <div className="text-[10px] text-gray-600">
              Marchés crypto Poly: {state.polyHistory.length > 0 ? state.polyHistory[state.polyHistory.length - 1].points.length : 0} · Historique: {state.polyHistory.length}/30
            </div>
          </LayerCard>

          {/* L2 Sentiment */}
          <LayerCard layer={2} title="Sentiment vs Prix" subtitle="CryptoPanic — contrarian signal">
            {state.lastSentiment?.available ? (
              <div className="space-y-1.5">
                {Object.entries(state.l2Coins)
                  .filter(([id]) => ["bitcoin", "ethereum", "solana", "ripple"].includes(id))
                  .map(([id, score]) => (
                    <SentimentBar key={id} score={score} label={coinIdToSymbol[id] ?? id.slice(0, 3).toUpperCase()} />
                  ))
                }
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[10px] text-orange-400">API non configurée</p>
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  Ajoutez <code className="text-gray-400">CRYPTOPANIC_KEY=xxx</code> dans <code className="text-gray-400">.env.local</code> (gratuit sur cryptopanic.com)
                </p>
              </div>
            )}
          </LayerCard>

          {/* L3 Arbitrage */}
          <LayerCard layer={3} title="Arbitrage Temporel" subtitle="Gap Polymarket → crypto" lastTs={state.l3Activity.ts}>
            {state.l3Activity.ts ? (
              <p className="text-[10px] text-gray-400 leading-relaxed">{state.l3Activity.msg}</p>
            ) : (
              <p className="text-[10px] text-gray-600">
                Détecte quand Poly bouge ≥ {state.config.arbitrageGapPP}pp mais la crypto ne suit pas après {state.config.arbitrageMinMinutes}min
              </p>
            )}
            <div className="text-[10px] text-gray-600">
              Fenêtre: {state.config.arbitrageMinMinutes}min · Seuil: {state.config.arbitrageGapPP}pp
            </div>
          </LayerCard>

          {/* L4 Auto-apprentissage */}
          <LayerCard layer={4} title="Auto-apprentissage" subtitle="Poids ajustés par win rate">
            <div className="space-y-2">
              {(Object.entries(state.weights) as [SignalType, SignalWeight][]).map(([type, w]) => (
                <WeightBar key={type} type={type} w={w} />
              ))}
            </div>
            <p className="text-[10px] text-gray-700 mt-1">Poids: 0.3 (perdant) → 2.0 (gagnant)</p>
          </LayerCard>
        </div>

        {/* ── Main 2-col ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Positions panel */}
          <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setTab("open")}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${tab === "open" ? "text-white border-b-2 border-emerald-500" : "text-gray-500 hover:text-gray-300"}`}
              >
                Positions ouvertes ({state.openTrades.length})
              </button>
              <button
                onClick={() => setTab("closed")}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${tab === "closed" ? "text-white border-b-2 border-emerald-500" : "text-gray-500 hover:text-gray-300"}`}
              >
                Historique ({state.closedTrades.length})
              </button>
            </div>
            <div className="px-4 py-1 max-h-[30rem] overflow-y-auto">
              {tab === "open" && (
                state.openTrades.length === 0
                  ? <p className="text-sm text-gray-600 text-center py-10">Aucune position ouverte</p>
                  : state.openTrades.map((t) => <TradeRow key={t.id} trade={t} />)
              )}
              {tab === "closed" && (
                state.closedTrades.length === 0
                  ? <p className="text-sm text-gray-600 text-center py-10">Aucun trade clôturé</p>
                  : state.closedTrades.map((t) => <ClosedRow key={t.id} trade={t} />)
              )}
            </div>
          </div>

          {/* Log panel */}
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Journal temps réel</span>
              <div className="flex items-center gap-3">
                {[
                  { level: "layer", color: "bg-purple-400", label: "Couche" },
                  { level: "buy",   color: "bg-emerald-400", label: "Achat" },
                  { level: "sell",  color: "bg-blue-400",    label: "Vente" },
                ].map((l) => (
                  <span key={l.level} className="flex items-center gap-1 text-[10px] text-gray-600">
                    <span className={`w-1.5 h-1.5 rounded-full ${l.color}`} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-4 py-2 max-h-[30rem] overflow-y-auto">
              {state.logs.length === 0
                ? <p className="text-xs text-gray-600 text-center py-10">Activez le bot pour démarrer</p>
                : state.logs.map((l) => <LogLine key={l.id} log={l} />)
              }
            </div>
          </div>
        </div>

        {/* ── P&L chart ── */}
        {state.closedTrades.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-white">Évolution du capital</p>
              <div className="flex items-center gap-4">
                {([1, 2, 3, 4] as const).map((l) => (
                  <span key={l} className={`flex items-center gap-1.5 text-[10px] ${LAYER_COLORS[l].text}`}>
                    <span className={`w-2 h-2 rounded-sm ${LAYER_COLORS[l].bg} border ${LAYER_COLORS[l].border}`} />
                    L{l}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-0.5 h-14">
              {(() => {
                let cap = state.config.initialCapital;
                const pts: Array<{ v: number; layer: number }> = [{ v: cap, layer: 0 }];
                [...state.closedTrades].reverse().forEach((t) => {
                  cap += t.pnl ?? 0;
                  pts.push({ v: cap, layer: t.layer });
                });
                const vals = pts.map((p) => p.v);
                const min  = Math.min(...vals);
                const max  = Math.max(...vals);
                const rng  = max - min || 1;
                return pts.map((p, i) => {
                  const h   = Math.max(4, ((p.v - min) / rng) * 56);
                  const pos = p.v >= state.config.initialCapital;
                  const lc  = LAYER_COLORS[p.layer];
                  const barClass = pos ? (lc ? lc.text.replace("text-", "bg-").replace("-300", "-500/60") : "bg-emerald-500/60") : "bg-red-500/60";
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm ${barClass}`}
                      style={{ height: `${h}px` }}
                      title={`${p.v.toFixed(2)} €`}
                    />
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── Config strip ── */}
        <div className="flex flex-wrap gap-2 text-[10px]">
          {[
            ["Capital", `${state.config.initialCapital} €`],
            ["Mise", `${state.config.minBetPct}–${state.config.maxBetPct}%`],
            ["Max trades", `${state.config.maxOpenTrades}`],
            ["Score min", `${state.config.minWeightedScore}`],
            ["Smart Money", `×${state.config.smartMoneyMultiple}`],
            ["Euphorie", `>${state.config.sentimentEuphoria}%`],
            ["Panique", `<${state.config.sentimentPanic}%`],
            ["Arb gap", `${state.config.arbitrageGapPP}pp`],
            ["Arb window", `${state.config.arbitrageMinMinutes}min`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 border border-gray-800 rounded-lg">
              <span className="text-gray-500 uppercase tracking-wider">{label}</span>
              <span className="font-bold text-white">{value}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="font-semibold text-orange-400">PAPER · Sans stop loss capital</span>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-700">
          Paper trading — aucune exécution réelle · L1 Smart Money · L2 Sentiment CryptoPanic · L3 Arbitrage temporel · L4 Technique · Auto-apprentissage des poids
        </p>
      </div>
    </div>
  );
}
