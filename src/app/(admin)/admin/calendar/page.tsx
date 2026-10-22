"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Calendar as CalIcon, X, User, Save,
  RotateCcw, Plus, Clock, Sun, Moon, Sunrise, Coffee, Palmtree, BedDouble, ArrowLeftRight,
  AlertTriangle, Check,
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
  timeOffs: { personId: number; personCode: string; personName: string; personColor: string; type: string; startTime?: string | null; endTime?: string | null }[];
  offPeople: { personId: number; personCode: string; personName: string; personColor: string }[];
}
interface HoursSummary {
  personId: number; personCode: string; personName: string; personColor: string;
  totalHours: number; targetHours: number; delta: number;
  vacationDaysUsed: number; vacationDaysTotal: number;
}
/** Un intercambio resumido, con si el cuadrante lo sigue cumpliendo. */
interface SwapNote {
  swapId: number;
  kind: "partial" | "cover" | "swap";
  status: "ok" | "broken" | "orphan" | "superseded" | "unchecked";
  people: string;
  dates: string[];
  shift: string;
  detail: string | null;
  supersededBySwapId?: number | null;
}
interface OverridePreview {
  date: string;
  dayChanges: { label: string; before: string; after: string }[];
  hourDeltas: { personId: number; personName: string; personColor: string; before: number; after: number; delta: number }[];
  otherDaysChanged: number;
  otherDaysSample: string[];
  noEffect: boolean;
  swapsOnDay: SwapNote[];
  swapsBroken: SwapNote[];
  swapsOrphaned: SwapNote[];
  swapsRestored: SwapNote[];
}
interface ScheduleState { schedule: DaySchedule[]; hours: HoursSummary[] }
/** Cambio propuesto, pendiente de que el admin lo confirme. */
interface ProposedChange {
  key: string;
  action: "set" | "remove";
  label: string;
  shiftTypeId: number;
  slotIndex: number;
  personId: number | null;
  personName: string;
  loading: boolean;
  preview: OverridePreview | null;
  error: string | null;
  saving: boolean;
}
interface PersonOption { id: number; code: string; name: string; color: string; }
interface ShiftTypeOption { id: number; code: string; label: string; }
/** Fila de GET /api/admin/schedule/swaps: el intercambio + su comprobación. */
interface SwapInfo {
  id: number; status: string; kind: "partial" | "cover" | "swap";
  fromDate: string; toDate: string; fromShiftLabel: string; toShiftLabel: string;
  fromPerson: { id: number; name: string; color: string };
  toPerson: { id: number; name: string; color: string };
  hours: number | null;
  people: string; shift: string;
  /** ok · broken = ya no se cumple · orphan = cobertura sin su turno · superseded = anulado por otro · unchecked = aún no obliga */
  check: "ok" | "broken" | "orphan" | "superseded" | "unchecked";
  detail: string | null;
  supersededBySwapId?: number | null;
}

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<SwapInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        // Los intercambios del mes YA comprobados contra el cuadrante: así se
        // ve cuáles siguen cumpliéndose. (El listado general viene paginado a
        // 50, así que para el calendario se dejaban fuera los más antiguos.)
        fetch(`/api/admin/schedule/swaps?from=${from}&to=${to}`, nc).then(r => r.ok ? r.json() : { items: [] }),
      ]);
      setSchedule(s.schedule || []);
      setHours(h.hours || []);
      setPeople(Array.isArray(p) ? p : []);
      setShiftTypes(Array.isArray(st) ? st : []);
      setSwaps(sw.items || []);
      setLoadError(null);
      return true;
    } catch {
      // Un fallo al refrescar deja la pantalla con los datos de antes, que es
      // justo lo que parece un cambio que no se ha guardado: hay que decirlo.
      setLoadError("No he podido leer el cuadrante del servidor. Lo que ves puede estar desactualizado: recarga la página.");
      return false;
    } finally { setLoading(false); }
  }, [from, to, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function getSwapsForDate(date: string) {
    return swaps.filter(s => s.fromDate === date || s.toDate === date);
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
  // Derived, never a snapshot: after saving, fetchData() refreshes `schedule` and the
  // open modal re-renders with the new assignments instead of the ones it opened with.
  const selectedDay = selectedDate ? schedMap.get(selectedDate) ?? null : null;

  // El guardado ya devuelve el cuadrante recalculado: un solo viaje y sin
  // ventana en la que la pantalla y el servidor puedan no coincidir.
  async function onScheduleChanged(state?: ScheduleState | null) {
    if (state?.schedule && state?.hours) {
      setSchedule(state.schedule);
      setHours(state.hours);
      setLoadError(null);
      return true;
    }
    return await fetchData();
  }

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

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-900">Datos sin refrescar</p>
            <p className="text-xs text-rose-700 mt-0.5">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchData()}>Reintentar</Button>
        </div>
      )}

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
              const cellBroken = cellSwaps.some(s => s.check === "broken");
              const cellOrphan = cellSwaps.some(s => s.check === "orphan");
              return (
                <div key={idx} onClick={() => day && setSelectedDate(day.date)} className={cn(
                  "min-h-[130px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-all duration-150 hover:bg-indigo-50/40",
                  isWe && "bg-slate-50/60", day?.isClosed && "bg-rose-50/50", day?.isHoliday && !day?.isClosed && "bg-amber-50/30",
                  isToday && "ring-2 ring-inset ring-indigo-500 bg-indigo-50/20",
                  cellPending && "animate-pulse-subtle ring-1 ring-inset ring-purple-300 bg-purple-50/30",
                  cellApproved && !cellPending && "ring-1 ring-inset ring-cyan-300 bg-cyan-50/20",
                  cellBroken && "ring-2 ring-inset ring-rose-400 bg-rose-50/40",
                  cellOrphan && !cellBroken && "ring-2 ring-inset ring-amber-400 bg-amber-50/30",
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
                    {day?.timeOffs.filter(t => t.type !== "intercambio").map((to, i) => {
                      const isCita = to.type === "cita_medica";
                      return (
                        <div key={`v${i}`} className={cn("flex items-center gap-[3px] rounded-md px-1 py-[2px]", isCita ? "bg-rose-50" : "bg-emerald-50")}>
                          <Palmtree className={cn("w-[10px] h-[10px] flex-shrink-0", isCita ? "text-rose-500" : "text-emerald-500")} />
                          <span className={cn("text-[10px] font-semibold truncate", isCita ? "text-rose-700" : "text-emerald-700")}>{to.personName}</span>
                          <span className={cn("text-[8px] ml-auto font-bold flex-shrink-0", isCita ? "text-rose-500" : "text-emerald-500")}>{isCita ? "CM" : "VAC"}</span>
                        </div>
                      );
                    })}
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
                      <div key={`sw${i}`} title={sw.detail || undefined} className={cn("flex items-center gap-[3px] rounded-md px-1 py-[2px] mt-0.5",
                        sw.check === "broken" ? "bg-rose-50 border border-rose-300"
                          : sw.check === "orphan" ? "bg-amber-50 border border-amber-300"
                          : sw.check === "superseded" ? "bg-gray-50 border border-gray-200"
                          : sw.status === "aprobado" ? "bg-cyan-50 border border-cyan-200"
                          : "bg-purple-50 border border-purple-200"
                      )}>
                        {sw.check === "broken" || sw.check === "orphan"
                          ? <AlertTriangle className={cn("w-[10px] h-[10px] flex-shrink-0", sw.check === "broken" ? "text-rose-500" : "text-amber-500")} />
                          : <ArrowLeftRight className={cn("w-[10px] h-[10px] flex-shrink-0",
                              sw.check === "superseded" ? "text-gray-400" : sw.status === "aprobado" ? "text-cyan-500" : "text-purple-500")} />}
                        <span className="text-[9px] font-semibold truncate" style={{ color: sw.fromPerson.color }}>{sw.fromPerson.name.split(" ")[0]}</span>
                        <span className="text-[9px] text-gray-300">↔</span>
                        <span className="text-[9px] font-semibold truncate" style={{ color: sw.toPerson.color }}>{sw.toPerson.name.split(" ")[0]}</span>
                        {sw.check === "broken" && <span className="text-[8px] ml-auto font-bold text-rose-600 flex-shrink-0">ROTO</span>}
                        {sw.check === "orphan" && <span className="text-[8px] ml-auto font-bold text-amber-600 flex-shrink-0">{sw.hours}h?</span>}
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
                onClick={() => setSelectedDate(day.date)}
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
                    {day.timeOffs.filter(t => t.type !== "intercambio").map((to, i) => {
                      const isCita = to.type === "cita_medica";
                      return (
                        <span key={`v${i}`} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", isCita ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>
                          <Palmtree className="w-3 h-3" /> {to.personName}{isCita && to.startTime && to.endTime ? ` ${to.startTime}-${to.endTime}` : ""}
                        </span>
                      );
                    })}
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
                    {getSwapsForDate(day.date).map((sw) => (
                      <span key={`sw${sw.id}`} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                        sw.check === "broken" ? "bg-rose-50 text-rose-700"
                          : sw.check === "orphan" ? "bg-amber-50 text-amber-700"
                          : sw.check === "superseded" ? "bg-gray-100 text-gray-500"
                          : sw.status === "aprobado" ? "bg-cyan-50 text-cyan-700"
                          : "bg-purple-50 text-purple-700")}>
                        {sw.check === "broken" || sw.check === "orphan" ? <AlertTriangle className="w-3 h-3" /> : <ArrowLeftRight className="w-3 h-3" />}
                        {sw.people}{sw.check === "broken" ? " (roto)" : sw.check === "orphan" ? ` (${sw.hours}h sin turno)` : ""}
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
          day={selectedDay} range={{ from, to }} people={people} shiftTypes={shiftTypes}
          swaps={getSwapsForDate(selectedDay.date)}
          onClose={() => setSelectedDate(null)} onSaved={onScheduleChanged}
        />
      )}
    </div>
  );
}

