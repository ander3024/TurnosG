"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeftRight, Check, X, Loader2 } from "lucide-react";
import { cn, statusColor, statusLabel } from "@/lib/utils";

interface SwapPerson {
  id: number;
  code: string;
  name: string;
  color: string;
}

interface SwapUser {
  id: number;
  name: string;
  email: string;
}

interface Swap {
  id: number;
  fromUser: SwapUser;
  toUser: SwapUser;
  fromPerson: SwapPerson;
  toPerson: SwapPerson;
  fromDate: string;
  toDate: string;
  fromShiftLabel: string;
  toShiftLabel: string;
  status: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const TABS = [
  { key: "todos", label: "Todos" },
  { key: "pendiente", label: "Pendientes" },
  { key: "aceptado", label: "Aceptados" },
  { key: "aprobado", label: "Aprobados" },
  { key: "rechazado", label: "Rechazados" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SwapsPage() {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchSwaps = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        activeTab === "todos"
          ? "/api/admin/swaps"
          : `/api/admin/swaps?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json();
      setSwaps(data.items || []);
    } catch {
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchSwaps();
  }, [fetchSwaps]);

  async function handleAction(swapId: number, status: "aprobado" | "rechazado") {
    setActionLoading(swapId);
    try {
      const res = await fetch(`/api/admin/swaps/${swapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await fetchSwaps();
      }
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Intercambios de turno
        </h1>
        <p className="text-gray-500 mt-1">
          Solicitudes de intercambio de turnos entre empleados
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : swaps.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ArrowLeftRight className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay intercambios de turno</p>
            <p className="text-sm text-gray-400 mt-1">
              Los empleados pueden solicitar intercambios de turno desde su
              portal. Las solicitudes apareceran aqui para su gestion.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {swaps.map((swap) => (
            <Card key={swap.id} className="overflow-hidden">
              <CardContent className="!p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  {/* Left: swap details */}
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    {/* From person */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: swap.fromPerson.color }}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-900">
                          {swap.fromPerson.name}
                        </span>
                        <p className="text-xs text-gray-500">
                          su turno del {formatDate(swap.fromDate)}{" "}
                          <span className="font-medium text-gray-700">
                            {swap.fromShiftLabel}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Arrow */}
                    <ArrowLeftRight className="w-5 h-5 text-gray-400 shrink-0" />

                    {/* To person */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: swap.toPerson.color }}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-900">
                          {swap.toPerson.name}
                        </span>
                        <p className="text-xs text-gray-500">
                          su turno del {formatDate(swap.toDate)}{" "}
                          <span className="font-medium text-gray-700">
                            {swap.toShiftLabel}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right: status + actions */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        statusColor(swap.status)
                      )}
                    >
                      {statusLabel(swap.status)}
                    </span>

                    {/* Approve/Reject buttons — only for "aceptado" status */}
                    {swap.status === "aceptado" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(swap.id, "aprobado")}
                          disabled={actionLoading === swap.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === swap.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Aprobar
                        </button>
                        <button
                          onClick={() => handleAction(swap.id, "rechazado")}
                          disabled={actionLoading === swap.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === swap.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <X className="w-3.5 h-3.5" />
                          )}
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reason and timestamp */}
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                  <span>
                    Solicitado{" "}
                    {new Date(swap.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {swap.reason && (
                    <span className="text-gray-500 italic">
                      &quot;{swap.reason}&quot;
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
