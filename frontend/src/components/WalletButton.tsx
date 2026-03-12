"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useConnect, useDisconnect, useBalance, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { formatEther } from "viem";

/* Fox SVG icon (MetaMask brand color) */
function FoxIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M29.2 3L17.5 11.6l2.2-5.2L29.2 3z" fill="#E2761B" stroke="#E2761B" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.8 3l11.6 8.7-2.1-5.3L2.8 3z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M24.9 22l-3.1 4.8 6.7 1.8 1.9-6.5-5.5-.1zM2.7 22.1l1.9 6.5 6.7-1.8L8.2 22l-5.5.1z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.9 14.2L9 17.1l6.7.3-.2-7.2-4.6 4.1zM21.1 14.2l-4.7-4.2-.2 7.2 6.7-.3-1.8-2.7z" fill="#E4761B" stroke="#E4761B" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.3 26.8l4-1.9-3.5-2.7-.5 4.6zM16.7 24.9l4 1.9-.5-4.6-3.5 2.7z" fill="#D7C1B3" stroke="#D7C1B3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function truncate(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtEth(raw: bigint | undefined): string {
  if (raw === undefined) return "…";
  const n = parseFloat(formatEther(raw));
  return n < 0.0001 ? "< 0.0001 ETH" : `${n.toFixed(4)} ETH`;
}

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  const [open,    setOpen]    = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const chainId               = useChainId();
  const { address, isConnected, connector } = useAccount();
  const { connect, isPending, error: connectError } = useConnect();
  const { disconnect }        = useDisconnect();
  const { data: balanceData } = useBalance({ address });

  // Avoid SSR hydration mismatch
  useEffect(() => setMounted(true), []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!mounted) {
    return (
      <div className="h-8 w-32 rounded-xl bg-gray-800 animate-pulse" />
    );
  }

  /* ── Not connected ── */
  if (!isConnected) {
    const noMetaMask =
      typeof window !== "undefined" &&
      !(window as typeof window & { ethereum?: unknown }).ethereum;

    if (noMetaMask) {
      return (
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/25 text-orange-300 text-xs font-semibold rounded-xl transition-colors"
        >
          <FoxIcon />
          Installer MetaMask
        </a>
      );
    }

    return (
      <button
        onClick={() => connect({ connector: injected() })}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 border border-emerald-500/30 text-emerald-300 text-xs font-semibold rounded-xl transition-colors"
      >
        <FoxIcon />
        {isPending ? "Connexion…" : "Connect Wallet"}
      </button>
    );
  }

  /* ── Connected ── */
  const isMainnet = chainId === 1;

  return (
    <div ref={dropRef} className="relative">
      {/* Pill button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-xl transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-xs font-mono text-gray-200">{truncate(address!)}</span>
        <span className="text-gray-600 text-xs">·</span>
        <span className="text-xs font-medium text-white">{fmtEth(balanceData?.value)}</span>
        <span className="text-gray-500 text-[10px] ml-0.5">{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden animate-fade-slide-up">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            <FoxIcon size={18} />
            <span className="text-xs font-semibold text-white">
              {connector?.name ?? "Wallet"} connecté
            </span>
            <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isMainnet ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-orange-500/15 text-orange-400 border border-orange-500/25"}`}>
              {isMainnet ? "Ethereum" : `Chain ${chainId}`}
            </span>
          </div>

          {/* Address */}
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Adresse</p>
            <p className="text-xs font-mono text-gray-200 break-all">{address}</p>
            <button
              onClick={() => { navigator.clipboard.writeText(address!); }}
              className="mt-1.5 text-[10px] text-gray-500 hover:text-emerald-400 transition-colors"
            >
              Copier l'adresse
            </button>
          </div>

          {/* Balance */}
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Solde ETH</p>
            <p className="text-xl font-extrabold text-white">{fmtEth(balanceData?.value)}</p>
            {balanceData && (
              <p className="text-[10px] text-gray-500 mt-0.5">
                Réseau Ethereum Mainnet
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="px-4 py-3 flex gap-2">
            <a
              href={`https://etherscan.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              Etherscan ↗
            </a>
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-colors"
            >
              Déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
