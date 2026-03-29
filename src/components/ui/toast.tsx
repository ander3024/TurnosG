"use client";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback for components outside provider — log to console
    return {
      success: (m) => console.log("[toast:success]", m),
      error: (m) => console.error("[toast:error]", m),
      warning: (m) => console.warn("[toast:warning]", m),
      info: (m) => console.info("[toast:info]", m),
    };
  }
  return ctx;
}

const icons: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastType, string> = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const iconStyles: Record<ToastType, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const Icon = icons[toast.type];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm transition-all duration-300 max-w-[90vw] sm:max-w-md",
        styles[toast.type],
        visible && !exiting ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      )}
    >
      <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", iconStyles[toast.type])} />
      <p className="text-sm font-medium flex-1 leading-snug">{toast.message}</p>
      <button onClick={() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 300); }}
        className="flex-shrink-0 p-0.5 rounded-md hover:bg-black/5 transition-colors">
        <X className="w-3.5 h-3.5 opacity-50" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, duration?: number) => {
    const id = nextId.current++;
    setToasts((prev) => {
      const next = [...prev, { id, message, type, duration: duration || (type === "error" ? 6000 : 4000) }];
      return next.slice(-3); // max 3 visible
    });
  }, []);

  const value = useCallback(() => ({
    success: (m: string) => addToast(m, "success"),
    error: (m: string) => addToast(m, "error"),
    warning: (m: string) => addToast(m, "warning"),
    info: (m: string) => addToast(m, "info"),
  }), [addToast]);

  return (
    <ToastContext.Provider value={value()}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none sm:left-auto sm:right-4 sm:translate-x-0 sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
