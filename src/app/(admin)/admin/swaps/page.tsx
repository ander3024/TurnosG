"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, Check, X, Loader2, Trash2, Scale, AlertTriangle, Clock } from "lucide-react";
import { cn, statusColor, statusLabel } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface SwapPerson { id: number; code: string; name: string; color: string }
interface DebtPair { personA: SwapPerson; personB: SwapPerson; aOwesB: number; bOwesA: number; net: number }
interface Swap {
  id: number; fromUser: { id: number; name: string }; toUser: { id: number; name: string };
  fromPerson: SwapPerson; toPerson: SwapPerson;
  fromDate: string; toDate: string; fromShiftLabel: string; toShiftLabel: string;
  status: string; reason: string | null; createdAt: string;
}

/** Comprobación de un intercambio contra el cuadrante (GET /schedule/swaps). */
interface SwapCheck {
  id: number;
  check: "ok" | "broken" | "orphan" | "superseded" | "unchecked";
  hours?: number | null;
  people: string;
  dates: string[];
  detail: string | null;
  supersededBySwapId?: number | null;
}

const TABS = [
  { key: "todos", label: "Todos" }, { key: "pendiente", label: "Pendientes" },
  { key: "aceptado", label: "Aceptados" }, { key: "aprobado", label: "Aprobados" },
  { key: "rechazado", label: "Rechazados" },
];

