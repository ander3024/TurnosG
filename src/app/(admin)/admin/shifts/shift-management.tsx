"use client";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, X, Check, Clock, Sun, Coffee, Zap, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface ShiftData {
  id: number;
  code: string;
  label: string;
  startTime: string;
  endTime: string;
  lunchMinutes: number;
  category: string;
  active: boolean;
}

interface Props {
  initialShifts: ShiftData[];
}

const categoryConfig: Record<string, { label: string; icon: typeof Clock; color: string; bg: string; border: string }> = {
  regular: { label: "Turnos rotación", icon: Clock, color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
  weekend: { label: "Fin de semana", icon: Sun, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  refuerzo: { label: "Refuerzo", icon: Zap, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  office: { label: "Managers (horario fijo)", icon: Coffee, color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
};

function calcNetHours(start: string, end: string, lunch: number): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm) - lunch;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const emptyForm = { code: "", label: "", startTime: "09:00", endTime: "17:00", lunchMinutes: 0, category: "regular" };

export function ShiftManagement({ initialShifts }: Props) {
  const [shifts, setShifts] = useState(initialShifts);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const toast = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  function startEdit(shift: ShiftData) {
    setEditingId(shift.id);
    setShowCreate(false);
    setForm({
      code: shift.code,
      label: shift.label,
      startTime: shift.startTime,
      endTime: shift.endTime,
      lunchMinutes: shift.lunchMinutes,
      category: shift.category,
    });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowCreate(false);
    setForm(emptyForm);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lunchMinutes: Number(form.lunchMinutes) }),
      });
      if (res.ok) {
        const data = await res.json();
        setShifts([...shifts, data]);
        cancelEdit();
        toast.success("Tipo de turno creado");
      } else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al crear turno"); }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/shifts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lunchMinutes: Number(form.lunchMinutes) }),
      });
      if (res.ok) {
        const data = await res.json();
        setShifts(shifts.map((s) => (s.id === id ? data : s)));
        cancelEdit();
        toast.success("Turno actualizado");
      } else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al actualizar"); }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function toggleActive(id: number, active: boolean) {
    try {
      const res = await fetch(`/api/admin/shifts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) {
        setShifts(shifts.map((s) => (s.id === id ? { ...s, active: !active } : s)));
        toast.success(active ? "Turno desactivado" : "Turno activado");
      } else toast.error("Error al cambiar estado");
    } catch { toast.error("Error de conexión"); }
  }

  // Group by category
  const grouped = shifts.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {} as Record<string, ShiftData[]>);

  const categoryOrder = ["regular", "weekend", "refuerzo", "office"];

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <Button onClick={() => { setShowCreate(true); setEditingId(null); setForm(emptyForm); }}>
          <Plus className="w-4 h-4" />
          Nuevo tipo de turno
        </Button>
      </div>

      {/* Create / Edit Form */}
      {(showCreate || editingId !== null) && (
        <div ref={formRef}><Card className="border-indigo-200 shadow-md">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              {editingId ? "Editar tipo de turno" : "Crear nuevo tipo de turno"}
            </h3>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                editingId ? handleUpdate(editingId) : handleCreate(e);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Código identificador</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="morning, afternoon..."
                    required
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-gray-400">Identificador único del turno</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Nombre del turno</label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Mañana, Tarde..."
                    required
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Categoría</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="regular">Regular (entre semana)</option>
                    <option value="weekend">Fin de semana</option>
                    <option value="refuerzo">Refuerzo / apoyo</option>
                    <option value="office">Manager (horario fijo)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Hora de entrada</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    required
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Hora de salida</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    required
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Minutos de almuerzo</label>
                  <input
                    type="number"
                    value={form.lunchMinutes}
                    onChange={(e) => setForm({ ...form, lunchMinutes: Number(e.target.value) })}
                    min="0"
                    step="5"
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-gray-400">Se descuentan de las horas netas</p>
                </div>
              </div>

              {/* Preview */}
              {form.startTime && form.endTime && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 text-sm">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    Jornada neta: <span className="font-semibold text-gray-900">
                      {calcNetHours(form.startTime, form.endTime, Number(form.lunchMinutes) || 0)}
                    </span>
                  </span>
                  {Number(form.lunchMinutes) > 0 && (
                    <>
                      <UtensilsCrossed className="w-3.5 h-3.5 text-gray-400 ml-2" />
                      <span className="text-gray-500">
                        ({form.lunchMinutes} min almuerzo)
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={saving}>
                  {editingId ? "Guardar cambios" : "Crear turno"}
                </Button>
                <Button type="button" variant="ghost" onClick={cancelEdit}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card></div>
      )}

      {/* Shift cards grouped by category */}
      {categoryOrder.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        const config = categoryConfig[cat] || categoryConfig.regular;
        const Icon = config.icon;

        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bg)}>
                <Icon className={cn("w-4 h-4", config.color)} />
              </div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{config.label}</h2>
              <span className="text-xs text-gray-400">{items.length} turno{items.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((shift) => {
                const netHours = calcNetHours(shift.startTime, shift.endTime, shift.lunchMinutes);
                return (
                  <div
                    key={shift.id}
                    className={cn(
                      "relative rounded-2xl border p-5 transition-all",
                      shift.active ? `${config.bg}/40 ${config.border}` : "bg-gray-50 border-gray-200 opacity-60",
                      editingId === shift.id && "ring-2 ring-indigo-500"
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm",
                          shift.active ? `${config.bg} ${config.color}` : "bg-gray-100 text-gray-400"
                        )}>
                          {shift.code.slice(0, 3).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-base">{shift.label}</h3>
                          <Badge variant={shift.active ? (categoryConfig[shift.category]?.label === "Refuerzo" ? "success" : shift.category === "weekend" ? "warning" : "info") : "default"}>
                            {shift.active ? config.label : "Inactivo"}
                          </Badge>
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(shift)}
                        className="p-2 rounded-lg hover:bg-white/80 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-gray-400 hover:text-indigo-600" />
                      </button>
                    </div>

                    {/* Schedule bar */}
                    <div className="relative mb-4">
                      <div className="flex items-center gap-0 h-10 rounded-xl overflow-hidden bg-white border border-gray-200">
                        {/* Before shift */}
                        <div
                          className="h-full bg-gray-50"
                          style={{ width: `${(parseInt(shift.startTime) / 24) * 100}%` }}
                        />
                        {/* Shift duration */}
                        <div
                          className={cn(
                            "h-full flex items-center justify-center text-xs font-semibold text-white relative",
                            shift.category === "weekend" ? "bg-amber-500" :
                            shift.category === "refuerzo" ? "bg-emerald-500" : "bg-indigo-500"
                          )}
                          style={{
                            width: `${((parseInt(shift.endTime) - parseInt(shift.startTime)) / 24) * 100}%`,
                            minWidth: "60px",
                          }}
                        >
                          {shift.startTime} - {shift.endTime}
                        </div>
                        {/* After shift */}
                        <div className="h-full bg-gray-50 flex-1" />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-white/60">
                        <p className="text-lg font-bold text-gray-900">{netHours}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Netas</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/60">
                        <p className="text-lg font-bold text-gray-900">{shift.startTime}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Entrada</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/60">
                        <p className="text-lg font-bold text-gray-900">{shift.endTime}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Salida</p>
                      </div>
                    </div>

                    {/* Lunch info */}
                    {shift.lunchMinutes > 0 && (
                      <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                        <Coffee className="w-3.5 h-3.5" />
                        <span>{shift.lunchMinutes} min de almuerzo (descontados)</span>
                      </div>
                    )}

                    {/* Active toggle */}
                    <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-200/50">
                      <button
                        onClick={() => toggleActive(shift.id, shift.active)}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          shift.active ? "bg-indigo-600" : "bg-gray-300"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
                            shift.active ? "translate-x-6" : "translate-x-1"
                          )}
                        />
                      </button>
                      <span className="ml-2 text-xs text-gray-500">
                        {shift.active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {shifts.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <Clock className="w-14 h-14 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No hay tipos de turno configurados</p>
            <p className="text-sm text-gray-400 mt-1">Crea el primer tipo de turno para empezar a planificar</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