// ─── DAY EDIT MODAL ────────────────────────────────────────
function DayEditModal({ day, range, people, shiftTypes, swaps, onClose, onSaved }: {
  day: DaySchedule; range: { from: string; to: string };
  people: PersonOption[]; shiftTypes: ShiftTypeOption[]; swaps: SwapInfo[];
  onClose: () => void; onSaved: (state?: ScheduleState | null) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  // Cambio elegido pero no confirmado: mientras existe, el <select> muestra la
  // persona elegida y el panel de abajo explica lo que va a pasar.
  const [change, setChange] = useState<ProposedChange | null>(null);
  const [showExtraHours, setShowExtraHours] = useState(false);
  const [ehForm, setEhForm] = useState({ personId: "", hours: "", comment: "" });
  const [ehSaving, setEhSaving] = useState(false);
  const [showAddShift, setShowAddShift] = useState(false);
  const [addForm, setAddForm] = useState({ shiftTypeId: "", personId: "" });
  const toast = useToast();

  /**
   * Nada se guarda al elegir: primero se le pide al motor que simule el cambio
   * sobre el año completo, porque un turno arrastra a los demás (quien lo
   * pierde, quien hereda el refuerzo, las horas de todos).
   */
  async function proposeChange(opts: {
    action: "set" | "remove"; label: string; shiftTypeId: number;
    slotIndex: number; personId: number | null; personName: string;
  }) {
    const key = `${opts.shiftTypeId}-${opts.slotIndex}-${opts.action}`;
    setChange({ ...opts, key, loading: true, preview: null, error: null, saving: false });
    try {
      const res = await fetch("/api/admin/schedule/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: opts.action, date: day.date,
          shiftTypeId: opts.shiftTypeId, slotIndex: opts.slotIndex, personId: opts.personId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setChange((c) => c && c.key === key ? { ...c, loading: false, error: err.error || "No he podido calcular el efecto del cambio." } : c);
        return;
      }
      const preview: OverridePreview = await res.json();
      setChange((c) => c && c.key === key ? { ...c, loading: false, preview } : c);
    } catch {
      setChange((c) => c && c.key === key ? { ...c, loading: false, error: "Error de conexión al calcular el cambio." } : c);
    }
  }

  /** Confirmado: se escribe y se pinta el cuadrante que devuelve el guardado. */
  async function commitChange() {
    if (!change || change.saving) return;
    setChange({ ...change, saving: true });
    setSaving(change.key);
    const q = `from=${range.from}&to=${range.to}`;
    try {
      const res = change.action === "remove"
        ? await fetch(`/api/admin/schedule/override?date=${day.date}&shiftTypeId=${change.shiftTypeId}&slotIndex=${change.slotIndex}&${q}`, { method: "DELETE" })
        : await fetch("/api/admin/schedule/override", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: day.date, shiftTypeId: change.shiftTypeId, personId: change.personId,
              slotIndex: change.slotIndex, from: range.from, to: range.to,
            }),
          });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al guardar");
        setChange((c) => c ? { ...c, saving: false } : c);
        return;
      }
      const body = await res.json().catch(() => null);
      const ok = await onSaved(body && body.schedule && body.hours ? { schedule: body.schedule, hours: body.hours } : null);
      if (ok) toast.success(change.action === "remove" ? "Vuelto a automático" : "Asignación guardada");
      else toast.error("Guardado, pero no he podido refrescar la pantalla. Recárgala para verlo.");
      setChange(null);
    } catch {
      toast.error("Error de conexión");
      setChange((c) => c ? { ...c, saving: false } : c);
    } finally { setSaving(null); }
  }

  async function handleAddExtraHours(e: React.FormEvent) {
    e.preventDefault(); setEhSaving(true);
    try {
      const res = await fetch("/api/admin/extra-hours", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: parseInt(ehForm.personId), date: day.date, hours: parseFloat(ehForm.hours), comment: ehForm.comment || null }),
      });
      if (res.ok) { toast.success("Horas extra añadidas"); setEhForm({ personId: "", hours: "", comment: "" }); setShowExtraHours(false); if (!await onSaved()) toast.error("Guardado, pero no he podido refrescar la pantalla."); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al añadir horas"); }
    } catch { toast.error("Error de conexión"); } finally { setEhSaving(false); }
  }

  async function handleAddShift(e: React.FormEvent) {
    e.preventDefault();
    const st = shiftTypes.find((s) => s.id === parseInt(addForm.shiftTypeId));
    if (!st) return;
    const existing = day.assignments.filter((a) => a.shiftTypeCode === st.code);
    const nextSlot = existing.length > 0 ? Math.max(...existing.map((a) => a.slotIndex)) + 1 : 0;
    const personId = addForm.personId ? parseInt(addForm.personId) : null;
    setShowAddShift(false);
    setAddForm({ shiftTypeId: "", personId: "" });
    await proposeChange({
      action: "set", label: `${st.label} (turno extra)`, shiftTypeId: st.id, slotIndex: nextSlot,
      personId, personName: people.find((p) => p.id === personId)?.name || "Sin asignar",
    });
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
          {/* Intercambios comprometidos este día: lo primero que hay que ver
              antes de tocar un turno, porque detrás hay dos personas avisadas. */}
          {swaps.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Intercambios de este día</h4>
              <div className="space-y-2">
                {swaps.map((sw) => {
                  const broken = sw.check === "broken";
                  const orphan = sw.check === "orphan";
                  const superseded = sw.check === "superseded";
                  const pending = sw.status !== "aprobado";
                  return (
                    <div key={sw.id} className={cn("rounded-xl border px-3 py-2.5",
                      broken ? "bg-rose-50 border-rose-200"
                        : orphan ? "bg-amber-50 border-amber-200"
                        : superseded ? "bg-gray-50 border-gray-200"
                        : pending ? "bg-purple-50 border-purple-200"
                        : "bg-cyan-50 border-cyan-200")}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {broken || orphan
                          ? <AlertTriangle className={cn("w-4 h-4 flex-shrink-0", broken ? "text-rose-500" : "text-amber-500")} />
                          : <ArrowLeftRight className={cn("w-4 h-4 flex-shrink-0", superseded ? "text-gray-400" : pending ? "text-purple-500" : "text-cyan-500")} />}
                        <span className="text-sm font-semibold text-gray-900">{sw.people}</span>
                        <span className="text-xs text-gray-500">{sw.shift}{sw.kind === "partial" && sw.hours ? ` · ${sw.hours}h` : ""}</span>
                        <Badge variant={broken ? "danger" : orphan ? "warning" : superseded ? "default" : pending ? "info" : "success"} className="ml-auto flex-shrink-0">
                          {broken ? "Ya no se cumple"
                            : orphan ? "Horas sin turno"
                            : superseded ? "Anulado por otro"
                            : sw.status === "pendiente" ? "Pendiente"
                            : sw.status === "aceptado" ? "Falta el admin"
                            : sw.kind === "partial" ? "Solo horas" : "En el cuadrante"}
                        </Badge>
                      </div>
                      {broken && sw.detail && (
                        <p className="text-[11px] text-rose-800 mt-1.5 leading-relaxed">
                          {sw.detail} Se aprobó y se les avisó a los dos: o se deja el cuadrante como el acuerdo, o hay que decírselo.
                        </p>
                      )}
                      {orphan && sw.detail && (
                        <p className="text-[11px] text-amber-800 mt-1.5 leading-relaxed">
                          {sw.detail} Conviene confirmar con ellos si esas horas se hicieron de verdad antes de darlas por debidas.
                        </p>
                      )}
                      {superseded && (
                        <p className="text-[11px] text-gray-500 mt-1.5">
                          Después pidieron el contrario (intercambio #{sw.supersededBySwapId}) el mismo día, así que los dos se anulan entre sí.
                        </p>
                      )}
                      {!broken && !orphan && !superseded && sw.kind === "partial" && (
                        <p className="text-[11px] text-gray-500 mt-1.5">Solo es una deuda de horas: no cambia ningún turno de este día.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assignments */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Turnos asignados</h4>
            {day.assignments.length === 0 && !day.isClosed && <p className="text-sm text-gray-400 py-2">Sin turnos este día</p>}
            <div className="space-y-2">
              {day.assignments.map((a, i) => {
                const si = shiftIcon(a.shiftTypeCode);
                const Icon = si.icon;
                const st = shiftTypes.find((s) => s.code === a.shiftTypeCode);
                const key = st ? `${st.id}-${a.slotIndex}-set` : `${a.shiftTypeCode}-${a.slotIndex}`;
                const delKey = st ? `${st.id}-${a.slotIndex}-remove` : "";
                // Both managers share office slot 0, so the engine cannot tell an override
                // there apart from the fixed assignment and ignores it: editing this row
                // would save, notify the employee and change nothing. Show it read-only.
                const fixedOffice = a.source === "rotation" && (a.shiftTypeCode === "office" || a.shiftTypeCode === "office_friday");
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
                      {fixedOffice ? (
                        <div className="flex-1 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-500 bg-gray-50" title="Horario fijo de responsable: no se reparte ni se edita desde aquí">
                          {a.personName || "Sin asignar"}
                        </div>
                      ) : (
                        <select
                          value={change?.key === key ? String(change.personId ?? "") : (a.personId ? String(a.personId) : "")}
                          onChange={(e) => {
                            if (!st) return;
                            const pid = e.target.value ? parseInt(e.target.value) : null;
                            proposeChange({
                              action: "set", label: a.shiftTypeLabel, shiftTypeId: st.id, slotIndex: a.slotIndex,
                              personId: pid, personName: people.find((p) => p.id === pid)?.name || "Sin asignar",
                            });
                          }}
                          disabled={!!saving || (!!change && change.key !== key)}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:opacity-50 bg-white"
                        >
                          <option value="">Sin asignar</option>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      )}
                      <Badge variant={fixedOffice ? "default" : a.source === "override" ? "warning" : a.source === "event" ? "info" : "default"} className="flex-shrink-0">
                        {fixedOffice ? "Fijo" : a.source === "override" ? "Manual" : a.source === "event" ? "Evento" : "Auto"}
                      </Badge>
                      {a.source === "override" && st && (
                        <button
                          onClick={() => proposeChange({
                            action: "remove", label: a.shiftTypeLabel, shiftTypeId: st.id,
                            slotIndex: a.slotIndex, personId: null, personName: "rotación automática",
                          })}
                          disabled={!!saving || (!!change && change.key !== delKey)}
                          className="p-1.5 hover:bg-amber-50 rounded-lg disabled:opacity-40" title="Volver a automático"
                        >
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

          {/* Aviso previo: qué va a pasar si se guarda */}
          {change && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-indigo-900">Antes de guardar</p>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    {change.action === "remove"
                      ? `${change.label}: volver a rotación automática`
                      : `${change.label}: pasa a ${change.personName}`}
                  </p>
                </div>
              </div>

              {change.loading && (
                <p className="text-xs text-indigo-700 flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  Calculando el efecto en el año completo...
                </p>
              )}

              {change.error && <p className="text-xs text-rose-700 font-medium">{change.error}</p>}

              {change.preview && (
                <div className="space-y-3">
                  {change.preview.noEffect && (
                    <div className="rounded-lg bg-amber-100 border border-amber-200 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-900">Este cambio no alteraría el cuadrante.</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">Se guardaría el registro pero el día quedaría igual, así que mejor no guardarlo.</p>
                    </div>
                  )}

                  {change.preview.dayChanges.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-indigo-900/70 uppercase tracking-wider mb-1">Ese día queda así</p>
                      <div className="space-y-1">
                        {change.preview.dayChanges.map((c, i) => (
                          <p key={i} className="text-xs text-gray-700">
                            <span className="font-semibold">{c.label}:</span> {c.before} <span className="text-gray-400">→</span> <span className="font-semibold text-indigo-800">{c.after}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {change.preview.hourDeltas.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-indigo-900/70 uppercase tracking-wider mb-1">Horas del año</p>
                      <div className="flex flex-wrap gap-2">
                        {change.preview.hourDeltas.map((h) => (
                          <span key={h.personId} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-2 py-1 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.personColor }} />
                            <span className="font-medium text-gray-800">{h.personName}</span>
                            <span className={h.delta > 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                              {h.delta > 0 ? "+" : ""}{h.delta.toFixed(1)}h
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {change.preview.swapsBroken.length > 0 && (
                    <div className="rounded-lg bg-rose-100 border border-rose-300 px-3 py-2">
                      <p className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        {change.preview.swapsBroken.length === 1
                          ? "Este cambio deshace un intercambio aprobado"
                          : `Este cambio deshace ${change.preview.swapsBroken.length} intercambios aprobados`}
                      </p>
                      {change.preview.swapsBroken.map((sw) => (
                        <p key={sw.swapId} className="text-[11px] text-rose-800 mt-1 leading-relaxed">
                          <span className="font-semibold">{sw.people}</span> ({sw.dates.join(", ")}): {sw.detail}
                        </p>
                      ))}
                      <p className="text-[11px] text-rose-700 mt-1.5">Los dos recibieron el aviso de que estaba aprobado. Si lo guardas, avísales.</p>
                    </div>
                  )}

                  {change.preview.swapsOrphaned.length > 0 && (
                    <div className="rounded-lg bg-amber-100 border border-amber-300 px-3 py-2">
                      <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {change.preview.swapsOrphaned.length === 1
                          ? "Este cambio deja una cobertura de horas sin su turno"
                          : `Este cambio deja ${change.preview.swapsOrphaned.length} coberturas de horas sin su turno`}
                      </p>
                      {change.preview.swapsOrphaned.map((sw) => (
                        <p key={sw.swapId} className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                          <span className="font-semibold">{sw.people}</span> ({sw.dates.join(", ")}): {sw.detail}
                        </p>
                      ))}
                      <p className="text-[11px] text-amber-700 mt-1.5">Las horas no se borran solas: seguirán contando en las deudas.</p>
                    </div>
                  )}

                  {change.preview.swapsRestored.length > 0 && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" /> Vuelve a cumplirse un intercambio aprobado
                      </p>
                      {change.preview.swapsRestored.map((sw) => (
                        <p key={sw.swapId} className="text-[11px] text-emerald-800 mt-1">
                          <span className="font-semibold">{sw.people}</span> ({sw.dates.join(", ")}).
                        </p>
                      ))}
                    </div>
                  )}

                  {change.preview.otherDaysChanged > 0 && (
                    <p className="text-xs text-amber-800">
                      El motor reordena además <span className="font-bold">{change.preview.otherDaysChanged}</span> {change.preview.otherDaysChanged === 1 ? "día más" : "días más"} del año
                      {change.preview.otherDaysSample.length > 0 && <> (p. ej. {change.preview.otherDaysSample.slice(0, 4).join(", ")}{change.preview.otherDaysChanged > 4 ? "..." : ""})</>}.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant={(change.preview?.swapsBroken.length ?? 0) > 0 ? "danger" : "primary"}
                  onClick={commitChange}
                  disabled={change.loading || change.saving || !!change.error}
                >
                  {change.saving ? "Guardando..." : (change.preview?.swapsBroken.length ?? 0) > 0
                    ? <><AlertTriangle className="w-3.5 h-3.5" /> Guardar de todos modos</>
                    : <><Check className="w-3.5 h-3.5" /> Guardar cambio</>}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setChange(null)} disabled={change.saving}>Cancelar</Button>
              </div>
            </div>
          )}

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
                {day.timeOffs.map((to, i) => {
                  const isCita = to.type === "cita_medica";
                  const isInter = to.type === "intercambio";
                  const bg = isInter ? "bg-cyan-50" : isCita ? "bg-rose-50" : "bg-emerald-50";
                  const txt = isInter ? "text-cyan-700" : isCita ? "text-rose-700" : "text-emerald-700";
                  const icon = isInter ? <ArrowLeftRight className="w-4 h-4 text-cyan-500" /> : <Palmtree className={cn("w-4 h-4", isCita ? "text-rose-500" : "text-emerald-500")} />;
                  const label = isInter ? "Intercambio" : to.type === "vacaciones" ? "Vacaciones" : to.type === "enfermedad" ? "Baja" : isCita ? `Cita ${to.startTime || ""}-${to.endTime || ""}` : "Ausencia";
                  return (
                    <div key={`v${i}`} className={cn("flex items-center gap-3 p-2.5 rounded-xl", bg)}>
                      {icon}
                      <span className={cn("text-sm font-medium", txt)}>{to.personName}</span>
                      <Badge variant={isInter ? "info" : isCita ? "danger" : "success"} className="ml-auto">{label}</Badge>
                    </div>
                  );
                })}
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
                <Button type="submit" size="sm"><Save className="w-3.5 h-3.5" /> Ver efecto</Button>
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
