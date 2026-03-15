"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useBotContext } from "@/lib/BotContext";
import { useAuth } from "@/lib/AuthContext";

const NAV = [
  { href: "/dashboard", label: "Dashboard", hot: true },
  { href: "/markets",   label: "Radar"  },
  { href: "/crypto",    label: "Crypto"  },
  { href: "/signals",   label: "Signaux" },
  { href: "/bot",       label: "Bot" },
  { href: "/bourse",    label: "Bourse" },
];

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  if (!user) return (
    <Link href="/login" className="px-3 py-1.5 rounded-lg text-sm font-semibold text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors">
      Connexion
    </Link>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.14] transition-all"
      >
        <div className="w-6 h-6 rounded-lg bg-[#00ff88]/15 border border-[#00ff88]/25 flex items-center justify-center">
          <span className="text-[#00ff88] text-xs font-bold">{user.email[0].toUpperCase()}</span>
        </div>
        <span className="text-white text-xs font-semibold hidden sm:block max-w-[100px] truncate">{user.email.split("@")[0]}</span>
        {user.plan === "premium" && <span className="text-amber-400 text-[10px] font-bold hidden sm:block">⚡</span>}
        <svg className={`w-3 h-3 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-[#0d0d0d] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="text-white text-sm font-semibold truncate">{user.email}</div>
            <div className={`text-xs mt-0.5 font-medium ${user.plan === "premium" ? "text-amber-400" : "text-gray-500"}`}>
              {user.plan === "premium" ? "⚡ Premium" : "Gratuit"}
            </div>
          </div>
          {/* Links */}
          <div className="p-1.5 space-y-0.5">
            <Link href="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/[0.05] text-sm transition-colors">
              <span>👤</span> Mon profil
            </Link>
            {user.plan !== "premium" && (
              <Link href="/profile" onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-amber-400 hover:bg-amber-500/[0.08] text-sm transition-colors font-semibold">
                <span>⚡</span> Passer Premium
              </Link>
            )}
          </div>
          <div className="p-1.5 border-t border-white/[0.06]">
            <button onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/[0.08] text-sm transition-colors text-left">
              <span>🚪</span> Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { state: botState } = useBotContext();

  const isHome = pathname === "/";

  return (
    <header className={`sticky top-0 z-50 transition-all duration-300 ${isHome ? "border-b border-white/5 bg-black/20 backdrop-blur-md" : "border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-md"}`}>
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <span className="text-gray-950 text-xs font-black">$</span>
          </div>
          <span className="text-lg font-extrabold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent tracking-tight">
            Moneyprinter
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV.map(({ href, label, hot }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const isBot  = href === "/bot";
            const botRunning = isBot && botState.isActive;
            return (
              <Link key={href} href={href}
                className={["relative px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                  active ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                         : "text-gray-400 hover:text-white hover:bg-gray-800/60"].join(" ")}>
                {label}
                {hot && !active && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                {isBot && !active && <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${botRunning ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">LIVE</span>
          </div>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
