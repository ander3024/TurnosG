"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, Search, Loader2 } from "lucide-react";

interface AuditLog {
  id: number;
  actorId: number | null;
  actor: { id: number; name: string; email: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
}

interface Override {
  id: number;
  date: string;
  shiftTypeId: number;
  personId: number | null;
  slotIndex: number;
  createdAt: string;
  person: { code: string; name: string; color: string } | null;
  shiftType: { label: string; startTime: string; endTime: string; category: string };
}

interface ChangeEntry {
  id: string;
  date: string;
  description: string;
  actor: string;
  changedAt: string;
  source: "Manual" | "Intercambio" | "Sistema";
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSource(action: string, details: any): "Manual" | "Intercambio" | "Sistema" {
  if (action.startsWith("swap:") || details?.source === "intercambio") return "Intercambio";
  if (action === "override" || action === "override:remove") return "Manual";
  return "Sistema";
}

function getSourceColor(source: string) {
  switch (source) {
    case "Manual":
      return "bg-blue-100 text-blue-700";
    case "Intercambio":
      return "bg-purple-100 text-purple-700";
    case "Sistema":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function OverridesPage() {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch people to resolve IDs to names
      const peopleRes = await fetch("/api/admin/people");
      const peopleData = await peopleRes.json();
      const peopleList = Array.isArray(peopleData) ? peopleData : [];
      const personMap = new Map<number, string>();
      for (const p of peopleList) personMap.set(p.id, p.name);

      const auditParams = new URLSearchParams({
        entity: "schedule",
        limit: "200",
      });
      if (dateFrom) auditParams.set("startDate", dateFrom);
      if (dateTo) auditParams.set("endDate", dateTo);

      const res = await fetch(`/api/admin/audit?${auditParams}`);
      const data = await res.json();

      const logs: AuditLog[] = data.items || [];
      const mapped: ChangeEntry[] = logs.map((log) => {
        let details: any = {};
        try {
          details = log.details ? JSON.parse(log.details) : {};
        } catch {
          // ignore parse errors
        }

        const source = getSource(log.action, details);

        let description = "";
        if (log.action === "override") {
          const shift = details.shiftType || "Turno";
          const date = details.date ? formatDate(details.date) : "";
          const personName = details.personName || (details.personId ? (personMap.get(details.personId) || `ID ${details.personId}`) : "vacío");
          description = `Turno de ${shift} del ${date}: asignado a ${personName}`;
        } else if (log.action === "override:remove") {
          description = `Asignación eliminada: ${log.entityId || ""}`;
        } else if (log.action === "swap:approved") {
          const from = details.fromPerson || "?";
          const to = details.toPerson || "?";
          const fromDate = details.fromDate ? formatDate(details.fromDate) : "";
          const toDate = details.toDate ? formatDate(details.toDate) : "";
          const fromShift = details.fromShift || "";
          const toShift = details.toShift || "";
          description = `Intercambio: ${from} (${fromShift} del ${fromDate}) ↔ ${to} (${toShift} del ${toDate})`;
        } else if (log.action === "swap:rejected") {
          const from = details.fromPerson || "?";
          const to = details.toPerson || "?";
          description = `Intercambio rechazado: ${from} ↔ ${to}`;
        } else {
          description = `${log.action}: ${log.entityId || ""}`;
        }

        return {
          id: `audit-${log.id}`,
          date: details.date || log.createdAt.slice(0, 10),
          description,
          actor: log.actor?.name || "Sistema",
          changedAt: log.createdAt,
          source,
        };
      });

      setEntries(mapped);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.description.toLowerCase().includes(q) ||
      e.actor.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Historial de cambios manuales
        </h1>
        <p className="text-gray-500 mt-1">
          Registro de todas las modificaciones de turnos: manuales, intercambios
          y del sistema
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por persona o descripcion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarClock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay cambios registrados</p>
            <p className="text-sm text-gray-400 mt-1">
              Las modificaciones de turnos apareceran aqui cuando se realicen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <Card key={entry.id} className="overflow-hidden">
              <CardContent className="!p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">{entry.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-500">
                        por{" "}
                        <span className="font-medium text-gray-700">
                          {entry.actor}
                        </span>
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateTime(entry.changedAt)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${getSourceColor(
                      entry.source
                    )}`}
                  >
                    {entry.source}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
