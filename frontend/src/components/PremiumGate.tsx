"use client";

import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
}

export function PremiumGate({ children, feature = "cette fonctionnalité" }: PremiumGateProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00ff88]/30 border-t-[#00ff88] rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.plan === "premium") return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00ff88]/20 to-[#00ff88]/5 border border-[#00ff88]/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">⚡</span>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Fonctionnalité Premium</h2>
        <p className="text-gray-400 text-sm mb-8">
          Débloquez l&apos;accès à {feature} et toutes les fonctionnalités avancées de Moneyprinter.
        </p>

        {/* Features */}
        <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6 mb-8 text-left space-y-3">
          {[
            ["Bot de trading automatique", "🤖"],
            ["Globe boursier 3D + analyses", "🌐"],
            ["Signaux algorithmiques avancés", "📊"],
            ["Radar Polymarket complet", "🎯"],
            ["Alertes en temps réel", "🔔"],
          ].map(([label, icon]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <span className="text-sm text-gray-300">{label}</span>
              <span className="ml-auto text-[#00ff88] text-xs font-bold">✓</span>
            </div>
          ))}
        </div>

        <Link
          href="/profile"
          className="block w-full py-3 rounded-xl bg-[#00ff88] text-black font-bold text-sm hover:bg-[#00e57a] transition-colors"
        >
          Passer à Premium →
        </Link>
        <p className="text-gray-600 text-xs mt-3">Contactez-nous pour les tarifs</p>
      </div>
    </div>
  );
}
