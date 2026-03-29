"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, X, User, Save,
  RotateCcw, Plus, Clock, Sun, Moon, Sunrise, Coffee, Palmtree, BedDouble, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface ShiftAssignment {
  date: string; shiftTypeCode: string; shiftTypeLabel: string;
  startTime: string; endTime: string; personId: number | null;
  personCode: string | null; personName: string | null; personColor: string | null;
  slotIndex: number; source: string; hours: number;
}
interface DaySchedule {
  date: string; isWeekend: boolean; isHoliday: boolean; isClosed: boolean;
  holidayLabel: string | null; assignments: ShiftAssignment[];
  events: { label: string }[];
  timeOffs: { personId: number; personCode: string; personName: string; personColor: string; type: string }[];
  offPeople: { personId: number; personCode: string; personName: string; personColor: string }[];
}
interface HoursSummary {
  personId: number; personCode: string; personName: string; personColor: string;
  totalHours: number; targetHours: number; delta: number;
  vacationDaysUsed: number; vacationDaysTotal: number;
}
interface PersonOption { id: number; code: string; name: string; color: string; }
interface ShiftTypeOption { id: number; code: string; label: string; }
interface SwapInfo { id: number; fromPerson: { name: string; color: string }; toPerson: { name: string; color: string }; fromDate: string; toDate: string; fromShiftLabel: string; toShiftLabel: string; status: string }

const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const dayNames = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];

// Shift icon + label helper
function shiftIcon(code: string) {
  if (code === "weekend") return { icon: Sun, label: "Finde", shortLabel: "F", color: "text-amber-600", bg: "bg-amber-50" };
  if (code.includes("afternoon") || code === "afternoon") return { icon: Moon, label: "Tarde", shortLabel: "T", color: "text-indigo-600", bg: "bg-indigo-50" };
  return { icon: Sunrise, label: "Mañana", shortLabel: "M", color: "text-orange-500", bg: "bg-orange-50" };
}

