"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  Bell,
  Send,
  Users,
  User,
  CheckCircle2,
  Info,
  AlertTriangle,
  Zap,
  Lock,
  BarChart3,
  Mail,
  Clock,
} from "lucide-react";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  user: { name: string; email: string };
}

interface NotificationSetting {
  eventType: string;
  label: string;
  active: boolean;
  locked: boolean;
}

const typeConfig: Record<
  string,
  {
    icon: typeof Bell;
    variant: "info" | "success" | "warning" | "danger";
    label: string;
  }
> = {
  info: { icon: Info, variant: "info", label: "Info" },
  success: { icon: CheckCircle2, variant: "success", label: "OK" },
  warning: { icon: AlertTriangle, variant: "warning", label: "Aviso" },
  action: { icon: Zap, variant: "danger", label: "Accion" },
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-indigo-600" : "bg-gray-200"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [users, setUsers] = useState<{ id: number; name: string }[]>([]);

  // Send message form
  const [sendTitle, setSendTitle] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendTarget, setSendTarget] = useState<"all" | "specific">("all");
  const [sendUserId, setSendUserId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(
          Array.isArray(data) ? data : data.notifications || []
        );
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(Array.isArray(data) ? data : data.settings || []);
      }
    } catch {
      // silently fail
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchSettings();
    fetchUsers();
  }, [fetchNotifications, fetchSettings, fetchUsers]);

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTitle.trim() || !sendMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sendTitle,
          message: sendMessage,
          target: sendTarget,
          userId: sendTarget === "specific" ? sendUserId : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Notificación enviada");
        setSendTitle("");
        setSendMessage("");
        setSendTarget("all");
        setSendUserId(null);
        fetchNotifications();
      } else toast.error("Error al enviar notificación");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSending(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) toast.success("Configuración guardada");
      else toast.error("Error al guardar configuración");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSavingSettings(false);
    }
  };

  const updateSetting = (
    eventType: string,
    field: "active" | "locked",
    value: boolean
  ) => {
    setSettings((prev) =>
      prev.map((s) =>
        s.eventType === eventType ? { ...s, [field]: value } : s
      )
    );
  };

  // Stats
  const totalCount = notifications.length;
  const unreadCount = notifications.filter((n) => !n.read).length;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const weekCount = notifications.filter(
    (n) => new Date(n.createdAt) >= oneWeekAgo
  ).length;

  const stats = [
    {
      label: "Total",
      value: totalCount,
      icon: Bell,
      color: "bg-indigo-100 text-indigo-600",
    },
    {
      label: "Sin leer",
      value: unreadCount,
      icon: Mail,
      color: "bg-amber-100 text-amber-600",
    },
    {
      label: "Esta semana",
      value: weekCount,
      icon: Clock,
      color: "bg-emerald-100 text-emerald-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
        <p className="text-gray-500 mt-1">
          Gestiona las notificaciones del sistema y envia mensajes a los
          empleados
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 py-4">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    stat.color
                  )}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {stat.value}
                  </p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Send notification */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Send className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Enviar mensaje
              </h2>
              <p className="text-sm text-gray-500">
                Envia una notificacion a los empleados
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendNotification} className="space-y-4">
            <Input
              label="Titulo"
              id="send-title"
              value={sendTitle}
              onChange={(e) => setSendTitle(e.target.value)}
              placeholder="Titulo de la notificacion"
              required
            />
            <div className="space-y-1.5">
              <label
                htmlFor="send-message"
                className="block text-sm font-medium text-gray-700"
              >
                Mensaje
              </label>
              <textarea
                id="send-message"
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                placeholder="Escribe el mensaje..."
                required
                rows={3}
                className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            {/* Recipient selector */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Destinatario
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSendTarget("all")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                    sendTarget === "all"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Users className="w-4 h-4" />
                  Todos los usuarios
                </button>
                <button
                  type="button"
                  onClick={() => setSendTarget("specific")}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                    sendTarget === "specific"
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <User className="w-4 h-4" />
                  Usuario especifico
                </button>
              </div>
            </div>

            {sendTarget === "specific" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="send-user"
                  className="block text-sm font-medium text-gray-700"
                >
                  Seleccionar usuario
                </label>
                <select
                  id="send-user"
                  value={sendUserId || ""}
                  onChange={(e) =>
                    setSendUserId(e.target.value ? Number(e.target.value) : null)
                  }
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="">Seleccionar...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" loading={sending}>
                <Send className="w-4 h-4" />
                Enviar notificacion
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Notificaciones recientes
              </h2>
              <p className="text-sm text-gray-500">
                Historial de notificaciones enviadas
              </p>
            </div>
          </div>
        </CardHeader>
        {loading ? (
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-gray-400 mt-3">Cargando...</p>
          </CardContent>
        ) : notifications.length === 0 ? (
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay notificaciones todavia</p>
          </CardContent>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.slice(0, 50).map((n) => {
              const config = typeConfig[n.type] || typeConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-4 px-6 py-4 transition-colors",
                    !n.read && "bg-indigo-50/30"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                      !n.read ? "bg-indigo-100" : "bg-gray-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        !n.read ? "text-indigo-600" : "text-gray-400"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          "text-sm",
                          !n.read
                            ? "font-semibold text-gray-900"
                            : "font-medium text-gray-700"
                        )}
                      >
                        {n.title}
                      </p>
                      <Badge variant={config.variant}>{config.label}</Badge>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleString("es-ES")}
                      </span>
                      {n.user && (
                        <span className="text-xs text-gray-400">
                          Para: {n.user.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Notification settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Bell className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Configuracion de notificaciones
              </h2>
              <p className="text-sm text-gray-500">
                Activa o desactiva tipos de notificacion y controla si los
                empleados pueden desactivarlas
              </p>
            </div>
          </div>
        </CardHeader>
        {settingsLoading ? (
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          </CardContent>
        ) : settings.length === 0 ? (
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-400">
              No hay tipos de notificacion configurables
            </p>
          </CardContent>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px] gap-4 px-6 py-3 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span>Tipo de evento</span>
              <span className="text-center">Activo</span>
              <span className="text-center">Bloqueado</span>
            </div>
            <div className="divide-y divide-gray-50">
              {settings.map((setting) => (
                <div
                  key={setting.eventType}
                  className="grid grid-cols-[1fr_80px_80px] gap-4 items-center px-6 py-4"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {setting.label}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Toggle
                      checked={setting.active}
                      onChange={(v) =>
                        updateSetting(setting.eventType, "active", v)
                      }
                    />
                  </div>
                  <div className="flex justify-center">
                    <Toggle
                      checked={setting.locked}
                      onChange={(v) =>
                        updateSetting(setting.eventType, "locked", v)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <Button onClick={saveSettings} loading={savingSettings} size="sm">
                <Lock className="w-4 h-4" />
                Guardar configuracion
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
