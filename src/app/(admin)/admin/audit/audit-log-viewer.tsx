"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Activity, UserCheck, Pencil, Trash2,
  CheckCircle2, XCircle, Calendar, Clock, Shield, Plus, RotateCcw,
  Search,
} from "lucide-react";

interface AuditLogData {
  id: number;
  actorId: number | null;
  actor: { id: number; name: string; email: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: Date;
}

interface Props {
  initialLogs: AuditLogData[];
  totalCount: number;
}

// Translate actions to Spanish with icon and color
const actionConfig: Record<string, { label: string; icon: typeof Activity; variant: "success" | "info" | "warning" | "danger" | "default" }> = {
  create: { label: "Creó", icon: Plus, variant: "success" },
  update: { label: "Editó", icon: Pencil, variant: "info" },
  delete: { label: "Eliminó", icon: Trash2, variant: "danger" },
  approve: { label: "Aprobó", icon: CheckCircle2, variant: "success" },
  reject: { label: "Rechazó", icon: XCircle, variant: "danger" },
  cancel: { label: "Canceló", icon: XCircle, variant: "warning" },
  override: { label: "Override", icon: RotateCcw, variant: "warning" },
  "override:remove": { label: "Quitó override", icon: RotateCcw, variant: "default" },
  migrate: { label: "Migración", icon: Activity, variant: "info" },
  login: { label: "Inició sesión", icon: UserCheck, variant: "default" },
};

function getActionConfig(action: string) {
  // Exact match first
  if (actionConfig[action]) return actionConfig[action];
  // Partial match
  const key = Object.keys(actionConfig).find((k) => action.toLowerCase().includes(k));
  return key ? actionConfig[key] : { label: action, icon: Activity, variant: "default" as const };
}

// Translate entities to Spanish
const entityLabels: Record<string, string> = {
  user: "Usuario",
  person: "Empleado",
  event: "Evento",
  timeoff: "Vacaciones",
  holiday: "Festivo",
  setting: "Configuración",
  shiftType: "Tipo de turno",
  extraHours: "Horas extra",
  schedule: "Turno",
  system: "Sistema",
  swap: "Intercambio",
};

function getEntityLabel(entity: string): string {
  return entityLabels[entity] || entity;
}

// Parse JSON details into readable text
function formatDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const obj = JSON.parse(details);
    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined) continue;
      // Translate common keys
      const labels: Record<string, string> = {
        email: "Email", name: "Nombre", role: "Rol", code: "Código",
        label: "Nombre", startDate: "Desde", endDate: "Hasta",
        date: "Fecha", hours: "Horas", personName: "Persona",
        personId: "Persona", type: "Tipo", newStatus: "Estado",
        person: "Persona", shiftType: "Turno", slotIndex: "Slot",
        source: "Origen", active: "Activo", passwordReset: "Contraseña cambiada",
      };
      const label = labels[key] || key;
      if (key === "passwordReset" && val === true) {
        parts.push("Contraseña cambiada");
      } else if (typeof val === "object") {
        continue; // Skip nested objects
      } else {
        parts.push(`${label}: ${val}`);
      }
    }
    return parts.join(" · ");
  } catch {
    return details.length > 100 ? details.slice(0, 100) + "..." : details;
  }
}

const PAGE_SIZE = 50;

export function AuditLogViewer({ initialLogs, totalCount }: Props) {
  const [logs, setLogs] = useState(initialLogs);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(totalCount);
  const [entityFilter, setEntityFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  async function fetchPage(newPage: number, entity?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: newPage.toString(), limit: PAGE_SIZE.toString() });
      const filter = entity ?? entityFilter;
      if (filter !== "all") params.set("entity", filter);

      const res = await fetch(`/api/admin/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.items || []);
        setCount(data.total || 0);
        setPage(newPage);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleEntityFilter(entity: string) {
    setEntityFilter(entity);
    fetchPage(1, entity);
  }

  // Get unique entity types from current logs for filter
  const entityTypes = [...new Set(logs.map((l) => l.entity))].sort();

  // Filter by search text locally
  const filtered = searchText
    ? logs.filter((l) => {
        const text = searchText.toLowerCase();
        return (
          l.actor?.name?.toLowerCase().includes(text) ||
          l.action.toLowerCase().includes(text) ||
          l.entity.toLowerCase().includes(text) ||
          l.details?.toLowerCase().includes(text) ||
          getEntityLabel(l.entity).toLowerCase().includes(text)
        );
      })
    : logs;

  function timeAgo(d: Date): string {
    const now = new Date();
    const date = new Date(d);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Ahora mismo";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `Hace ${diffD}d`;
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar en el registro..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Entity filter pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => handleEntityFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              entityFilter === "all" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            )}
          >
            Todo ({count})
          </button>
          {["schedule", "timeoff", "user", "person", "event", "holiday", "setting", "extraHours"].map((e) => (
            <button
              key={e}
              onClick={() => handleEntityFilter(e)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                entityFilter === e ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              )}
            >
              {getEntityLabel(e)}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <Card>
        <CardContent className="!p-0">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="py-16 text-center">
              <Activity className="w-14 h-14 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No hay registros</p>
              <p className="text-sm text-gray-400 mt-1">Los cambios en el sistema aparecerán aquí</p>
            </div>
          )}

          {!loading && (
            <div className="divide-y divide-gray-50">
              {filtered.map((log) => {
                const ac = getActionConfig(log.action);
                const Icon = ac.icon;
                const details = formatDetails(log.details);

                return (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                    {/* Icon */}
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                      ac.variant === "success" ? "bg-emerald-50" :
                      ac.variant === "danger" ? "bg-red-50" :
                      ac.variant === "warning" ? "bg-amber-50" :
                      ac.variant === "info" ? "bg-blue-50" : "bg-gray-50"
                    )}>
                      <Icon className={cn(
                        "w-4 h-4",
                        ac.variant === "success" ? "text-emerald-600" :
                        ac.variant === "danger" ? "text-red-500" :
                        ac.variant === "warning" ? "text-amber-600" :
                        ac.variant === "info" ? "text-blue-600" : "text-gray-400"
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {log.actor?.name || "Sistema"}
                        </span>
                        <Badge variant={ac.variant}>{ac.label}</Badge>
                        <span className="text-sm text-gray-600">{getEntityLabel(log.entity)}</span>
                        {log.entityId && <span className="text-xs text-gray-400 font-mono">#{log.entityId}</span>}
                      </div>

                      {details && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate max-w-2xl">{details}</p>
                      )}
                    </div>

                    {/* Time */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">{timeAgo(log.createdAt)}</p>
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {new Date(log.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-500">
                Página {page} de {totalPages} · {count} registros
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => fetchPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </Button>
                <Button variant="ghost" size="sm" disabled={page >= totalPages || loading} onClick={() => fetchPage(page + 1)}>
                  Siguiente <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
