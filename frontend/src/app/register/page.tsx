"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

export default function RegisterPage() {
  const { register, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    if (password.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères"); return; }
    setSubmitting(true);
    try {
      await register(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'inscription");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-4">
            <span className="text-gray-950 text-xl font-black">$</span>
          </div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
            Moneyprinter
          </h1>
          <p className="text-gray-500 text-sm mt-1">Créez votre compte</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-[#0d0d0d] border border-white/[0.06] rounded-2xl p-6 space-y-4">
            {[
              { label: "Email", type: "email", value: email, set: setEmail, placeholder: "vous@exemple.com" },
              { label: "Mot de passe", type: "password", value: password, set: setPassword, placeholder: "Min. 6 caractères" },
              { label: "Confirmer le mot de passe", type: "password", value: confirm, set: setConfirm, placeholder: "••••••••" },
            ].map(({ label, type, value, set, placeholder }) => (
              <div key={label}>
                <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">{label}</label>
                <input
                  type={type}
                  value={value}
                  onChange={e => set(e.target.value)}
                  required
                  placeholder={placeholder}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#00ff88]/40 focus:bg-white/[0.06] transition-all"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-[#00ff88] text-black font-bold text-sm hover:bg-[#00e57a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Création...</>
            ) : "Créer mon compte"}
          </button>

          <p className="text-center text-gray-500 text-sm">
            Déjà un compte ?{" "}
            <Link href="/login" className="text-[#00ff88] hover:text-[#00e57a] font-semibold transition-colors">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
