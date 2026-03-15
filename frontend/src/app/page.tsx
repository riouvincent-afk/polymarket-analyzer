"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useBotContext } from "@/lib/BotContext";

// ── Particle Canvas ────────────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;
    const NEON = "#00ff88";
    const N    = 70;
    function resize() { canvas!.width = canvas!.offsetWidth; canvas!.height = canvas!.offsetHeight; }
    resize();
    window.addEventListener("resize", resize);
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * canvas!.width, y: Math.random() * canvas!.height,
      vx: (Math.random() - 0.5) * 0.4,  vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
    }));
    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas!.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas!.height) p.vy *= -1;
      });
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.strokeStyle = NEON;
            ctx.globalAlpha = (1 - dist / 140) * 0.15;
            ctx.lineWidth = 0.6;
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      pts.forEach(p => {
        ctx.beginPath();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = NEON;
        ctx.shadowBlur = 8;
        ctx.shadowColor = NEON;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ── Typewriter ─────────────────────────────────────────────────────────────────
function useTypewriter(text: string, speed = 90, delay = 300) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    const t = setTimeout(() => {
      const id = setInterval(() => {
        if (i < text.length) setShown(text.slice(0, ++i));
        else clearInterval(id);
      }, speed);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(t);
  }, [text, speed, delay]);
  return shown;
}

// ── Counter ────────────────────────────────────────────────────────────────────
function useCounter(target: number, duration = 1800, active = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    let raf: number;
    const step = (t: number) => {
      const pct  = Math.min((t - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - pct, 3);
      setVal(Math.round(ease * target));
      if (pct < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return val;
}

// ── Intersection ───────────────────────────────────────────────────────────────
function useVisible(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ── Scrolling Ticker ───────────────────────────────────────────────────────────
interface TickerItem { label: string; value: string; up?: boolean; }

function ScrollTicker({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items]; // seamless loop
  return (
    <div className="w-full overflow-hidden border-t border-b py-2" style={{ borderColor: "#00ff8815", background: "#050505" }}>
      <div
        className="flex gap-10 whitespace-nowrap"
        style={{ animation: "ticker-scroll 28s linear infinite" }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-2 text-xs shrink-0">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: item.up === false ? "#ef4444" : "#00ff88" }} />
            <span style={{ color: "#808080" }}>{item.label}</span>
            <span style={{ color: item.up === false ? "#ef4444" : "#00ff88", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {item.value}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HERO
// ══════════════════════════════════════════════════════════════════════════════
interface CryptoTicker { symbol: string; price: number; chg: number; }

function HeroSection() {
  const logo   = useTypewriter("Moneyprinter", 90, 300);
  const [hov,  setHov]    = useState(false);
  const [tickers, setTickers] = useState<CryptoTicker[]>([]);
  const { state } = useBotContext();
  const signals = (state.lastSignals ?? []) as import("@/lib/bot").CombinedSignal[];

  useEffect(() => {
    fetch("/api/crypto/markets")
      .then(r => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) return;
        setTickers((d as { symbol: string; current_price: number; price_change_percentage_24h_in_currency: number | null }[])
          .slice(0, 8)
          .map(c => ({ symbol: c.symbol.toUpperCase(), price: c.current_price, chg: c.price_change_percentage_24h_in_currency ?? 0 })));
      }).catch(() => {});
  }, []);

  const tickerItems: TickerItem[] = [
    ...tickers.map(t => ({
      label: t.symbol,
      value: t.price >= 1000 ? `$${t.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${t.price.toFixed(2)}`,
      up: t.chg >= 0,
    })),
    ...signals.slice(0, 4).map(s => ({
      label: `${s.coinSymbol} Signal`,
      value: s.direction === "LONG" ? "▲ LONG" : "▼ SHORT",
      up: s.direction === "LONG",
    })),
  ];

  const ready = logo.length >= 12;

  return (
    <section className="relative overflow-hidden flex flex-col" style={{ minHeight: "calc(100vh - 56px)", background: "#0a0a0a" }}>
      <ParticleCanvas />
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 65% 55% at 50% 45%, #00ff8809 0%, transparent 70%)" }} />

      {/* Main content — flex-1 to fill space above ticker */}
      <div className="relative z-10 flex-1 flex items-center justify-center text-center px-4">
        <div className="select-none">
          {/* Logo */}
          <h1 className="font-black tracking-tighter text-white" style={{ fontSize: "clamp(3rem, 10vw, 7rem)", letterSpacing: "-0.03em", textShadow: "0 0 60px #00ff8818" }}>
            {logo}<span className="neon-text" style={{ opacity: ready ? 1 : 0 }}>_</span>
          </h1>

          {/* Subtitle */}
          <p
            className="mt-6 font-light breathe"
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.3rem)",
              letterSpacing: "0.05em",
              color: "#c0c0c0",
              opacity: ready ? 1 : 0,
              transition: "opacity 0.9s ease",
            }}
          >
            L&apos;argent ne dort jamais.{" "}
            <span className="neon-text font-semibold">Ton bot non plus.</span>
          </p>

          {/* CTA */}
          <div style={{ opacity: ready ? 1 : 0, transition: "opacity 1.1s ease 0.3s" }} className="mt-12">
            <Link
              href="/dashboard"
              onMouseEnter={() => setHov(true)}
              onMouseLeave={() => setHov(false)}
              style={{
                display: "inline-block",
                padding: "14px 56px",
                borderRadius: 8,
                border: "1px solid #00ff88",
                color: hov ? "#0a0a0a" : "#00ff88",
                background: hov ? "#00ff88" : "transparent",
                fontWeight: 700,
                fontSize: "0.95rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                transition: "all 0.22s ease",
                boxShadow: hov ? "0 0 40px #00ff88bb, 0 0 90px #00ff8822" : "0 0 14px #00ff8833",
              }}
            >
              Entrer
            </Link>
          </div>

          {/* Scroll hint */}
          <div
            className="mt-16 flex flex-col items-center gap-1"
            style={{ opacity: ready ? 0.35 : 0, transition: "opacity 1.5s ease 0.8s" }}
          >
            <span style={{ fontSize: "9px", color: "#555", letterSpacing: "0.3em", textTransform: "uppercase" }}>Scroll</span>
            <div className="w-px h-7 bg-gradient-to-b from-gray-700 to-transparent" />
          </div>
        </div>
      </div>

      {/* Ticker — pinned at bottom of hero */}
      {tickerItems.length > 0 && (
        <div className="relative z-10" style={{ opacity: ready ? 1 : 0, transition: "opacity 1s ease 0.5s" }}>
          <ScrollTicker items={tickerItems} />
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MARKETS BREATHING
// ══════════════════════════════════════════════════════════════════════════════
function MarketsSection() {
  const { ref, visible } = useVisible(0.2);
  const [cryptos,  setCryptos]  = useState<CryptoTicker[]>([]);
  const [polyVol,  setPolyVol]  = useState("—");
  const [polyMkts, setPolyMkts] = useState(0);

  useEffect(() => {
    const loadCrypto = () => fetch("/api/crypto/markets").then(r => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) return;
        setCryptos((d as { symbol: string; current_price: number; price_change_percentage_24h_in_currency: number | null }[])
          .slice(0, 3)
          .map(c => ({ symbol: c.symbol.toUpperCase(), price: c.current_price, chg: c.price_change_percentage_24h_in_currency ?? 0 })));
      }).catch(() => {});
    loadCrypto();
    const t1 = setInterval(loadCrypto, 30_000);

    const loadPoly = () => fetch("/api/markets?limit=20&order=volume24h&ascending=false&closed=false").then(r => r.json())
      .then((d: unknown) => {
        const data = d as { markets?: { volume24h?: number }[]; total?: number };
        if (!data.markets) return;
        const vol = data.markets.reduce((s: number, m: { volume24h?: number }) => s + (m.volume24h ?? 0), 0);
        setPolyVol(vol >= 1e6 ? `$${(vol / 1e6).toFixed(1)}M` : `$${(vol / 1e3).toFixed(0)}K`);
        setPolyMkts(data.total ?? data.markets.length);
      }).catch(() => {});
    loadPoly();
    const t2 = setInterval(loadPoly, 30_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const cols = [
    {
      icon: "📊", label: "Polymarket", tag: "PRÉDICTIONS", color: "#a78bfa",
      rows: [
        { label: "Marchés actifs", value: polyMkts > 0 ? polyMkts.toString() : "—" },
        { label: "Volume 24h",     value: polyVol },
        { label: "Settlement",     value: "USDC" },
      ],
    },
    {
      icon: "₿", label: "Crypto", tag: "SPOT LIVE", color: "#00ff88",
      rows: cryptos.map(c => ({
        label: c.symbol,
        value: c.price >= 1000 ? `$${c.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${c.price.toFixed(2)}`,
        chg: c.chg,
      })),
    },
    {
      icon: "🤖", label: "Bot Engine", tag: "ACTIF", color: "#fb923c",
      rows: [
        { label: "Couches",    value: "4" },
        { label: "Fréquence", value: "10s" },
        { label: "Moteur",    value: "ML + TA" },
      ],
    },
  ];

  return (
    <section ref={ref} className="py-24 px-4" style={{ background: "#0a0a0a" }}>
      <div className="max-w-5xl mx-auto">
        <p className="text-center text-[10px] uppercase tracking-[0.3em] mb-4" style={{ color: "#00ff8866" }}>
          Les marchés respirent
        </p>
        <h2 className="text-center font-bold text-white mb-16" style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.02em" }}>
          Tout se passe <span className="neon-text">maintenant</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cols.map((col, ci) => (
            <div key={col.label} className="breathe rounded-2xl p-6 border"
              style={{
                background: "#0f0f0f",
                borderColor: col.color + "25",
                boxShadow: `0 0 40px ${col.color}08`,
                animationDelay: `${ci * 0.7}s`,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(18px)",
                transition: `opacity 0.7s ease ${ci * 0.13}s, transform 0.7s ease ${ci * 0.13}s`,
              }}
            >
              <div className="flex items-center gap-2 mb-5">
                <span className="text-2xl">{col.icon}</span>
                <div>
                  <p className="text-white font-bold text-sm">{col.label}</p>
                  <p className="text-[9px] uppercase tracking-widest" style={{ color: col.color + "99" }}>{col.tag}</p>
                </div>
                <div className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: col.color }} />
              </div>
              <div className="space-y-3">
                {col.rows.map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span style={{ color: "#666", fontSize: "0.75rem" }}>{row.label}</span>
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#e0e0e0", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: "0.82rem" }}>{row.value}</span>
                      {"chg" in row && row.chg !== undefined && (
                        <span style={{ fontSize: "10px", fontWeight: 700, color: row.chg >= 0 ? "#00ff88" : "#ef4444" }}>
                          {row.chg >= 0 ? "+" : ""}{row.chg.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// THE SIGNAL
// ══════════════════════════════════════════════════════════════════════════════
function SignalSection() {
  const { ref, visible } = useVisible(0.3);
  const { state } = useBotContext();
  const signals = (state.lastSignals ?? []) as import("@/lib/bot").CombinedSignal[];
  const top     = signals[0];

  return (
    <section ref={ref} className="py-32 px-4 flex flex-col items-center justify-center text-center" style={{ background: "#050505", minHeight: "42vh" }}>
      <p style={{ fontSize: "9px", color: "#00ff8855", letterSpacing: "0.35em", textTransform: "uppercase", marginBottom: "2rem", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
        Signal du moment
      </p>

      {top ? (
        <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.8s ease 0.2s" }}>
          <p style={{ color: "#808080", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "1rem" }}>
            {top.coinSymbol} · {top.primaryType}
          </p>
          <p className="neon-text font-black" style={{ fontSize: "clamp(3rem, 9vw, 5.5rem)", letterSpacing: "-0.03em", lineHeight: 1 }}>
            {top.direction === "LONG" ? "▲ LONG" : "▼ SHORT"}
          </p>
          <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "1.2rem", maxWidth: "28rem", margin: "1.2rem auto 0" }}>{top.details}</p>
          <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "#555", textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Score {Math.round(top.weightedScore * 100)}/100 · {top.agreementCount} couche{top.agreementCount > 1 ? "s" : ""} en accord
          </p>
          <Link href="/dashboard" style={{ display: "inline-block", marginTop: "1.8rem", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "#00ff8888", padding: "10px 24px", border: "1px solid #00ff8825", borderRadius: 6, transition: "all 0.2s" }}>
            Voir tous les signaux →
          </Link>
        </div>
      ) : (
        <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.8s ease 0.2s" }}>
          <p className="font-black" style={{ fontSize: "clamp(2rem, 6vw, 4rem)", letterSpacing: "-0.03em", color: "#333" }}>
            Aucun signal actif
          </p>
          <p style={{ color: "#555", fontSize: "0.85rem", marginTop: "1rem" }}>
            Le premier signal apparaîtra dans les 10 secondes après activation du bot
          </p>
          <Link href="/bot" style={{ display: "inline-block", marginTop: "1.5rem", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.15em", color: "#00ff8899", padding: "10px 24px", border: "1px solid #00ff8822", borderRadius: 6 }}>
            Démarrer le bot →
          </Link>
        </div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// 4 LAYERS
// ══════════════════════════════════════════════════════════════════════════════
const LAYERS = [
  { icon: "🧠", title: "Smart Money",       sub: "L1", desc: "Détecte les flux institutionnels sur Polymarket. Quand les gros joueurs bougent, tu le sais en premier.", color: "#a78bfa" },
  { icon: "📡", title: "Sentiment",          sub: "L2", desc: "CryptoPanic, Reddit, Twitter. Le marché parle avant de bouger — le bot écoute 24h/24.",               color: "#38bdf8" },
  { icon: "⚡", title: "Arbitrage",          sub: "L3", desc: "Spreads entre exchanges, corrélations Polymarket/Crypto. La friction est ton profit.",               color: "#00ff88" },
  { icon: "🔄", title: "Auto-apprentissage", sub: "L4", desc: "Les poids s'ajustent à chaque cycle. Plus le bot tourne, plus il devient précis.",                   color: "#fb923c" },
];

function LayerCard({ layer, index }: { layer: typeof LAYERS[0]; index: number }) {
  const { ref, visible } = useVisible(0.2);
  return (
    <div ref={ref} className={visible ? "layer-card-visible" : "layer-card-hidden"} style={{ animationDelay: `${index * 0.13}s` }}>
      <div className="rounded-2xl p-6 border h-full" style={{
        background: "#0d0d0d",
        borderColor: visible ? layer.color + "35" : "#1a1a1a",
        boxShadow: visible ? `0 0 32px ${layer.color}18` : "none",
        transition: "border-color 0.5s ease, box-shadow 0.5s ease",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>{layer.icon}</div>
        <div className="flex items-baseline gap-2 mb-2">
          <p className="font-bold" style={{ color: "#e8e8e8", fontSize: "1.05rem" }}>{layer.title}</p>
          <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.12em", color: layer.color + "88" }}>{layer.sub}</span>
        </div>
        <p style={{ color: "#666", fontSize: "0.82rem", lineHeight: 1.6 }}>{layer.desc}</p>
        <div style={{ marginTop: "1.2rem", width: 32, height: 1.5, background: `linear-gradient(to right, ${layer.color}, transparent)` }} />
      </div>
    </div>
  );
}

function LayersSection() {
  const { ref, visible } = useVisible(0.1);
  return (
    <section className="py-24 px-4" style={{ background: "#0a0a0a" }}>
      <div className="max-w-5xl mx-auto">
        <p ref={ref} style={{ textAlign: "center", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.35em", color: "#00ff8855", marginBottom: "1rem", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
          Architecture
        </p>
        <h2 style={{ textAlign: "center", fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", fontSize: "clamp(1.6rem, 3vw, 2.2rem)", marginBottom: "4rem", opacity: visible ? 1 : 0, transition: "opacity 0.7s ease 0.1s" }}>
          4 couches, <span className="neon-text">1 cerveau</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {LAYERS.map((l, i) => <LayerCard key={l.title} layer={l} index={i} />)}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LIVE COUNTERS
// ══════════════════════════════════════════════════════════════════════════════
function CountersSection() {
  const { ref, visible } = useVisible(0.3);
  const { state } = useBotContext();

  const signalCount = useCounter(Math.max(state.lastSignals?.length ?? 0, 0), 1600, visible);
  const cycleCount  = useCounter(state.cycleCount ?? 0, 2000, visible);
  const winRate     = useCounter(state.isActive ? 68 : 0, 1500, visible);
  const markets     = useCounter(248, 1800, visible);

  const stats = [
    { value: signalCount, suffix: "",  label: "Signaux actifs",     color: "#00ff88" },
    { value: cycleCount,  suffix: "",  label: "Cycles complétés",   color: "#a78bfa" },
    { value: winRate,     suffix: "%", label: "Win rate estimé",    color: "#38bdf8" },
    { value: markets,     suffix: "+", label: "Marchés surveillés", color: "#fb923c" },
  ];

  return (
    <section className="py-24 px-4" style={{ background: "#050505" }}>
      <div ref={ref} className="max-w-4xl mx-auto">
        <p style={{ textAlign: "center", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.35em", color: "#00ff8844", marginBottom: "4rem", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
          En ce moment
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div key={s.label} style={{ textAlign: "center", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(16px)", transition: `opacity 0.7s ease ${i * 0.1}s, transform 0.7s ease ${i * 0.1}s` }}>
              <p style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", color: s.color, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: `0 0 24px ${s.color}55` }}>
                {s.value.toLocaleString()}{s.suffix}
              </p>
              <p style={{ color: "#555", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.15em", marginTop: "0.5rem" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ══════════════════════════════════════════════════════════════════════════════
function FooterSection() {
  return (
    <footer className="py-10 px-4" style={{ background: "#0a0a0a", borderTop: "1px solid #ffffff0a" }}>
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "#00ff8818", border: "1px solid #00ff8828" }}>
            <span style={{ color: "#00ff88", fontSize: "10px", fontWeight: 900 }}>$</span>
          </div>
          <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "0.88rem", letterSpacing: "-0.01em" }}>Moneyprinter</span>
        </div>
        <p style={{ color: "#e0e0e0", fontSize: "11px", textAlign: "center" }}>
          Moneyprinter — Outil d&apos;analyse uniquement. Ne garantit aucun gain.
        </p>
        <div className="flex items-center gap-5">
          <Link href="/dashboard" style={{ color: "#888", fontSize: "11px", transition: "color 0.2s" }}>Dashboard</Link>
          <Link href="/markets"   style={{ color: "#888", fontSize: "11px", transition: "color 0.2s" }}>Radar</Link>
          <Link href="/bot"       style={{ color: "#888", fontSize: "11px", transition: "color 0.2s" }}>Bot</Link>
          <Link href="/crypto"    style={{ color: "#888", fontSize: "11px", transition: "color 0.2s" }}>Crypto</Link>
        </div>
      </div>
    </footer>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
export default function HomePage() {
  return (
    <div style={{ background: "#0a0a0a" }}>
      <HeroSection />
      <MarketsSection />
      <SignalSection />
      <LayersSection />
      <CountersSection />
      <FooterSection />
    </div>
  );
}
