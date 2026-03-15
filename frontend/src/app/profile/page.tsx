"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

const PROFIL_OPTIONS: { value: "conservateur" | "modere" | "agressif"; label: string; desc: string; icon: string }[] = [
  { value: "conservateur", label: "Conservateur", desc: "Préserve le capital, faible risque", icon: "🛡️" },
  { value: "modere", label: "Modéré", desc: "Équilibre risque/rendement", icon: "⚖️" },
  { value: "agressif", label: "Agressif", desc: "Maximise le rendement, risque élevé", icon: "🚀" },
];

export default function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const [profil, setProfil] = useState(user?.profil_investisseur ?? "modere");
  const [alertesEmail, setAlertesEmail] = useState(user?.preferences?.alertes_email ?? true);
  const [notifPush, setNotifPush] = useState(user?.preferences?.notifications_push ?? false);
  const [objectifs, setObjectifs] = useState(user?.preferences?.objectifs ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profil_investisseur: profil }),
      });
      await fetch("/api/auth/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertes_email: alertesEmail, notifications_push: notifPush, objectifs }),
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkWallet = async () => {
    if (!isConnected) {
      connect({ connector: injected() });
      return;
    }
    setLinkingWallet(true);
    try {
      await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: address }),
      });
      await refreshUser();
    } finally {
      setLinkingWallet(false);
    }
  };

  if (!user) return null;

  const planIsPremium = user.plan === "premium";

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Mon Profil</h1>
        <p className="text-gray-500 text-sm mt-1">Gérez vos préférences et votre compte</p>
      </div>

      {/* Account info */}
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Compte</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center">
            <span className="text-[#00ff88] font-bold text-lg">{user.email[0].toUpperCase()}</span>
          </div>
          <div>
            <div className="text-white font-semibold">{user.email}</div>
            <div className="text-gray-500 text-sm">
              Membre depuis {new Date(user.created_at ?? Date.now()).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
            </div>
          </div>
        </div>
      </div>

      {/* Plan */}
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Plan</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${planIsPremium ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/[0.04] border border-white/[0.06]"}`}>
              <span className="text-xl">{planIsPremium ? "⚡" : "🆓"}</span>
            </div>
            <div>
              <div className={`font-bold text-sm ${planIsPremium ? "text-amber-400" : "text-white"}`}>
                {planIsPremium ? "Premium" : "Gratuit"}
              </div>
              <div className="text-gray-500 text-xs">
                {planIsPremium ? "Accès complet à toutes les fonctionnalités" : "Dashboard + Crypto basique"}
              </div>
            </div>
          </div>
          {!planIsPremium && (
            <button className="px-4 py-2 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 text-[#00ff88] text-sm font-semibold hover:bg-[#00ff88]/15 transition-colors">
              Upgrader →
            </button>
          )}
        </div>
      </div>

      {/* Profil investisseur */}
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Profil Investisseur</h2>
        <div className="grid grid-cols-3 gap-3">
          {PROFIL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setProfil(opt.value)}
              className={`p-4 rounded-xl border text-left transition-all ${profil === opt.value ? "bg-[#00ff88]/10 border-[#00ff88]/30 text-white" : "bg-white/[0.03] border-white/[0.06] text-gray-400 hover:border-white/[0.10]"}`}
            >
              <div className="text-2xl mb-2">{opt.icon}</div>
              <div className={`text-xs font-bold mb-1 ${profil === opt.value ? "text-[#00ff88]" : ""}`}>{opt.label}</div>
              <div className="text-[10px] text-gray-600 leading-tight">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Préférences */}
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Préférences</h2>
        {[
          { label: "Alertes email", desc: "Recevoir les signaux par email", value: alertesEmail, set: setAlertesEmail },
          { label: "Notifications push", desc: "Alertes en temps réel dans le navigateur", value: notifPush, set: setNotifPush },
        ].map(({ label, desc, value, set }) => (
          <div key={label} className="flex items-center justify-between">
            <div>
              <div className="text-white text-sm font-semibold">{label}</div>
              <div className="text-gray-500 text-xs">{desc}</div>
            </div>
            <button
              onClick={() => set(!value)}
              className={`w-11 h-6 rounded-full transition-colors relative ${value ? "bg-[#00ff88]" : "bg-white/[0.10]"}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        ))}
        <div>
          <label className="block text-white text-sm font-semibold mb-2">Objectifs financiers</label>
          <textarea
            value={objectifs}
            onChange={e => setObjectifs(e.target.value)}
            rows={3}
            placeholder="Ex: Atteindre 50 000€ en 3 ans, diversifier mon portefeuille..."
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#00ff88]/40 transition-all resize-none"
          />
        </div>
      </div>

      {/* Wallet */}
      <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Wallet MetaMask</h2>
        {user.wallet_address ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-sm">🦊</div>
            <div>
              <div className="text-white text-sm font-mono">{user.wallet_address.slice(0, 6)}...{user.wallet_address.slice(-4)}</div>
              <div className="text-gray-500 text-xs">Wallet lié</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Liez votre wallet MetaMask pour accéder aux fonctionnalités Web3.</p>
            <button
              onClick={handleLinkWallet}
              disabled={linkingWallet}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-semibold hover:bg-orange-500/15 transition-colors disabled:opacity-50"
            >
              🦊 {isConnected ? (linkingWallet ? "Liaison..." : "Lier ce wallet") : "Connecter MetaMask"}
            </button>
          </div>
        )}
      </div>

      {/* Save + logout */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-[#00ff88] text-black font-bold text-sm hover:bg-[#00e57a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Sauvegarde...</> : saved ? "✓ Sauvegardé" : "Sauvegarder"}
        </button>
        <button
          onClick={logout}
          className="px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/15 transition-colors"
        >
          Déconnexion
        </button>
      </div>
    </div>
  );
}