function fmtD(ds: string) {
  return new Date(ds + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export default function SwapsPage() {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("todos");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [debts, setDebts] = useState<DebtPair[]>([]);
  const [checks, setChecks] = useState<Map<number, SwapCheck>>(new Map());
  const toast = useToast();

  const fetchSwaps = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeTab === "todos" ? "/api/admin/swaps" : `/api/admin/swaps?status=${activeTab}`;
      const res = await fetch(url);
      const data = await res.json();
      setSwaps(data.items || []);
    } catch { setSwaps([]); } finally { setLoading(false); }
  }, [activeTab]);

  const fetchDebts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/swaps/debts");
      if (res.ok) { const data = await res.json(); setDebts(data.debts || []); }
    } catch {}
  }, []);

  /**
   * Un intercambio aprobado se puede quedar sin efecto si alguien edita el
   * cuadrante de ese día después. Aquí se comprueba contra el cuadrante de
   * verdad para poder avisarlo, en vez de darlo por hecho porque está aprobado.
   */
  const fetchChecks = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/schedule/swaps", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setChecks(new Map((data.items || []).map((i: SwapCheck) => [i.id, i])));
    } catch {}
  }, []);

  useEffect(() => { fetchSwaps(); }, [fetchSwaps]);
  useEffect(() => { fetchDebts(); }, [fetchDebts]);
  useEffect(() => { fetchChecks(); }, [fetchChecks]);

  const broken = [...checks.values()].filter((c) => c.check === "broken");
  const orphan = [...checks.values()].filter((c) => c.check === "orphan");

  async function handleAction(swapId: number, status: "aprobado" | "rechazado" | "cancelado") {
    setActionLoading(swapId);
    try {
      const res = await fetch(`/api/admin/swaps/${swapId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const msgs = { aprobado: "Intercambio aprobado", rechazado: "Intercambio rechazado", cancelado: "Intercambio cancelado" };
        toast.success(msgs[status]);
        await Promise.all([fetchSwaps(), fetchDebts(), fetchChecks()]);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al procesar");
      }
    } catch { toast.error("Error de conexión"); } finally { setActionLoading(null); }
  }

  async function handleDelete(swapId: number) {
    if (!confirm("¿Eliminar este intercambio completamente? Esta acción no se puede deshacer.")) return;
    setActionLoading(swapId);
    try {
      const res = await fetch(`/api/admin/swaps/${swapId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Intercambio eliminado");
        await Promise.all([fetchSwaps(), fetchDebts(), fetchChecks()]);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al eliminar");
      }
    } catch { toast.error("Error de conexión"); } finally { setActionLoading(null); }
  }

  return (
    <div className="space-y-4 overflow-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Intercambios de turno</h1>
        <p className="text-gray-500 text-sm mt-1">Solicitudes de intercambio entre empleados</p>
      </div>

      {/* Aprobados que el cuadrante ya no cumple */}
      {broken.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/40">
          <CardContent className="!py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-rose-900">
                  {broken.length === 1
                    ? "Un intercambio aprobado ya no se cumple"
                    : `${broken.length} intercambios aprobados ya no se cumplen`}
                </p>
                <p className="text-xs text-rose-700 mt-0.5">
                  Se aprobaron y se avisó a los dos, pero el cuadrante de esos días se editó después y ya no coincide con lo acordado.
                </p>
                <ul className="mt-2 space-y-1">
                  {broken.map((b) => (
                    <li key={b.id} className="text-xs text-rose-800">
                      <span className="font-semibold">{b.dates.join(", ")} · {b.people}</span> — {b.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coberturas de horas que se quedaron sin el turno del que colgaban */}
      {orphan.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="!py-3">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">
                  {orphan.length === 1
                    ? "Una cobertura de horas se quedó sin su turno"
                    : `${orphan.length} coberturas de horas se quedaron sin su turno`}
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Las horas siguen contando en las deudas, pero el turno del que colgaban ya no está en el cuadrante. Conviene confirmar con ellos si se hicieron.
                </p>
                <ul className="mt-2 space-y-1">
                  {orphan.map((o) => (
                    <li key={o.id} className="text-xs text-amber-900">
                      <span className="font-semibold">{o.dates.join(", ")} · {o.people}</span> — {o.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debt summary */}
      {debts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="!py-3">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-gray-900">Deudas de turnos</span>
            </div>
            <div className="space-y-1.5">
              {debts.filter(d => d.net !== 0).map((d, i) => {
                const debtor = d.net > 0 ? d.personA : d.personB;
                const creditor = d.net > 0 ? d.personB : d.personA;
                const amount = Math.abs(d.net);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: debtor.color }} />
                    <span className="font-semibold text-gray-900">{debtor.name}</span>
                    <span className="text-gray-400">debe</span>
                    <span className="font-bold text-amber-600">{amount}h</span>
                    <span className="text-gray-400">a</span>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: creditor.color }} />
                    <span className="font-semibold text-gray-900">{creditor.name}</span>
                  </div>
                );
              })}
              {debts.every(d => d.net === 0) && (
                <p className="text-xs text-gray-500">Todas las deudas están saldadas</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn("px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex-shrink-0",
              activeTab === tab.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            )}>{tab.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : swaps.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ArrowLeftRight className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500">No hay intercambios</p>
          <p className="text-sm text-gray-400 mt-1">Los empleados pueden solicitar intercambios desde su portal.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {swaps.map((swap) => (
            <Card key={swap.id} className="overflow-hidden">
              <CardContent className="!p-4">
                {/* People + shifts */}
                <div className="flex items-start gap-3">
                  {/* From */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swap.fromPerson.color }} />
                      <span className="text-sm font-semibold text-gray-900 truncate">{swap.fromPerson.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{fmtD(swap.fromDate)} · {swap.fromShiftLabel}</p>
                  </div>

                  <ArrowLeftRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />

                  {/* To */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swap.toPerson.color }} />
                      <span className="text-sm font-semibold text-gray-900 truncate">{swap.toPerson.name}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{fmtD(swap.toDate)} · {swap.toShiftLabel}</p>
                  </div>
                </div>

                {/* Status + Actions */}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100 flex-wrap">
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusColor(swap.status))}>
                    {statusLabel(swap.status)}
                  </span>
                  {(() => {
                    const c = checks.get(swap.id);
                    if (!c || c.check === "unchecked") return null;
                    if (c.check === "broken") return (
                      <span title={c.detail || undefined} className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 px-2.5 py-0.5 text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" /> Ya no se cumple
                      </span>
                    );
                    if (c.check === "orphan") return (
                      <span title={c.detail || undefined} className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-medium">
                        <Clock className="w-3 h-3" /> Horas sin turno
                      </span>
                    );
                    if (c.check === "superseded") return (
                      <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2.5 py-0.5 text-xs font-medium">
                        Anulado por #{c.supersededBySwapId}
                      </span>
                    );
                    return (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 text-cyan-700 px-2.5 py-0.5 text-xs font-medium">
                        <Check className="w-3 h-3" /> En el cuadrante
                      </span>
                    );
                  })()}
                  <span className="text-xs text-gray-400">
                    {new Date(swap.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {swap.reason && <span className="text-xs text-gray-400 italic truncate">"{swap.reason}"</span>}

                  <div className="flex gap-2 ml-auto items-center">
                    {swap.status === "aceptado" && (
                      <>
                        <Button size="sm" onClick={() => handleAction(swap.id, "aprobado")} disabled={actionLoading === swap.id} loading={actionLoading === swap.id}>
                          <Check className="w-3.5 h-3.5" /> Aprobar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleAction(swap.id, "rechazado")} disabled={actionLoading === swap.id}>
                          <X className="w-3.5 h-3.5" /> Rechazar
                        </Button>
                      </>
                    )}
                    {swap.status === "pendiente" && (
                      <Button size="sm" variant="danger" onClick={() => handleAction(swap.id, "cancelado")} disabled={actionLoading === swap.id} loading={actionLoading === swap.id}>
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(swap.id)} disabled={actionLoading === swap.id}
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
