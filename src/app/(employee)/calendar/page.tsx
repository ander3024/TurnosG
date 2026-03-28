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

interface TeamAssignment { personCode: string | null; personName: string | null; personColor: string | null; shiftLabel: string; startTime: string; endTime: string; }
interface DayData { date: string; isWeekend: boolean; isClosed: boolean; shifts: { code: string; label: string; startTime: string; endTime: string; hours: number }[]; timeOff: { type: string; status: string } | null; holiday: { label: string } | null; teamAssignments: TeamAssignment[]; }

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
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employee/calendar?start=${from}&end=${to}`);
      if (res.ok) { const j = await res.json(); setDays(j.days || []); }
    } catch {} finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { fetchData(); }, [fetchData]);

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

      {/* ═══ DESKTOP: Grid ═══ */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
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

            return (
              <div key={idx} onClick={() => day && setSelectedDay(day)} className={cn(
                "min-h-[120px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-all hover:bg-indigo-50/30",
                isWe && "bg-slate-50/60", day?.isClosed && "bg-rose-50/40",
                hasMyShift && "bg-indigo-50/20",
                isToday && "ring-2 ring-inset ring-indigo-500"
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
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ MOBILE: List ═══ */}
      <div className="md:hidden space-y-1">
        {days.map((day) => {
          const dt = new Date(day.date + "T12:00:00");
          const dow = dt.getDay();
          const dowLabel = DAYS[dow === 0 ? 6 : dow - 1];
          const isToday = day.date === today;
          const myShifts = day.shifts || [];
          const hasMyShift = myShifts.length > 0;

          return (
            <div key={day.date} onClick={() => setSelectedDay(day)} className={cn(
              "rounded-xl border p-3 cursor-pointer transition-all hover:shadow-sm",
              isToday ? "border-indigo-400 bg-indigo-50/30" : day.isClosed ? "border-gray-200 bg-rose-50/30" :
              hasMyShift ? "border-indigo-200 bg-white" : "border-gray-100 bg-gray-50/30"
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
                  {hasMyShift && myShifts.map((s, i) => {
                    const c = si(s.label);
                    return (
                      <div key={i} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold", c.bg)}>
                        <c.Icon className={cn("w-3 h-3", c.color)} />
                        <span className={c.color}>{s.label} {s.startTime}-{s.endTime}</span>
                      </div>
                    );
                  })}
                  {!hasMyShift && !day.timeOff && !day.isClosed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 text-gray-400 text-xs"><BedDouble className="w-3 h-3" /> Libras</span>
                  )}
                  {!day.isClosed && day.teamAssignments?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {day.teamAssignments.filter((ta) => !myShifts.some((ms) => ms.label === ta.shiftLabel)).map((ta, i) => {
                        const c = si(ta.shiftLabel);
                        return (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-gray-50 border border-gray-100">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ta.personColor || "#9ca3af" }} />
                            <span className="font-medium text-gray-700">{ta.personName}</span>
                            <span className={cn("font-bold", c.color)}>{c.short}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <div className="flex items-center gap-1"><Sunrise className="w-3.5 h-3.5 text-orange-500" /> Mañana</div>
        <div className="flex items-center gap-1"><Moon className="w-3.5 h-3.5 text-indigo-600" /> Tarde</div>
        <div className="flex items-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-600" /> Finde</div>
        <div className="flex items-center gap-1"><Palmtree className="w-3.5 h-3.5 text-emerald-500" /> Vacaciones</div>
        <div className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5 text-gray-400" /> Libra</div>
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
