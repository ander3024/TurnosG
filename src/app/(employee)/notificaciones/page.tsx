"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bell,
  CheckCircle2,
  Info,
  AlertTriangle,
  Zap,
  CheckCheck,
  Trash2,
  Settings,
  Check,
} from "lucide-react";

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

type Filter = "all" | "unread" | "read";

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

function relativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Ayer";
  if (diffD < 7) return `Hace ${diffD} dias`;
  return then.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function NotificacionesPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/employee/notifications");
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

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await fetch("/api/employee/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/employee/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unreadIds }),
    });
  };

  const deleteRead = async () => {
    const readIds = notifications.filter((n) => n.read).map((n) => n.id);
    if (readIds.length === 0) return;
    setNotifications((prev) => prev.filter((n) => !n.read));
    await fetch("/api/employee/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: readIds }),
    });
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "read") return n.read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "unread", label: `Sin leer (${unreadCount})` },
    { key: "read", label: "Leidas" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-gray-500 mt-1">
            {unreadCount > 0
              ? `Tienes ${unreadCount} notificacion${unreadCount > 1 ? "es" : ""} sin leer`
              : "Todas las notificaciones leidas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="w-4 h-4" />
            Marcar todas como leidas
          </Button>
          <Button variant="ghost" size="sm" onClick={deleteRead}>
            <Trash2 className="w-4 h-4" />
            Eliminar leidas
          </Button>
          <Link href="/notificaciones/config">
            <Button variant="secondary" size="sm">
              <Settings className="w-4 h-4" />
              Configurar
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              filter === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-gray-400 mt-3">Cargando...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay notificaciones</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter === "unread"
                ? "No tienes notificaciones sin leer"
                : filter === "read"
                  ? "No tienes notificaciones leidas"
                  : "Las notificaciones apareceran aqui"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const config = typeConfig[n.type] || typeConfig.info;
            const Icon = config.icon;
            return (
              <Card
                key={n.id}
                className={cn(!n.read && "border-indigo-200 bg-indigo-50/30")}
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  <div
                    className={cn(
                      "mt-0.5 flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                      !n.read ? "bg-indigo-100" : "bg-gray-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-5 h-5",
                        !n.read ? "text-indigo-600" : "text-gray-400"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                    <p className="text-sm text-gray-500 mt-1">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {relativeTime(n.createdAt)}
                    </p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Marcar como leida
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
