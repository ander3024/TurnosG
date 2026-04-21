"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Sunrise, Moon, Sun, Palmtree, BedDouble, ArrowLeftRight,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TeamAssignment { personCode: string | null; personName: string | null; personColor: string | null; shiftLabel: string; startTime: string; endTime: string; }
interface OffPerson { personCode: string; personName: string; personColor: string; }
interface TeamTimeOff { personCode: string; personName: string; personColor: string; type: string; }
interface DayData { date: string; isWeekend: boolean; isClosed: boolean; shifts: { code: string; label: string; startTime: string; endTime: string; hours: number }[]; timeOff: { type: string; status: string } | null; isSwapOff?: boolean; holiday: { label: string } | null; teamAssignments: TeamAssignment[]; offPeople?: OffPerson[]; teamTimeOffs?: TeamTimeOff[]; }
interface SwapInfo { id: number; fromPerson: { name: string; color: string }; toPerson: { name: string; color: string }; fromDate: string; toDate: string; fromShiftLabel: string; toShiftLabel: string; status: string; isOneWay?: boolean }

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS = ["LUN","MAR","MIÉ","JUE","VIE","SÁB","DOM"];

function si(label: string) {
  const l = label.toLowerCase();
  if (l.includes("finde") || l.includes("fin")) return { Icon: Sun, color: "text-amber-600", bg: "bg-amber-50", short: "F" };
  if (l.includes("tarde")) return { Icon: Moon, color: "text-indigo-600", bg: "bg-indigo-50", short: "T" };
  return { Icon: Sunrise, color: "text-orange-500", bg: "bg-orange-50", short: "M" };
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState<DayData[]>([]);
  const [swaps, setSwaps] = useState<SwapInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const t = Date.now();
      const [calRes, swapRes] = await Promise.all([
        fetch(`/api/employee/calendar?start=${from}&end=${to}&_=${t}`, { cache: "no-store" }),
        fetch(`/api/employee/swaps?_=${t}`, { cache: "no-store" }),
      ]);
      if (calRes.ok) { const j = await calRes.json(); setDays(j.days || []); }
      if (swapRes.ok) { const j = await swapRes.json(); setSwaps(j.swaps || []); }
    } catch {} finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Get swaps affecting a specific date (pending or approved, not rejected/cancelled)
  function getSwapsForDate(date: string) {
    return swaps.filter(s =>
      (s.fromDate === date || s.toDate === date) &&
      ["pendiente", "aceptado", "aprobado"].includes(s.status)
    );
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }

  const dayMap = new Map(days.map((d) => [d.date, d]));
  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Calendario del equipo</h1>
          <p className="text-gray-500 text-sm">Tus turnos aparecen destacados. Pulsa un día para ver el detalle.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/intercambios">
            <Button variant="outline" size="sm"><ArrowLeftRight className="w-4 h-4" /> Intercambiar turno</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>Hoy</Button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-200"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
        <div className="flex items-center gap-2">
          {loading && <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
          <h2 className="text-base font-bold text-gray-900">{MONTHS[month]} {year}</h2>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-200"><ChevronRight className="w-5 h-5 text-gray-600" /></button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <div className="md:hidden space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        </div>
      )}

      {/* ═══ DESKTOP: Grid ═══ */}
      {!loading && <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50/80">
          {DAYS.map((d, i) => (
            <div key={d} className={cn("text-center text-[11px] font-bold tracking-wider py-2", i >= 5 ? "text-amber-600" : "text-gray-500")}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((dateStr, idx) => {
            if (!dateStr) return <div key={idx} className="min-h-[120px] border-b border-r border-gray-100 bg-gray-50/30" />;
            const day = dayMap.get(dateStr);
            const isToday = dateStr === today;
            const dayNum = parseInt(dateStr.split("-")[2]);
            const dow = idx % 7;
            const isWe = dow >= 5;
            const myShifts = day?.shifts || [];
            const hasMyShift = myShifts.length > 0;
            const daySwaps = getSwapsForDate(dateStr);
            const hasPendingSwap = daySwaps.some(s => s.status === "pendiente" || s.status === "aceptado");
            const hasApprovedSwap = daySwaps.some(s => s.status === "aprobado");

            return (
              <div key={idx} onClick={() => day && setSelectedDay(day)} className={cn(
                "min-h-[120px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-all hover:bg-indigo-50/30",
                isWe && "bg-slate-50/60", day?.isClosed && "bg-rose-50/40",
                hasMyShift && "bg-indigo-50/20",
                isToday && "ring-2 ring-inset ring-indigo-500",
                hasPendingSwap && "animate-pulse-subtle bg-purple-50/40 ring-1 ring-inset ring-purple-300",
                hasApprovedSwap && !hasPendingSwap && "bg-cyan-50/30 ring-1 ring-inset ring-cyan-300",
              )}>
                <div className="flex items-center justify-between mb-1">
                  <span className={cn("text-[11px] font-bold", isToday ? "bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center" : isWe ? "text-amber-700" : "text-gray-800")}>{dayNum}</span>
                  {day?.isClosed && <span className="text-[8px] bg-rose-100 text-rose-600 px-1 py-0.5 rounded font-bold">CERRADO</span>}
                  {day?.holiday && !day.isClosed && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold truncate max-w-[60px]">{day.holiday.label}</span>}
                </div>
                <div className="space-y-[2px]">
                  {day?.teamAssignments?.map((ta, i) => {
                    const s = si(ta.shiftLabel);
                    const isMe = myShifts.some((ms) => ms.label === ta.shiftLabel);
                    return (
                      <div key={i} className={cn("flex items-center gap-[3px] rounded-md px-1 py-[2px]", isMe ? "ring-2 ring-indigo-400 " + s.bg : s.bg + "/50")}>
                        <s.Icon className={cn("w-[10px] h-[10px] flex-shrink-0", s.color)} />
                        <span className={cn("text-[10px] font-semibold truncate", isMe ? "text-gray-900" : "text-gray-600")} style={!isMe ? { color: ta.personColor || undefined } : {}}>
                          {isMe ? "Tú" : ta.personName}
                        </span>
                        <span className={cn("text-[8px] ml-auto flex-shrink-0 font-bold", s.color)}>{s.short}</span>
                      </div>
                    );
                  })}
                  {day?.timeOff && (
                    <div className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-emerald-50 ring-2 ring-emerald-300">
                      <Palmtree className="w-[10px] h-[10px] text-emerald-500" />
                      <span className="text-[10px] font-bold text-emerald-700">Tú</span>
                      <span className="text-[8px] ml-auto text-emerald-500 font-bold">VAC</span>
                    </div>
                  )}
                  {!day?.timeOff && day?.isSwapOff && (
                    <div className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-cyan-50 ring-2 ring-cyan-300">
                      <ArrowLeftRight className="w-[10px] h-[10px] text-cyan-500" />
                      <span className="text-[10px] font-bold text-cyan-700">Tú</span>
                      <span className="text-[8px] ml-auto text-cyan-500 font-bold">LIB</span>
                    </div>
                  )}
                  {day?.teamTimeOffs?.map((tt, i) => (
                    <div key={`tt${i}`} className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-emerald-50/50">
                      <Palmtree className="w-[10px] h-[10px] text-emerald-400" />
                      <span className="text-[10px] font-medium text-emerald-600 truncate">{tt.personName}</span>
                      <span className="text-[8px] ml-auto text-emerald-400 font-bold">VAC</span>
                    </div>
                  ))}
                  {day?.offPeople?.map((op, i) => (
                    <div key={`op${i}`} className="flex items-center gap-[3px] rounded-md px-1 py-[2px] bg-gray-50">
                      <BedDouble className="w-[10px] h-[10px] text-gray-400" />
                      <span className="text-[10px] font-medium text-gray-400 truncate">{op.personName}</span>
                      <span className="text-[8px] ml-auto text-gray-400 font-bold">LIB</span>
                    </div>
                  ))}
                  {/* Swap indicators */}
                  {daySwaps.map((sw, i) => (
                    <div key={`sw${i}`} className={cn("flex items-center gap-[3px] rounded-md px-1 py-[2px] mt-0.5",
                      sw.status === "aprobado" ? "bg-cyan-50 border border-cyan-200" : "bg-purple-50 border border-purple-200 animate-pulse"
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
      </div>}

      {/* ═══ MOBILE: List ═══ */}
      {!loading && <div className="md:hidden space-y-1">
        {days.map((day) => {
          const dt = new Date(day.date + "T12:00:00");
          const dow = dt.getDay();
          const dowLabel = DAYS[dow === 0 ? 6 : dow - 1];
          const isToday = day.date === today;
          const myShifts = day.shifts || [];
          const hasMyShift = myShifts.length > 0;
          const mobileSwaps = getSwapsForDate(day.date);
          const mobilePending = mobileSwaps.some(s => s.status === "pendiente" || s.status === "aceptado");
          const mobileApproved = mobileSwaps.some(s => s.status === "aprobado");

          return (
            <div key={day.date} onClick={() => setSelectedDay(day)} className={cn(
              "rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm",
              isToday ? "border-indigo-400 bg-indigo-50/30" : day.isClosed ? "border-gray-200 bg-rose-50/30" :
              hasMyShift ? "border-indigo-200 bg-white" : "border-gray-100 bg-gray-50/30",
              mobilePending && "border-purple-300 bg-purple-50/20 animate-pulse",
              mobileApproved && !mobilePending && "border-cyan-300 bg-cyan-50/20",
            )}>
              <div className="flex items-start gap-3">
                <div className={cn("w-12 text-center flex-shrink-0", isToday ? "text-indigo-600" : "text-gray-600")}>
                  <div className="text-xl font-bold leading-none">{dt.getDate()}</div>
                  <div className="text-[10px] font-bold uppercase mt-0.5">{dowLabel}</div>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {day.holiday && <div className="text-xs font-semibold text-rose-600">{day.holiday.label}{day.isClosed ? " (cerrado)" : ""}</div>}
                  {day.timeOff && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      <Palmtree className="w-3 h-3" /> Vacaciones
                    </span>
                  )}
                  {!day.timeOff && day.isSwapOff && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-100 text-cyan-700 text-xs font-semibold">
                      <ArrowLeftRight className="w-3 h-3" /> Libras (intercambio)
                    </span>
                  )}
                  {hasMyShift && myShifts.map((s, i) => {
                    const c = si(s.label);
                    return (
                      <div key={i} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold", c.bg)}>
                        <c.Icon className={cn("w-3 h-3", c.color)} />
                        <span className={c.color}>{s.label} {s.startTime}-{s.endTime}</span>
                      </div>
                    );
                  })}
                  {!hasMyShift && !day.timeOff && !day.isSwapOff && !day.isClosed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 text-gray-400 text-xs"><BedDouble className="w-3 h-3" /> Libras</span>
                  )}
                  {!day.isClosed && (
                    <div className="flex flex-wrap gap-1">
                      {day.teamAssignments?.filter((ta) => !myShifts.some((ms) => ms.label === ta.shiftLabel)).map((ta, i) => {
                        const c = si(ta.shiftLabel);
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-gray-50 border border-gray-100">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ta.personColor || "#9ca3af" }} />
                            <span className="font-medium text-gray-700">{ta.personName}</span>
                            <span className={cn("font-bold", c.color)}>{c.short}</span>
                          </span>
                        );
                      })}
                      {day.teamTimeOffs?.map((tt, i) => (
                        <span key={`tt${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-600 border border-emerald-100">
                          <Palmtree className="w-3 h-3" /> {tt.personName}
                        </span>
                      ))}
                      {day.offPeople?.map((op, i) => (
                        <span key={`op${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-400">
                          <BedDouble className="w-3 h-3" /> {op.personName}
                        </span>
                      ))}
                      {mobileSwaps.map((sw, i) => (
                        <span key={`sw${i}`} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                          sw.status === "aprobado" ? "bg-cyan-100 text-cyan-700 border border-cyan-200" : "bg-purple-100 text-purple-700 border border-purple-200"
                        )}>
                          <ArrowLeftRight className="w-3 h-3" />
                          {sw.fromPerson.name.split(" ")[0]} ↔ {sw.toPerson.name.split(" ")[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
              </div>
            </div>
          );
        })}
      </div>}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <div className="flex items-center gap-1"><Sunrise className="w-3.5 h-3.5 text-orange-500" /> Mañana</div>
        <div className="flex items-center gap-1"><Moon className="w-3.5 h-3.5 text-indigo-600" /> Tarde</div>
        <div className="flex items-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-600" /> Finde</div>
        <div className="flex items-center gap-1"><Palmtree className="w-3.5 h-3.5 text-emerald-500" /> Vacaciones</div>
        <div className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5 text-gray-400" /> Libra</div>
        <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded border border-purple-300 bg-purple-50 flex items-center justify-center"><ArrowLeftRight className="w-2 h-2 text-purple-500" /></span> Intercambio pendiente</div>
        <div className="flex items-center gap-1"><span className="w-3.5 h-3.5 rounded border border-cyan-300 bg-cyan-50 flex items-center justify-center"><ArrowLeftRight className="w-2 h-2 text-cyan-500" /></span> Intercambio aprobado</div>
      </div>

      {/* Day detail modal */}
      {selectedDay && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center" onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 capitalize">{fmtDate(selectedDay.date)}</h3>
              <button onClick={() => setSelectedDay(null)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {selectedDay.holiday && <Badge variant="warning">{selectedDay.holiday.label}</Badge>}
              {selectedDay.timeOff && (
                <div className="p-3 rounded-xl bg-emerald-50 flex items-center gap-3">
                  <Palmtree className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-800">Estás de vacaciones</p>
                </div>
              )}
              {!selectedDay.timeOff && selectedDay.isSwapOff && (
                <div className="p-3 rounded-xl bg-cyan-50 flex items-center gap-3">
                  <ArrowLeftRight className="w-5 h-5 text-cyan-600" />
                  <p className="text-sm font-semibold text-cyan-800">Libras por intercambio de turno</p>
                </div>
              )}
              {selectedDay.shifts?.map((s, i) => {
                const c = si(s.label);
                return (
                  <div key={i} className={cn("p-3 rounded-xl flex items-center gap-3", c.bg)}>
                    <c.Icon className={cn("w-5 h-5", c.color)} />
                    <div>
                      <p className={cn("text-sm font-bold", c.color)}>Tu turno: {s.label}</p>
                      <p className="text-xs text-gray-500">{s.startTime} - {s.endTime} ({s.hours}h)</p>
                    </div>
                  </div>
                );
              })}
              {selectedDay.teamAssignments && selectedDay.teamAssignments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Equipo hoy</h4>
                  <div className="space-y-1.5">
                    {selectedDay.teamAssignments.map((ta, i) => {
                      const c = si(ta.shiftLabel);
                      return (
                        <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: ta.personColor || "#9ca3af" }}>
                            {ta.personName?.slice(0, 2)}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900">{ta.personName}</p>
                            <p className="text-xs text-gray-500">{ta.shiftLabel} ({ta.startTime}-{ta.endTime})</p>
                          </div>
                          <c.Icon className={cn("w-4 h-4", c.color)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Off people */}
              {((selectedDay.offPeople?.length || 0) > 0 || (selectedDay.teamTimeOffs?.length || 0) > 0) && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">No trabajan hoy</h4>
                  <div className="space-y-1.5">
                    {selectedDay.teamTimeOffs?.map((tt, i) => (
                      <div key={`tt${i}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-emerald-50">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: tt.personColor || "#10b981" }}>
                          {tt.personName?.slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-emerald-700">{tt.personName}</p>
                          <p className="text-xs text-emerald-500">{tt.type === "vacaciones" ? "Vacaciones" : tt.type === "enfermedad" ? "Baja" : "Ausencia"}</p>
                        </div>
                        <Palmtree className="w-4 h-4 text-emerald-400" />
                      </div>
                    ))}
                    {selectedDay.offPeople?.map((op, i) => (
                      <div key={`op${i}`} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: op.personColor || "#9ca3af" }}>
                          {op.personName?.slice(0, 2)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-500">{op.personName}</p>
                          <p className="text-xs text-gray-400">Libra</p>
                        </div>
                        <BedDouble className="w-4 h-4 text-gray-300" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Swap indicators in modal */}
              {getSwapsForDate(selectedDay.date).length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Intercambios de turno</h4>
                  <div className="space-y-1.5">
                    {getSwapsForDate(selectedDay.date).map((sw, i) => (
                      <div key={i} className={cn("flex items-center gap-3 p-3 rounded-xl",
                        sw.status === "aprobado" ? "bg-cyan-50 border border-cyan-200" : "bg-purple-50 border border-purple-200"
                      )}>
                        <ArrowLeftRight className={cn("w-5 h-5 flex-shrink-0", sw.status === "aprobado" ? "text-cyan-500" : "text-purple-500")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">
                            <span style={{ color: sw.fromPerson.color }}>{sw.fromPerson.name}</span>
                            <span className="text-gray-400 mx-1">↔</span>
                            <span style={{ color: sw.toPerson.color }}>{sw.toPerson.name}</span>
                          </p>
                          <p className="text-xs text-gray-500">
                            {sw.fromShiftLabel} → {sw.toShiftLabel === "Libra" ? "Cobertura" : sw.toShiftLabel}
                          </p>
                        </div>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                          sw.status === "aprobado" ? "bg-cyan-100 text-cyan-700" :
                          sw.status === "aceptado" ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700"
                        )}>
                          {sw.status === "aprobado" ? "Aprobado" : sw.status === "aceptado" ? "Esperando admin" : "Pendiente"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Link to swap */}
              {selectedDay.shifts && selectedDay.shifts.length > 0 && (
                <Link href="/intercambios" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 transition-colors">
                  <ArrowLeftRight className="w-4 h-4" /> Proponer intercambio de este turno
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
