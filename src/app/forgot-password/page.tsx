"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setSent(true);
      } else {
        setError("Error al enviar el enlace");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/logo-white.png" alt="El Ganso" className="h-24 object-contain drop-shadow-lg" />
          </div>
          <p className="text-indigo-300 mt-1">Recuperar contraseña</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-white text-sm">
                Si tu email está registrado, recibirás un enlace para restablecer tu contraseña.
              </p>
              <Link
                href="/login"
                className="inline-block text-indigo-300 hover:text-indigo-200 text-sm mt-4"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-indigo-200">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border-0 bg-white/10 px-4 py-3 text-white placeholder:text-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur"
                  placeholder="tu@email.com"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                loading={loading}
                className="w-full !py-3 !text-base !bg-indigo-600 hover:!bg-indigo-500 !shadow-lg !shadow-indigo-500/30"
                size="lg"
              >
                Enviar enlace de recuperación
              </Button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-indigo-300/80 hover:text-indigo-200 text-sm"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </form>
          )}
        </div>

        <p className="text-center text-indigo-400/60 text-xs mt-6">
          El Ganso &middot; Sistema de Gestión de Turnos v2.0
        </p>
      </div>
    </div>
  );
}
