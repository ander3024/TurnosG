"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Lock, Check } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Profile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  person: {
    code: string;
    name: string;
    color: string;
  } | null;
}

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch("/api/employee/profile");
      if (res.ok) {
        const json = await res.json();
        setProfile(json.profile);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError("La nueva contrasena debe tener al menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Las contrasenas no coinciden");
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch("/api/employee/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
        toast.success("Contraseña actualizada correctamente");
      } else {
        const data = await res.json();
        setPasswordError(data.error || "Error al cambiar la contrasena");
      }
    } catch {
      setPasswordError("Error de conexion");
    }
    setChangingPassword(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const initials = profile
    ? profile.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
        <p className="text-gray-500 mt-1">Tu informacion personal</p>
      </div>

      {/* Profile info */}
      <Card>
        <CardContent className="py-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-2xl font-bold shrink-0">
              {initials}
            </div>
            <div className="text-center sm:text-left space-y-3 flex-1">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {profile?.name}
                </h2>
                <p className="text-gray-500 text-sm">{profile?.email}</p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <Badge variant="info">
                  {profile?.role === "admin"
                    ? "Administrador"
                    : profile?.role === "manager"
                      ? "Encargado"
                      : "Empleado"}
                </Badge>
                {profile?.person && (
                  <Badge className={`text-white`}>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-1.5"
                      style={{ backgroundColor: profile.person.color }}
                    />
                    {profile.person.code}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">
                    Telefono
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    {profile?.phone || "No registrado"}
                  </p>
                </div>
                {profile?.person && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">
                      Nombre en turnos
                    </p>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {profile.person.name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Cambiar contrasena</h2>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input
              id="currentPassword"
              label="Contrasena actual"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <Input
              id="newPassword"
              label="Nueva contrasena"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              id="confirmPassword"
              label="Confirmar nueva contrasena"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            {passwordError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">
                {passwordError}
              </p>
            )}

            {passwordSuccess && (
              <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4" />
                Contrasena actualizada correctamente
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" loading={changingPassword}>
                Guardar contrasena
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