export default function AdminCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [hours, setHours] = useState<HoursSummary[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DaySchedule | null>(null);
  const [swaps, setSwaps] = useState<SwapInfo[]>([]);

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const nc = { cache: "no-store" as const };
      const [s, h, p, st, sw] = await Promise.all([
        fetch(`/api/admin/schedule?from=${from}&to=${to}`, nc).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        fetch(`/api/admin/schedule/hours?from=${year}-01-01&to=${year}-12-31`, nc).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
        fetch("/api/admin/people", nc).then(r => r.json()),
        fetch("/api/admin/shifts", nc).then(r => r.json()),
        fetch("/api/admin/swaps", nc).then(r => r.ok ? r.json() : { items: [] }),
      ]);
      setSchedule(s.schedule || []);
      setHours(h.hours || []);
      setPeople(Array.isArray(p) ? p : []);
      setShiftTypes(Array.isArray(st) ? st : []);
      setSwaps(sw.items || []);
    } catch { /* errors handled by empty state */ } finally { setLoading(false); }
  }, [from, to, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getSwapsForDate(date: string) {
    return swaps.filter(s => (s.fromDate === date || s.toDate === date) && ["pendiente", "aceptado", "aprobado"].includes(s.status));
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }
  function goToday() { setYear(now.getFullYear()); setMonth(now.getMonth()); }

  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.toISOString().slice(0, 10);
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const schedMap = new Map(schedule.map((d) => [d.date, d]));

  async function onScheduleChanged() { await fetchData(); }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendario de Turnos</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Click en un día para ver detalle y editar</p>
        </div>
        <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
      </div>

      {/* Hours Summary - compact horizontal */}
      {hours.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {hours.map((h) => {
            const pct = Math.min(100, (h.totalHours / h.targetHours) * 100);
            return (
              <div key={h.personId} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ backgroundColor: h.personColor }}>
                  {h.personName?.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-gray-900">{h.personName}</span>
                    <span className="text-xs text-gray-400">{Math.round(h.totalHours)}/{h.targetHours}h</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: h.personColor }} />
                  </div>
                  <div className="flex justify-between mt-0.5 text-[10px]">
                    <span className="text-gray-400">Vac: {h.vacationDaysUsed}/{h.vacationDaysTotal}</span>
                    <span className={h.delta >= 0 ? "text-emerald-600" : "text-gray-500"}>{h.delta >= 0 ? "+" : ""}{Math.round(h.delta)}h</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
          <div className="flex items-center gap-2">
            {loading && <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
            <h2 className="text-base font-bold text-gray-900">{monthNames[month]} {year}</h2>
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
        </div>

        {/* ═══ DESKTOP: Grid 7 columns ═══ */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 bg-gray-50/80">
            {dayNames.map((d, i) => (
              <div key={d} className={cn("text-center text-[11px] font-bold tracking-wider py-2", i >= 5 ? "text-amber-600" : "text-gray-500")}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((dateStr, idx) => {
              if (!dateStr) return <div key={idx} className="min-h-[130px] border-b border-r border-gray-100 bg-gray-50/30" />;
              const day = schedMap.get(dateStr);
              const isToday = dateStr === today;
              const dayNum = parseInt(dateStr.split("-")[2]);
              const dow = idx % 7;
              const isWe = dow >= 5;
              const cellSwaps = getSwapsForDate(dateStr);
              const cellPending = cellSwaps.some(s => s.status === "pendiente" || s.status === "aceptado");
              const cellApproved = cellSwaps.some(s => s.status === "aprobado");
              return (
                <div key={idx} onClick={() => day && setSelectedDay(day)} className={cn(
                  "min-h-[130px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-all duration-150 hover:bg-indigo-50/40",
                  isWe && "bg-slate-50/60", day?.isClosed && "bg-rose-50/50", day?.isHoliday && !day?.isClosed && "bg-amber-50/30",
                  isToday && "ring-2 ring-inset ring-indigo-500 bg-indigo-50/20",
                  cellPending && "animate-pulse-subtle ring-1 ring-inset ring-purple-300 bg-purple-50/30",
                  cellApproved && !cellPending && "ring-1 ring-inset ring-cyan-300 bg-cyan-50/20",
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn("text-[11px] font-bold", isToday ? "bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center" : isWe ? "text-amber-700" : "text-gray-800")}>{dayNum}</span>
                    {day?.isClosed && <span className="text-[8px] bg-rose-100 text-rose-600 px-1 py-0.5 rounded font-bold">CERRADO</span>}
                    {day?.isHoliday && !day?.isClosed && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold">FESTIVO</span>}
                  </div>
                  {day?.isHoliday && day.holidayLabel && (
                    <div className={cn("text-[9px] px-1.5 py-0.5 rounded mb-1 truncate font-semibold", day.isClosed ? "bg-rose-100/80 text-rose-700" : "bg-amber-100/80 text-amber-700")}>{day.holidayLabel}</div>
                  )}
                  <div className="space-y-[2px]">
                    {day?.assignments.map((a, i) => { const si = shiftIcon(a.shiftTypeCode); const Icon = si.icon; return (
                      <div key={i} className={cn("flex items-center gap-[3px] rounded-md px-1 py-[2px]", si.bg)}>
                        <Icon className={cn("w-[10px] h-[10px] flex-shrink-0", si.color)} />
                        <span className="text-[10px] font-semibold truncate" style={{ color: a.personColor || "#6b7280" }}>{a.personName}</span>
                        <span className={cn("text-[8px] ml-auto flex-shrink-0 font-bold", si.color)}>{si.shortLabel}</span>
                      </div>
                    ); })}
                    {day?.timeOffs.filter(t => t.type !== "intercambio").map((to, i) => (
                      <div key={`v${i}`} className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-emerald-50">
                        <Palmtree className="w-[10px] h-[10px] text-emerald-500 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-emerald-700 truncate">{to.personName}</span>
                        <span className="text-[8px] ml-auto text-emerald-500 font-bold flex-shrink-0">VAC</span>
                      </div>
                    ))}
                    {day?.timeOffs.filter(t => t.type === "intercambio").map((to, i) => (
                      <div key={`si${i}`} className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-cyan-50">
                        <ArrowLeftRight className="w-[10px] h-[10px] text-cyan-500 flex-shrink-0" />
                        <span className="text-[10px] font-semibold text-cyan-700 truncate">{to.personName}</span>
                        <span className="text-[8px] ml-auto text-cyan-500 font-bold flex-shrink-0">LIB</span>
                      </div>
                    ))}
                    {day?.offPeople?.map((op, i) => (
                      <div key={`o${i}`} className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-gray-50">
                        <BedDouble className="w-[10px] h-[10px] text-gray-400 flex-shrink-0" />
                        <span className="text-[10px] font-medium text-gray-400 truncate">{op.personName}</span>
                        <span className="text-[8px] ml-auto text-gray-400 font-bold flex-shrink-0">LIB</span>
                      </div>
                    ))}
                    {cellSwaps.map((sw, i) => (
                      <div key={`sw${i}`} className={cn("flex items-center gap-[3px] rounded-md px-1 py-[2px] mt-0.5",
                        sw.status === "aprobado" ? "bg-cyan-50 border border-cyan-200" : "bg-purple-50 border border-purple-200"
                      )}>
                        <ArrowLeftRight className={cn("w-[10px] h-[10px] flex-shrink-0", sw.status === "aprobado" ? "text-cyan-500" : "text-purple-500")} />
                        <span className="text-[9px] font-semibold truncate" style={{ color: sw.fromPerson.color }}>{sw.fromPerson.name.split(" ")[0]}</span>
                        <span className="text-[9px] text-gray-300">↔</span>
                        <span className="text-[9px] font-semibold truncate" style={{ color: sw.toPerson.color }}>{sw.toPerson.name.split(" ")[0]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ MOBILE: Day list view ═══ */}
        <div className="md:hidden divide-y divide-gray-100">
          {schedule.map((day) => {
            const dt = new Date(day.date + "T12:00:00");
            const dayLabel = dt.toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50",
                  isToday && "bg-indigo-50/30 border-l-4 border-l-indigo-500",
                  day.isClosed && "bg-rose-50/30",
                  day.isHoliday && !day.isClosed && "bg-amber-50/20"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Date */}
                  <div className={cn("w-12 text-center flex-shrink-0", isToday ? "text-indigo-600" : "text-gray-500")}>
                    <div className="text-lg font-bold leading-none">{dt.getDate()}</div>
                    <div className="text-[10px] uppercase font-semibold">{dayLabel.split(" ")[0]}</div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                    {day.isClosed && <span className="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold">CERRADO</span>}
                    {day.isHoliday && day.holidayLabel && !day.isClosed && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{day.holidayLabel}</span>
                    )}
                    {day.assignments.map((a, i) => {
                      const si = shiftIcon(a.shiftTypeCode);
                      const Icon = si.icon;
                      return (
                        <span key={i} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", si.bg)}>
                          <Icon className={cn("w-3 h-3", si.color)} />
                          <span style={{ color: a.personColor || "#6b7280" }}>{a.personName}</span>
                        </span>
                      );
                    })}
                    {day.timeOffs.filter(t => t.type !== "intercambio").map((to, i) => (
                      <span key={`v${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                        <Palmtree className="w-3 h-3" /> {to.personName}
                      </span>
                    ))}
                    {day.timeOffs.filter(t => t.type === "intercambio").map((to, i) => (
                      <span key={`si${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-50 text-cyan-700">
                        <ArrowLeftRight className="w-3 h-3" /> {to.personName} (intercambio)
                      </span>
                    ))}
                    {day.offPeople?.map((op, i) => (
                      <span key={`o${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400">
                        <BedDouble className="w-3 h-3" /> {op.personName}
                      </span>
                    ))}
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] sm:text-[11px] text-gray-500 px-1">
        <div className="flex items-center gap-1.5"><Sunrise className="w-3.5 h-3.5 text-orange-500" /><span className="font-medium">Mañana</span> 08:00-17:30</div>
        <div className="flex items-center gap-1.5"><Moon className="w-3.5 h-3.5 text-indigo-600" /><span className="font-medium">Tarde</span> 14:00-22:00</div>
        <div className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-amber-600" /><span className="font-medium">Finde</span> 10:00-22:00</div>
        <div className="flex items-center gap-1.5"><Palmtree className="w-3.5 h-3.5 text-emerald-500" /><span className="font-medium">Vacaciones</span></div>
        <div className="flex items-center gap-1.5"><BedDouble className="w-3.5 h-3.5 text-gray-400" /><span className="font-medium">Libra</span></div>
        <div className="border-l border-gray-200 pl-4 flex items-center gap-3">
          {hours.map((h) => (
            <div key={h.personId} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.personColor }} />
              <span className="font-medium">{h.personName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day Detail Modal */}
      {selectedDay && (
        <DayEditModal
          day={selectedDay} people={people} shiftTypes={shiftTypes}
          onClose={() => setSelectedDay(null)} onSaved={onScheduleChanged}
        />
      )}
    </div>
  );
}

// ─── DAY EDIT MODAL ────────────────────────────────────────
function DayEditModal({ day, people, shiftTypes, onClose, onSaved }: {
  day: DaySchedule; people: PersonOption[]; shiftTypes: ShiftTypeOption[];
  onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [showExtraHours, setShowExtraHours] = useState(false);
  const [ehForm, setEhForm] = useState({ personId: "", hours: "", comment: "" });
  const [ehSaving, setEhSaving] = useState(false);
  const [showAddShift, setShowAddShift] = useState(false);
  const [addForm, setAddForm] = useState({ shiftTypeId: "", personId: "" });
  const toast = useToast();

  async function handleOverride(shiftTypeCode: string, slotIndex: number, newPersonId: number | null) {
    const st = shiftTypes.find((s) => s.code === shiftTypeCode);
    if (!st) return;
    setSaving(`${shiftTypeCode}-${slotIndex}`);
    try {
      const res = await fetch("/api/admin/schedule/override", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.date, shiftTypeId: st.id, personId: newPersonId, slotIndex }),
      });
      if (res.ok) { toast.success("Asignación guardada"); onSaved(); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al guardar"); }
    } catch { toast.error("Error de conexión"); } finally { setSaving(null); }
  }

  async function handleRemoveOverride(shiftTypeCode: string, slotIndex: number) {
    const st = shiftTypes.find((s) => s.code === shiftTypeCode);
    if (!st || !confirm("¿Eliminar override y volver a rotación automática?")) return;
    setSaving(`del-${shiftTypeCode}-${slotIndex}`);
    try {
      const res = await fetch(`/api/admin/schedule/override?date=${day.date}&shiftTypeId=${st.id}&slotIndex=${slotIndex}`, { method: "DELETE" });
      if (res.ok) { toast.success("Override eliminado"); onSaved(); }
      else toast.error("Error al eliminar override");
    } catch { toast.error("Error de conexión"); } finally { setSaving(null); }
  }

  async function handleAddExtraHours(e: React.FormEvent) {
    e.preventDefault(); setEhSaving(true);
    try {
      const res = await fetch("/api/admin/extra-hours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: parseInt(ehForm.personId), date: day.date, hours: parseFloat(ehForm.hours), comment: ehForm.comment || null }),
      });
      if (res.ok) { toast.success("Horas extra añadidas"); setEhForm({ personId: "", hours: "", comment: "" }); setShowExtraHours(false); onSaved(); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al añadir horas"); }
    } catch { toast.error("Error de conexión"); } finally { setEhSaving(false); }
  }

  async function handleAddShift(e: React.FormEvent) {
    e.preventDefault();
    const st = shiftTypes.find((s) => s.id === parseInt(addForm.shiftTypeId));
    if (!st) return;
    setSaving("add");
    try {
      const existing = day.assignments.filter((a) => a.shiftTypeCode === st.code);
      const nextSlot = existing.length > 0 ? Math.max(...existing.map((a) => a.slotIndex)) + 1 : 0;
      const res = await fetch("/api/admin/schedule/override", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day.date, shiftTypeId: parseInt(addForm.shiftTypeId), personId: addForm.personId ? parseInt(addForm.personId) : null, slotIndex: nextSlot }),
      });
      if (res.ok) { toast.success("Turno añadido"); setShowAddShift(false); setAddForm({ shiftTypeId: "", personId: "" }); onSaved(); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al añadir turno"); }
    } catch { toast.error("Error de conexión"); } finally { setSaving(null); }
  }

  const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-2 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 capitalize">{dateLabel}</h3>
              <div className="flex gap-1.5 mt-1">
                {day.isWeekend && <Badge variant="info">Fin de semana</Badge>}
                {day.isHoliday && <Badge variant="warning">{day.holidayLabel || "Festivo"}</Badge>}
                {day.isClosed && <Badge variant="danger">Cerrado</Badge>}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Assignments */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Turnos asignados</h4>
            {day.assignments.length === 0 && !day.isClosed && <p className="text-sm text-gray-400 py-2">Sin turnos este día</p>}
            <div className="space-y-2">
              {day.assignments.map((a, i) => {
                const si = shiftIcon(a.shiftTypeCode);
                const Icon = si.icon;
                const key = `${a.shiftTypeCode}-${a.slotIndex}`;
                return (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl bg-gray-50/80">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", si.bg)}>
                        <Icon className={cn("w-5 h-5", si.color)} />
                      </div>
                      <div className="w-20 flex-shrink-0">
                        <p className="text-xs font-bold text-gray-900">{a.shiftTypeLabel}</p>
                        <p className="text-[10px] text-gray-400">{a.startTime}-{a.endTime} ({a.hours}h)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-1">
                      <select
                        value={a.personId || ""}
                        onChange={(e) => handleOverride(a.shiftTypeCode, a.slotIndex, e.target.value ? parseInt(e.target.value) : null)}
                        disabled={!!saving}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 bg-white"
                      >
                        <option value="">Sin asignar</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <Badge variant={a.source === "override" ? "warning" : a.source === "event" ? "info" : "default"} className="flex-shrink-0">
                        {a.source === "override" ? "Manual" : a.source === "event" ? "Evento" : "Auto"}
                      </Badge>
                      {a.source === "override" && (
                        <button onClick={() => handleRemoveOverride(a.shiftTypeCode, a.slotIndex)} disabled={!!saving} className="p-1.5 hover:bg-amber-50 rounded-lg" title="Volver a auto">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                        </button>
                      )}
                      {saving === key && <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* No trabajan */}
          {((day.offPeople?.length || 0) > 0 || day.timeOffs.length > 0) && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">No trabajan</h4>
              <div className="space-y-1.5">
                {day.offPeople?.map((op, i) => (
                  <div key={`o${i}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50">
                    <BedDouble className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-500">{op.personName}</span>
                    <Badge className="ml-auto">Libra</Badge>
                  </div>
                ))}
                {day.timeOffs.map((to, i) => (
                  <div key={`v${i}`} className={cn("flex items-center gap-3 p-2.5 rounded-xl", to.type === "intercambio" ? "bg-cyan-50" : "bg-emerald-50")}>
                    {to.type === "intercambio" ? <ArrowLeftRight className="w-4 h-4 text-cyan-500" /> : <Palmtree className="w-4 h-4 text-emerald-500" />}
                    <span className={cn("text-sm font-medium", to.type === "intercambio" ? "text-cyan-700" : "text-emerald-700")}>{to.personName}</span>
                    <Badge variant={to.type === "intercambio" ? "info" : "success"} className="ml-auto">
                      {to.type === "intercambio" ? "Intercambio" : to.type === "vacaciones" ? "Vacaciones" : to.type === "enfermedad" ? "Baja" : "Ausencia"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events */}
          {day.events.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Eventos</h4>
              {day.events.map((ev, i) => <div key={i} className="p-2 rounded-lg bg-purple-50 text-sm text-purple-700 font-medium">{ev.label}</div>)}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {!showAddShift && <Button variant="outline" size="sm" onClick={() => setShowAddShift(true)}><Plus className="w-3.5 h-3.5" /> Turno extra</Button>}
            {!showExtraHours && <Button variant="outline" size="sm" onClick={() => setShowExtraHours(true)}><Clock className="w-3.5 h-3.5" /> Horas extra</Button>}
          </div>

          {showAddShift && (
            <form onSubmit={handleAddShift} className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-3">
              <h4 className="text-sm font-semibold text-indigo-900">Nuevo turno</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={addForm.shiftTypeId} onChange={(e) => setAddForm({ ...addForm, shiftTypeId: e.target.value })} required className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Tipo de turno...</option>
                  {shiftTypes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={addForm.personId} onChange={(e) => setAddForm({ ...addForm, personId: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Persona...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={saving === "add"}><Save className="w-3.5 h-3.5" /> Guardar</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddShift(false)}>Cancelar</Button>
              </div>
            </form>
          )}

          {showExtraHours && (
            <form onSubmit={handleAddExtraHours} className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 space-y-3">
              <h4 className="text-sm font-semibold text-emerald-900">Horas extra</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={ehForm.personId} onChange={(e) => setEhForm({ ...ehForm, personId: e.target.value })} required className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Persona...</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" step="0.5" min="0.5" value={ehForm.hours} onChange={(e) => setEhForm({ ...ehForm, hours: e.target.value })} required placeholder="Horas" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <input type="text" value={ehForm.comment} onChange={(e) => setEhForm({ ...ehForm, comment: e.target.value })} placeholder="Motivo..." className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={ehSaving} className="!bg-emerald-600 hover:!bg-emerald-700"><Save className="w-3.5 h-3.5" /> Guardar</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowExtraHours(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
