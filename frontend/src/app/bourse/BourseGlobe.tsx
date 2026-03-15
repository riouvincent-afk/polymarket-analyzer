"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const R = 2;

const EXCHANGES = [
  { id: "US", name: "NYSE / NASDAQ",   city: "New York",   index: "S&P 500",    symbol: "^GSPC",     lat: 40.71, lng: -74.01, cap: 50, tz: "America/New_York",  oh: 9,  om: 30, ch: 16, cm: 0  },
  { id: "UK", name: "London LSE",      city: "Londres",    index: "FTSE 100",   symbol: "^FTSE",     lat: 51.51, lng: -0.13,  cap: 32, tz: "Europe/London",     oh: 8,  om: 0,  ch: 16, cm: 30 },
  { id: "JP", name: "Tokyo JPX",       city: "Tokyo",      index: "Nikkei 225", symbol: "^N225",     lat: 35.68, lng: 139.65, cap: 28, tz: "Asia/Tokyo",        oh: 9,  om: 0,  ch: 15, cm: 30 },
  { id: "HK", name: "Hong Kong HKEX",  city: "Hong Kong",  index: "Hang Seng",  symbol: "^HSI",      lat: 22.32, lng: 114.17, cap: 20, tz: "Asia/Hong_Kong",    oh: 9,  om: 30, ch: 16, cm: 0  },
  { id: "CN", name: "Shanghai SSE",    city: "Shanghai",   index: "CSI 300",    symbol: "000300.SS", lat: 31.23, lng: 121.47, cap: 18, tz: "Asia/Shanghai",     oh: 9,  om: 30, ch: 15, cm: 0  },
  { id: "FR", name: "Euronext Paris",  city: "Paris",      index: "CAC 40",     symbol: "^FCHI",     lat: 48.86, lng: 2.35,   cap: 22, tz: "Europe/Paris",      oh: 9,  om: 0,  ch: 17, cm: 30 },
  { id: "DE", name: "Deutsche Börse",  city: "Francfort",  index: "DAX",        symbol: "^GDAXI",    lat: 50.11, lng: 8.68,   cap: 18, tz: "Europe/Berlin",     oh: 9,  om: 0,  ch: 17, cm: 30 },
  { id: "AU", name: "Sydney ASX",      city: "Sydney",     index: "ASX 200",    symbol: "^AXJO",     lat: -33.87, lng: 151.21, cap: 14, tz: "Australia/Sydney", oh: 10, om: 0,  ch: 16, cm: 0  },
  { id: "IN", name: "Mumbai BSE",      city: "Mumbai",     index: "Sensex",     symbol: "^BSESN",   lat: 19.08, lng: 72.88,  cap: 12, tz: "Asia/Kolkata",     oh: 9,  om: 15, ch: 15, cm: 30 },
  { id: "BR", name: "São Paulo B3",    city: "São Paulo",  index: "Bovespa",    symbol: "^BVSP",     lat: -23.55, lng: -46.63, cap: 10, tz: "America/Sao_Paulo",oh: 10, om: 0,  ch: 17, cm: 0  },
] as const;

type Exchange = typeof EXCHANGES[number];

function getStatus(ex: Exchange): "OPEN" | "SOON" | "CLOSED" {
  try {
    const now = new Date();
    const fmt = (o: Intl.DateTimeFormatOptions) =>
      Intl.DateTimeFormat("en-US", { timeZone: ex.tz, ...o }).formatToParts(now);
    const day = fmt({ weekday: "short" }).find(p => p.type === "weekday")?.value;
    if (day === "Sat" || day === "Sun") return "CLOSED";
    const parts = fmt({ hour: "numeric", minute: "numeric", hour12: false });
    const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
    const cur = h * 60 + m, open = ex.oh * 60 + ex.om, close = ex.ch * 60 + ex.cm;
    if (cur >= open && cur < close) return cur >= close - 45 ? "SOON" : "OPEN";
    return "CLOSED";
  } catch { return "CLOSED"; }
}

function localTime(tz: string) {
  try { return Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date()); }
  catch { return ""; }
}

