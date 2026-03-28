"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Calendar, ShoppingBag, Sparkles, Check, X, Settings, Zap,
  TreePine, Sun, Gift, Tag, ChevronLeft,
} from "lucide-react";
import Link from "next/link";

interface PeriodConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weekdaysExtra: number;
  weekendExtra: number;
  intensity: "high" | "medium" | "low";
  dateRange: { start: string; end: string };
}

interface Proposal {
  periodId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  weekdaysExtraSlots: number;
  weekendExtraSlots: number;
  intensity: "high" | "medium" | "low";
  alreadyExists: boolean;
}

const intensityConfig = {
  high: { label: "Alta demanda", color: "bg-red-100 text-red-700", icon: Zap },
  medium: { label: "Demanda media", color: "bg-amber-100 text-amber-700", icon: ShoppingBag },
  low: { label: "Baja demanda", color: "bg-blue-100 text-blue-700", icon: Tag },
};

const periodIcons: Record<string, typeof Calendar> = {
  rebajas_invierno: Tag,
  semana_santa: Sun,
  rebajas_verano: Sun,
  black_friday: Zap,
  navidad: TreePine,
  reyes: Gift,
};

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export default function CommercialEventsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState<PeriodConfig[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    fetchData();
  }, [year]);

  async function fetchData() {
    setLoading(true);
    setApplied(false);
    try {
      const res = await fetch(`/api/admin/events/generate?year=${year}`);
      if (res.ok) {
        const data = await res.json();
        setPeriods(data.periods || []);
        setProposals(data.proposals || []);
        // Pre-select all that don't exist yet
        const sel = new Set<string>();
        for (const p of data.proposals || []) {
          if (!p.alreadyExists) sel.add(p.periodId);
        }
        setSelected(sel);
      }
    } finally {
      setLoading(false);
    }
  }

  async function togglePeriod(id: string, enabled: boolean) {
    const updated = periods.map((p) => (p.id === id ? { ...p, enabled } : p));
    setPeriods(updated);

    // Build config object
    const config: Record<string, { enabled: boolean; weekdaysExtra: number; weekendExtra: number }> = {};
    for (const p of updated) {
      config[p.id] = { enabled: p.enabled, weekdaysExtra: p.weekdaysExtra, weekendExtra: p.weekendExtra };
    }

    setSaving(true);
    await fetch("/api/admin/events/generate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    fetchData();
  }

  async function updateExtra(id: string, field: "weekdaysExtra" | "weekendExtra", value: number) {
    const updated = periods.map((p) => (p.id === id ? { ...p, [field]: value } : p));
    setPeriods(updated);

    const config: Record<string, { enabled: boolean; weekdaysExtra: number; weekendExtra: number }> = {};
    for (const p of updated) {
      config[p.id] = { enabled: p.enabled, weekdaysExtra: p.weekdaysExtra, weekendExtra: p.weekendExtra };
    }

    setSaving(true);
    await fetch("/api/admin/events/generate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    fetchData();
  }

  function toggleSelection(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }

  async function applySelected() {
    setApplying(true);
    const events = proposals.filter((p) => selected.has(p.periodId) && !p.alreadyExists);
    const res = await fetch("/api/admin/events/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events, year }),
    });
    if (res.ok) {
      setApplied(true);
      fetchData();
    }
    setApplying(false);
  }

  const newProposals = proposals.filter((p) => !p.alreadyExists);
  const existingProposals = proposals.filter((p) => p.alreadyExists);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/admin/events" className="text-gray-400 hover:text-gray-600">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Eventos Comerciales</h1>
          </div>
          <p className="text-gray-500 text-sm">Genera automáticamente los periodos de alta demanda para {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear(year - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">{year - 1}</button>
          <span className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-bold">{year}</span>
          <button onClick={() => setYear(year + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">{year + 1}</button>
        </div>
      </div>

      {/* Period Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <Settings className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Periodos comerciales</h2>
              <p className="text-sm text-gray-500">Activa los que apliquen y ajusta los refuerzos</p>
            </div>
            {saving && <div className="ml-auto w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
          </div>
        </CardHeader>
        <CardContent className="!p-0">
          <div className="divide-y divide-gray-50">
            {periods.map((period) => {
              const Icon = periodIcons[period.id] || Calendar;
              const ic = intensityConfig[period.intensity];
              return (
                <div key={period.id} className={cn("px-5 py-4 transition-colors", !period.enabled && "opacity-50")}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", ic.color.split(" ")[0])}>
                      <Icon className={cn("w-5 h-5", ic.color.split(" ")[1])} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{period.name}</p>
                        <Badge className={ic.color}>{ic.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{period.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(period.dateRange.start)} → {formatDate(period.dateRange.end)}
                      </p>
                    </div>

                    {/* Refuerzo controls */}
                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0 flex-wrap">
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 mb-1">Extra L-J</p>
                        <select
                          value={period.weekdaysExtra}
                          onChange={(e) => updateExtra(period.id, "weekdaysExtra", parseInt(e.target.value))}
                          className="w-14 rounded-lg border border-gray-200 px-1 py-1 text-sm text-center"
                        >
                          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>+{n}</option>)}
                        </select>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 mb-1">Extra S-D</p>
                        <select
                          value={period.weekendExtra}
                          onChange={(e) => updateExtra(period.id, "weekendExtra", parseInt(e.target.value))}
                          className="w-14 rounded-lg border border-gray-200 px-1 py-1 text-sm text-center"
                        >
                          {[0, 1, 2].map((n) => <option key={n} value={n}>+{n}</option>)}
                        </select>
                      </div>

                      {/* Toggle */}
                      <button
                        onClick={() => togglePeriod(period.id, !period.enabled)}
                        className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors", period.enabled ? "bg-indigo-600" : "bg-gray-300")}
                      >
                        <span className={cn("inline-block h-5 w-5 rounded-full bg-white transition-transform shadow-sm", period.enabled ? "translate-x-6" : "translate-x-1")} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Proposals */}
      {!loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Propuesta para {year}</h2>
                  <p className="text-sm text-gray-500">
                    {newProposals.length > 0
                      ? `${newProposals.length} eventos nuevos para crear`
                      : "Todos los eventos ya están creados"}
                  </p>
                </div>
              </div>
              {newProposals.length > 0 && !applied && (
                <Button onClick={applySelected} loading={applying} disabled={selected.size === 0}>
                  <Check className="w-4 h-4" />
                  Crear {selected.size} evento{selected.size !== 1 ? "s" : ""}
                </Button>
              )}
              {applied && <Badge variant="success">Eventos creados correctamente</Badge>}
            </div>
          </CardHeader>
          <CardContent className="!p-0">
            {proposals.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">No hay periodos activos para generar eventos</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {proposals.map((p) => {
                  const ic = intensityConfig[p.intensity];
                  const Icon = periodIcons[p.periodId] || Calendar;
                  const isSelected = selected.has(p.periodId);
                  return (
                    <div
                      key={p.periodId}
                      onClick={() => !p.alreadyExists && toggleSelection(p.periodId)}
                      className={cn(
                        "flex items-center gap-4 px-5 py-4 transition-colors",
                        p.alreadyExists ? "opacity-50" : "cursor-pointer hover:bg-gray-50",
                        isSelected && !p.alreadyExists && "bg-indigo-50/50"
                      )}
                    >
                      {/* Checkbox */}
                      {!p.alreadyExists ? (
                        <div className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                          isSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                        )}>
                          {isSelected && <Check className="w-4 h-4 text-white" />}
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Check className="w-4 h-4 text-emerald-600" />
                        </div>
                      )}

                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", ic.color.split(" ")[0])}>
                        <Icon className={cn("w-4 h-4", ic.color.split(" ")[1])} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(p.startDate)} → {formatDate(p.endDate)}
                          {" · "}L-J: +{p.weekdaysExtraSlots} · S-D: +{p.weekendExtraSlots}
                        </p>
                      </div>

                      {p.alreadyExists ? (
                        <Badge variant="default">Ya existe</Badge>
                      ) : (
                        <Badge className={ic.color}>{ic.label}</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
