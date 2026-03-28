"use client";
import { useState, useEffect } from "react";
import { X, Download, Share, Plus } from "lucide-react";

// Detect platform
function getPlat() {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

// Check if already installed as PWA
function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
}

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState("unknown");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Don't show if already installed or dismissed recently
    if (isStandalone()) return;
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const ts = parseInt(dismissed);
      // Don't show again for 7 days
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return;
    }

    const plat = getPlat();
    setPlatform(plat);

    // Android: listen for beforeinstallprompt
    if (plat === "android") {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShow(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }

    // iOS: show manual instructions after a delay
    if (plat === "ios") {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
  }

  async function installAndroid() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-3 animate-in slide-in-from-bottom duration-300">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#1a2b6b] to-[#2d4a8e]">
          <img src="/icons/icon-192.png" alt="El Ganso" className="w-12 h-12 rounded-xl shadow-lg bg-white" />
          <div className="flex-1">
            <h3 className="text-white font-bold text-sm">Instalar El Ganso Turnos</h3>
            <p className="text-blue-200 text-xs">Accede más rápido desde tu pantalla de inicio</p>
          </div>
          <button onClick={dismiss} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {platform === "ios" ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Pulsa el botón compartir</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Share className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">en la barra inferior de Safari</span>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Añadir a pantalla de inicio</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Plus className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">desplaza hacia abajo en el menú</span>
                  </div>
                </div>
              </div>
              <button onClick={dismiss} className="w-full mt-2 py-2.5 rounded-xl bg-gray-100 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                Ahora no
              </button>
            </div>
          ) : platform === "android" ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Instala la app para acceder rápidamente a tus turnos sin abrir el navegador.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={installAndroid}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1a2b6b] text-white text-sm font-semibold hover:bg-[#152252] transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Instalar
                </button>
                <button onClick={dismiss} className="px-4 py-2.5 rounded-xl bg-gray-100 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors">
                  Ahora no
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