function ll2v(lat: number, lng: number, r: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

interface Props {
  onExchangeSelect: (id: string) => void;
  quotes?: Record<string, { price: number; pct: number }>;
}

interface Tooltip { exchange: Exchange; x: number; y: number; }

export default function BourseGlobe({ onExchangeSelect, quotes = {} }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = mount.clientHeight;

    // ── Renderer ────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 500);
    camera.position.z = 5.6;

    // ── Stars ───────────────────────────────────────────────
    {
      const n = 1400;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 160;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.28, sizeAttenuation: true })
      ));
    }

    // ── Globe group ─────────────────────────────────────────
    const globe = new THREE.Group();
    scene.add(globe);

    // Inner dark sphere
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(R - 0.02, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x000a06, transparent: true, opacity: 0.92 })
    ));

    // Outer glow
    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(R + 0.12, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.025, side: THREE.BackSide })
    ));

    // ── Lat / lon grid lines ─────────────────────────────────
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.13 });
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts: THREE.Vector3[] = [];
      for (let lng = 0; lng <= 361; lng += 3) pts.push(ll2v(lat, lng, R));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }
    for (let lng = 0; lng < 360; lng += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 2) pts.push(ll2v(lat, lng, R));
      globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    }

    // ── Exchange markers ─────────────────────────────────────
    const markerMeshes: { mesh: THREE.Mesh; ex: Exchange }[] = [];
    const pulseItems: { core: THREE.Mesh; glow: THREE.Mesh; phase: number }[] = [];

    EXCHANGES.forEach((ex, i) => {
      const status = getStatus(ex);
      const color = status === "OPEN" ? 0x00ff88 : status === "SOON" ? 0xff9000 : 0x334155;
      const coreR = (ex.cap / 50) * 0.046 + 0.02;
      const pos = ll2v(ex.lat, ex.lng, R);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(coreR * 2.8, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: status === "CLOSED" ? 0.05 : 0.18 })
      );
      glow.position.copy(pos);
      globe.add(glow);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(coreR, 14, 14),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: status === "CLOSED" ? 0.4 : 1 })
      );
      core.position.copy(pos);
      globe.add(core);

      // Large invisible hit sphere for raycasting
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(coreR * 7, 8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.position.copy(pos);
      hit.userData = { exIdx: i };
      globe.add(hit);

      markerMeshes.push({ mesh: hit, ex });
      if (status !== "CLOSED") pulseItems.push({ core, glow, phase: i * 1.1 });
    });

    // ── Arc connections (open markets) ───────────────────────
    const openList = EXCHANGES.filter(ex => getStatus(ex) === "OPEN");
    const arcMats: THREE.LineDashedMaterial[] = [];
    for (let a = 0; a < openList.length; a++) {
      for (let b = a + 1; b < openList.length; b++) {
        const p1 = ll2v(openList[a].lat, openList[a].lng, R);
        const p2 = ll2v(openList[b].lat, openList[b].lng, R);
        const mid = p1.clone().add(p2).normalize().multiplyScalar(R * 1.38);
        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
        const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(70));
        const mat = new THREE.LineDashedMaterial({ color: 0x00ff88, transparent: true, opacity: 0.22, dashSize: 0.07, gapSize: 0.05 });
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        globe.add(line);
        arcMats.push(mat);
      }
    }

    // ── Drag rotation ────────────────────────────────────────
    let isDrag = false, prevX = 0, prevY = 0, autoRotate = true;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;

    const onDown = (e: MouseEvent) => {
      isDrag = true; autoRotate = false;
      prevX = e.clientX; prevY = e.clientY;
      if (pauseTimer) clearTimeout(pauseTimer);
    };
    const onUp = () => {
      if (!isDrag) return;
      isDrag = false;
      pauseTimer = setTimeout(() => { autoRotate = true; }, 2500);
    };
    const onMoveDrag = (e: MouseEvent) => {
      if (!isDrag) return;
      globe.rotation.y += (e.clientX - prevX) * 0.004;
      globe.rotation.x = Math.max(-0.55, Math.min(0.55, globe.rotation.x + (e.clientY - prevY) * 0.003));
      prevX = e.clientX; prevY = e.clientY;
    };

    // ── Raycasting ───────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.1 };
    const mouseVec = new THREE.Vector2();
    const hitObjects = markerMeshes.map(m => m.mesh);

    const onMoveHover = (e: MouseEvent) => {
      if (isDrag) { setTooltip(null); return; }
      const rect = mount.getBoundingClientRect();
      mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, camera);
      const hits = raycaster.intersectObjects(hitObjects, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.exIdx as number;
        setTooltip({ exchange: EXCHANGES[idx], x: e.clientX, y: e.clientY });
        mount.style.cursor = "pointer";
      } else {
        setTooltip(null);
        mount.style.cursor = "default";
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect();
      mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseVec, camera);
      const hits = raycaster.intersectObjects(hitObjects, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.exIdx as number;
        onExchangeSelect(EXCHANGES[idx].id);
      }
    };

    mount.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    mount.addEventListener("mousemove", onMoveDrag);
    mount.addEventListener("mousemove", onMoveHover);
    mount.addEventListener("click", onClick);

    // ── Resize ───────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── Animation loop ───────────────────────────────────────
    let rafId = 0, t = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      t += 0.016;
      if (autoRotate && !isDrag) globe.rotation.y += 0.0007;
      pulseItems.forEach(({ core, glow, phase }) => {
        const s = 1 + Math.sin(t * 1.8 + phase) * 0.2;
        core.scale.setScalar(s);
        glow.scale.setScalar(s);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      arcMats.forEach(m => { (m as any).dashOffset -= 0.003; });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      if (pauseTimer) clearTimeout(pauseTimer);
      ro.disconnect();
      mount.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      mount.removeEventListener("mousemove", onMoveDrag);
      mount.removeEventListener("mousemove", onMoveHover);
      mount.removeEventListener("click", onClick);
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [onExchangeSelect]);

  const openCount = EXCHANGES.filter(ex => getStatus(ex) === "OPEN").length;

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />

      {/* Glassmorphism hover card */}
      {tooltip && (() => {
        const ex = tooltip.exchange;
        const status = getStatus(ex);
        const q = quotes[ex.symbol];
        return (
          <div
            className="fixed z-50 pointer-events-none"
            style={{ left: tooltip.x + 18, top: Math.max(80, tooltip.y - 90) }}
          >
            <div
              className="rounded-2xl p-4 min-w-[220px]"
              style={{
                background: "rgba(5,5,5,0.75)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(0,255,136,0.08)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  status === "OPEN" ? "bg-[#00ff88] animate-pulse" :
                  status === "SOON" ? "bg-orange-400 animate-pulse" : "bg-gray-600"
                }`} />
                <div className="text-white font-bold text-sm leading-tight">{ex.name}</div>
              </div>
              <div className="text-gray-400 text-xs mb-2">{ex.city} · {ex.index}</div>
              {q ? (
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-white font-mono font-bold text-base">
                    {q.price.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                  </span>
                  <span className={`text-sm font-bold ${q.pct >= 0 ? "text-[#00ff88]" : "text-[#ff4444]"}`}>
                    {q.pct >= 0 ? "+" : ""}{q.pct.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <div className="h-5 w-24 bg-white/[0.06] rounded mb-2 animate-pulse" />
              )}
              <div className="flex items-center justify-between text-xs">
                <span className={`font-semibold ${
                  status === "OPEN" ? "text-[#00ff88]" :
                  status === "SOON" ? "text-orange-400" : "text-gray-500"
                }`}>
                  {status === "OPEN" ? "Ouvert" : status === "SOON" ? "Ferme bientôt" : "Fermé"}
                </span>
                <span className="text-gray-500 font-mono">{localTime(ex.tz)}</span>
              </div>
              <div className="text-[#00ff88]/50 text-[10px] mt-2">Cliquer pour explorer →</div>
            </div>
          </div>
        );
      })()}

      {/* Bottom stats overlay */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
        <div className="flex items-center justify-center gap-8 px-6 py-4"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
          <Stat label="Marchés ouverts" value={String(openCount)} accent />
          <div className="w-px h-8 bg-white/10" />
          <Stat label="Cap mondiale" value="~$110T" />
          <div className="w-px h-8 bg-white/10" />
          <Stat label="Volume 24h" value="~$650 Mrd" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-bold text-lg font-mono ${accent ? "text-[#00ff88]" : "text-white"}`}>{value}</div>
      <div className="text-gray-500 text-xs">{label}</div>
    </div>
  );
}
