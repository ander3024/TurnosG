"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-white text-sm">
          Enlace inválido. No se ha proporcionado un token de recuperación.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-indigo-300 hover:text-indigo-200 text-sm mt-4"
        >
          Solicitar nuevo enlace
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-white text-sm font-medium">Contraseña cambiada</p>
        <p className="text-indigo-300/80 text-sm">
          Tu contraseña se ha actualizado correctamente.
        </p>
        <Link
          href="/login"
          className="inline-block text-indigo-300 hover:text-indigo-200 text-sm mt-4"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al cambiar la contraseña");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-indigo-200">
          Nueva contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="block w-full rounded-xl border-0 bg-white/10 px-4 py-3 text-white placeholder:text-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur"
          placeholder="••••••••"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-indigo-200">
          Confirmar contraseña
        </label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="block w-full rounded-xl border-0 bg-white/10 px-4 py-3 text-white placeholder:text-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur"
          placeholder="••••••••"
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
        Cambiar contraseña
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
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img src="/logo-white.png" alt="El Ganso" className="h-24 object-contain drop-shadow-lg" />
          </div>
          <p className="text-indigo-300 mt-1">Restablecer contraseña</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>

        <p className="text-center text-indigo-400/60 text-xs mt-6">
          El Ganso &middot; Sistema de Gestión de Turnos v2.0
        </p>
      </div>
    </div>
  );
}
