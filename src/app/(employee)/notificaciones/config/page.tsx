"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  ArrowLeft,
  Lock,
  Smartphone,
  Monitor,
} from "lucide-react";

interface NotificationPreference {
  eventType: string;
  label: string;
  description: string;
  inApp: boolean;
  push: boolean;
  locked: boolean;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-indigo-600" : "bg-gray-200",
        disabled && "opacity-50 cursor-not-allowed"
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

export default function NotificacionesConfigPage() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/employee/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setPreferences(
          Array.isArray(data) ? data : data.preferences || []
        );
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  // Check push support
  useEffect(() => {
    if ("Notification" in window && "serviceWorker" in navigator) {
      setPushSupported(true);
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribePush = async () => {
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushLoading(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error("VAPID key not configured");
        setPushLoading(false);
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      setPushSubscribed(true);
    } catch (err) {
      console.error("Push subscription failed:", err);
    } finally {
      setPushLoading(false);
    }
  };

  const unsubscribePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
      setPushSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
    } finally {
      setPushLoading(false);
    }
  };

  const updatePreference = (
    eventType: string,
    field: "inApp" | "push",
    value: boolean
  ) => {
    setPreferences((prev) =>
      prev.map((p) =>
        p.eventType === eventType ? { ...p, [field]: value } : p
      )
    );
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      await fetch("/api/employee/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences }),
      });
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/notificaciones"
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Configuracion de notificaciones
          </h1>
          <p className="text-gray-500 mt-1">
            Personaliza como y cuando recibes notificaciones
          </p>
        </div>
      </div>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Notificaciones push
              </h2>
              <p className="text-sm text-gray-500">
                Recibe notificaciones en tu dispositivo aunque no tengas la app
                abierta
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!pushSupported ? (
            <p className="text-sm text-gray-400">
              Tu navegador no soporta notificaciones push
            </p>
          ) : pushSubscribed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-gray-700 font-medium">
                  Notificaciones push activadas
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={unsubscribePush}
                loading={pushLoading}
              >
                <BellOff className="w-4 h-4" />
                Desactivar
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={subscribePush}
              loading={pushLoading}
            >
              <Bell className="w-4 h-4" />
              Activar notificaciones push
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Notification Types */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Tipos de notificacion
              </h2>
              <p className="text-sm text-gray-500">
                Elige que notificaciones quieres recibir y por que canal
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-gray-400 mt-3">Cargando...</p>
            </div>
          ) : preferences.length === 0 ? (
            <div className="py-12 text-center px-6">
              <p className="text-sm text-gray-400">
                No hay preferencias configurables
              </p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_80px_80px] gap-4 px-6 py-3 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <span>Evento</span>
                <span className="text-center">En la app</span>
                <span className="text-center">Push</span>
              </div>
              <div className="divide-y divide-gray-50">
                {preferences.map((pref) => (
                  <div
                    key={pref.eventType}
                    className="flex flex-col sm:grid sm:grid-cols-[1fr_80px_80px] gap-2 sm:gap-4 sm:items-center px-4 sm:px-6 py-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {pref.label}
                        </p>
                        {pref.locked && (
                          <span title="Configurado por el administrador">
                            <Lock className="w-3.5 h-3.5 text-gray-400" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {pref.description}
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <Toggle
                        checked={pref.inApp}
                        onChange={(v) =>
                          updatePreference(pref.eventType, "inApp", v)
                        }
                        disabled={pref.locked}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Toggle
                        checked={pref.push}
                        onChange={(v) =>
                          updatePreference(pref.eventType, "push", v)
                        }
                        disabled={pref.locked}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {preferences.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={savePreferences} loading={saving}>
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
