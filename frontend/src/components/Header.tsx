"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",        label: "Marchés" },
  { href: "/crypto",  label: "Crypto"  },
  { href: "/signals", label: "Signals", hot: true },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-md sticky top-0 z-10">
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
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "relative px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                  active
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/60",
                ].join(" ")}
              >
                {label}
                {hot && !active && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Status */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">LIVE</span>
        </div>
      </div>
    </header>
  );
}
