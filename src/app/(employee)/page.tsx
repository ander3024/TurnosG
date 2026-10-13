import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, statusColor, statusLabel, formatHours, formatHoursSigned } from "@/lib/utils";
import { loadEngineContext, generateSchedule, buildHoursSummary } from "@/lib/engine";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Sunrise, Moon, Sun, BedDouble, Palmtree, ArrowLeftRight,
  ArrowRight, Bell, Scale, Calendar, Clock,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmployeeDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const person = await prisma.person.findFirst({ where: { userId: user.id } });
  const today = new Date().toISOString().split("T")[0];
  const todayDate = new Date();
  const firstName = user.name.split(" ")[0];

  // Generate today's schedule
  const monthStart = today.slice(0, 8) + "01";
  const ym = today.slice(0, 7).split("-");
  const monthEnd = today.slice(0, 8) + String(new Date(parseInt(ym[0]), parseInt(ym[1]), 0).getDate()).padStart(2, "0");

  const ctx = await loadEngineContext(monthStart, monthEnd);
  const schedule = generateSchedule(ctx, monthStart, monthEnd);
  const todaySchedule = schedule.find(d => d.date === today);

  // My shift today
  const myShiftsToday = person ? todaySchedule?.assignments.filter(a => a.personId === person.id) || [] : [];
  const amIOffToday = person ? todaySchedule?.offPeople?.some(o => o.personId === person.id) : false;
  const myTimeOffToday = person ? todaySchedule?.timeOffs.find(t => t.personId === person.id) : null;

  // Next 5 working days
  const upcoming = schedule
    .filter(d => d.date > today && !d.isClosed)
    .slice(0, 5)
    .map(d => {
      const myShifts = person ? d.assignments.filter(a => a.personId === person.id) : [];
      const isOff = person ? d.offPeople?.some(o => o.personId === person.id) : false;
      const hasTimeOff = person ? d.timeOffs.some(t => t.personId === person.id) : false;
      return { date: d.date, myShifts, isOff, hasTimeOff };
    });

  // Pending swaps for me
  const pendingSwaps = person ? await prisma.swapRequest.findMany({
    where: { toPersonId: person.id, status: "pendiente" },
    include: { fromPerson: { select: { name: true, color: true } } },
    take: 3,
  }) : [];

  // Debts
  const unsettledDebts = person ? await prisma.swapRequest.findMany({
    where: {
      isOneWay: true, settled: false, status: "aprobado",
      OR: [{ fromPersonId: person.id }, { toPersonId: person.id }],
    },
    include: {
      fromPerson: { select: { name: true, color: true } },
      toPerson: { select: { name: true, color: true } },
    },
  }) : [];

  // Compute debt balance
  const debtMap = new Map<string, { name: string; color: string; net: number }>();
  for (const s of unsettledDebts) {
    const other = s.fromPersonId === person?.id ? s.toPerson : s.fromPerson;
    const key = other.name;
    if (!debtMap.has(key)) debtMap.set(key, { name: other.name, color: other.color, net: 0 });
    const entry = debtMap.get(key)!;
    entry.net += s.fromPersonId === person?.id ? -1 : 1; // I owe them -1, they owe me +1
  }
  const debts = Array.from(debtMap.values()).filter(d => d.net !== 0);

  // Unread notifications
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, read: false } });

  // Vacation stats
  const vacLimit = parseInt((await prisma.setting.findFirst({ where: { key: "vacationDaysNatural" } }))?.value || "23");
  const approvedVac = person ? await prisma.timeOffRequest.findMany({
    where: { personId: person.id, status: "aprobada", type: "vacaciones" },
  }) : [];
  const holidays = await prisma.holiday.findMany();
  const holidayDates = new Set(holidays.map(h => h.date));
  let vacUsed = 0;
  for (const t of approvedVac) {
    const s = new Date(t.startDate + "T12:00:00Z");
    const e = new Date(t.endDate + "T12:00:00Z");
    const d = new Date(s);
    while (d <= e) {
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayDates.has(d.toISOString().slice(0, 10))) vacUsed++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  // Annual hours summary (full year, past + planned)
  let myHours: { total: number; target: number; delta: number; pct: number; pctToDate: number; targetToDate: number; weekday: number; weekend: number; refuerzo: number; extra: number; vacUsed: number; vacTotal: number } | null = null;
  if (person) {
    const yearStart = today.slice(0, 4) + "-01-01";
    const yearEnd = today.slice(0, 4) + "-12-31";
    const yearCtx = await loadEngineContext(yearStart, yearEnd);
    const yearSchedule = generateSchedule(yearCtx, yearStart, yearEnd);
    const summary = buildHoursSummary(
      yearSchedule.flatMap(d => d.assignments),
      yearCtx.extraHours,
      yearCtx.timeOffs,
      yearCtx.settings.annualTargetHours,
      yearCtx.settings.vacationDaysNatural,
      yearCtx.people,
      holidayDates,
    );
    const mine = summary.find(h => h.personId === person.id);
    if (mine) {
      const monthsWorked = todayDate.getMonth() + 1;
      const targetToDate = Math.round(mine.targetHours * monthsWorked / 12);
      myHours = {
        total: mine.totalHours,
        target: mine.targetHours,
        delta: mine.delta,
        pct: Math.min(100, Math.round((mine.totalHours / mine.targetHours) * 100)),
        pctToDate: targetToDate > 0 ? Math.min(100, Math.round((mine.totalHours / targetToDate) * 100)) : 0,
        targetToDate,
        weekday: mine.weekdayHours,
        weekend: mine.weekendHours,
        refuerzo: mine.refuerzoHours,
        extra: mine.extraHoursLogged,
        vacUsed: mine.vacationDaysUsed,
        vacTotal: mine.vacationDaysTotal,
      };
    }
  }

  function shiftInfo(code: string) {
    if (code === "weekend") return { Icon: Sun, color: "text-amber-600", bg: "bg-amber-50", label: "Finde" };
    if (code.includes("afternoon")) return { Icon: Moon, color: "text-indigo-600", bg: "bg-indigo-50", label: "Tarde" };
    return { Icon: Sunrise, color: "text-orange-500", bg: "bg-orange-50", label: "Mañana" };
  }

  const dayLabel = todayDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">
      {/* Today's header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Hola, {firstName}</h1>
        <p className="text-gray-500 text-sm capitalize">{dayLabel}</p>
      </div>

      {/* Today's shift - hero card */}
      <Card className={myShiftsToday.length > 0 ? "border-indigo-200 bg-gradient-to-r from-indigo-50 to-white" : amIOffToday ? "border-gray-200 bg-gray-50" : myTimeOffToday ? "border-emerald-200 bg-emerald-50" : ""}>
        <CardContent className="!py-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tu turno hoy</p>
          {myShiftsToday.length > 0 ? (
            <div className="space-y-2">
              {myShiftsToday.map((s, i) => {
                const si = shiftInfo(s.shiftTypeCode);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${si.bg}`}>
                      <si.Icon className={`w-6 h-6 ${si.color}`} />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{s.shiftTypeLabel}</p>
                      <p className="text-sm text-gray-500">{s.startTime} - {s.endTime} ({s.hours}h)</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : myTimeOffToday ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Palmtree className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-emerald-800">{myTimeOffToday.type === "intercambio" ? "Libras por intercambio" : "Vacaciones"}</p>
                <p className="text-sm text-emerald-600">Disfruta del día</p>
              </div>
            </div>
          ) : amIOffToday ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <BedDouble className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-600">Libras hoy</p>
                <p className="text-sm text-gray-400">No tienes turno asignado</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500">Sin información de turno</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Annual hours progress */}
      {myHours && (
        <Card>
          <CardContent className="!py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Jornada anual</p>
                <InfoTooltip
                  side="bottom"
                  content={
                    <div className="space-y-2">
                      <p className="font-bold text-white">Cálculo según convenio</p>
                      <p><span className="text-indigo-300 font-semibold">Convenio:</span> Industria textil y confección 2024-2026 (BOE-A-2025-20177)</p>
                      <p><span className="text-indigo-300 font-semibold">Jornada anual:</span> {formatHours(myHours.target)} efectivas (incluye reducción por jornada intensiva de verano ya descontada)</p>
                      <p><span className="text-indigo-300 font-semibold">Vacaciones:</span> {myHours.vacTotal} días laborables/año</p>
                      <p className="pt-1 border-t border-gray-700"><span className="text-indigo-300 font-semibold">Tu desglose:</span></p>
                      <ul className="list-none space-y-0.5 text-gray-200 text-[11px]">
                        <li>• Turnos L-V: <b>{formatHours(myHours.weekday)}</b></li>
                        <li>• Turnos de finde (12h/día): <b>{formatHours(myHours.weekend)}</b></li>
                        <li>• Refuerzos: <b>{formatHours(myHours.refuerzo)}</b></li>
                        <li>• Horas extra registradas: <b>{formatHours(myHours.extra)}</b></li>
                        <li>• Vacaciones consumidas: <b>{myHours.vacUsed}/{myHours.vacTotal} días</b></li>
                      </ul>
                      <p className="pt-1 border-t border-gray-700 text-gray-300 text-[11px]">Incluye turnos ya trabajados y los planificados hasta 31-dic. Cada turno descuenta la hora de comida (90 min en jornadas partidas).</p>
                    </div>
                  }
                />
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${myHours.pctToDate >= 95 ? "bg-emerald-100 text-emerald-700" : myHours.pctToDate >= 80 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                {myHours.pctToDate}% al día
              </span>
            </div>
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <span className="text-2xl font-bold text-gray-900">{formatHours(myHours.total)}</span>
                <span className="text-sm text-gray-500"> / {formatHours(myHours.target)}</span>
              </div>
              <div className={`text-sm font-bold ${myHours.delta >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                {myHours.delta >= 0 ? `+${formatHours(myHours.delta)} de sobra` : `Te faltan ${formatHours(Math.abs(myHours.delta))}`}
              </div>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative cursor-help"
              title={`Tu jornada según convenio textil 2024-2026\n\nHoras: ${formatHours(myHours.total)} / ${formatHours(myHours.target)} (${formatHoursSigned(myHours.delta)})\n\nDesglose:\n  • L-V: ${formatHours(myHours.weekday)}\n  • Finde: ${formatHours(myHours.weekend)}\n  • Refuerzos: ${formatHours(myHours.refuerzo)}\n  • Extra: ${formatHours(myHours.extra)}\n\nVacaciones: ${myHours.vacUsed}/${myHours.vacTotal} días`}>
              <div className="absolute inset-y-0 border-r-2 border-dashed border-gray-400 z-10" style={{ left: `${Math.round((todayDate.getMonth() + 1) / 12 * 100)}%` }} title="Hoy" />
              <div className={`h-full rounded-full transition-all ${myHours.delta >= 0 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${myHours.pct}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">Incluye turnos ya trabajados y los planificados hasta fin de año. La línea marca el progreso esperado a día de hoy.</p>
          </CardContent>
        </Card>
      )}

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/vacaciones">
          <Card className="hover:shadow-sm transition-shadow">
            <CardContent className="!py-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{vacLimit - vacUsed}</p>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Días vacaciones</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/intercambios">
          <Card className={pendingSwaps.length > 0 ? "border-red-200 hover:shadow-sm transition-shadow" : "hover:shadow-sm transition-shadow"}>
            <CardContent className="!py-3 text-center">
              <p className={`text-2xl font-bold ${pendingSwaps.length > 0 ? "text-red-600" : "text-gray-900"}`}>{pendingSwaps.length}</p>
              <p className="text-[10px] text-gray-500 uppercase font-medium">Pendientes</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="!py-3 text-center">
            <p className={`text-2xl font-bold ${unreadCount > 0 ? "text-indigo-600" : "text-gray-900"}`}>{unreadCount}</p>
            <p className="text-[10px] text-gray-500 uppercase font-medium">Notificaciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming days */}
      <Card>
        <CardContent className="!py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Próximos días</p>
            <Link href="/calendar" className="text-xs text-indigo-600 font-medium flex items-center gap-1">Ver calendario <ArrowRight className="w-3 h-3" /></Link>
          </div>
          <div className="space-y-2">
            {upcoming.map((d) => {
              const dt = new Date(d.date + "T12:00:00");
              const dayName = dt.toLocaleDateString("es-ES", { weekday: "short" });
              const dayNum = dt.getDate();
              return (
                <div key={d.date} className="flex items-center gap-3 py-1.5">
                  <div className="w-10 text-center flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900 leading-none">{dayNum}</div>
                    <div className="text-[9px] text-gray-400 uppercase">{dayName}</div>
                  </div>
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {d.myShifts.map((s, i) => {
                      const si = shiftInfo(s.shiftTypeCode);
                      return (
                        <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${si.bg} ${si.color}`}>
                          <si.Icon className="w-3 h-3" /> {s.shiftTypeLabel}
                        </span>
                      );
                    })}
                    {d.hasTimeOff && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600"><Palmtree className="w-3 h-3" /> Ausencia</span>}
                    {d.isOff && !d.hasTimeOff && d.myShifts.length === 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs bg-gray-100 text-gray-400"><BedDouble className="w-3 h-3" /> Libras</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending swaps + Debts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pending swaps */}
        {pendingSwaps.length > 0 && (
          <Link href="/intercambios">
            <Card className="border-purple-200 bg-purple-50/30 hover:shadow-sm transition-shadow animate-pulse-subtle">
              <CardContent className="!py-4">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowLeftRight className="w-4 h-4 text-purple-600" />
                  <p className="text-xs font-bold text-purple-700 uppercase">Intercambios pendientes</p>
                </div>
                {pendingSwaps.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 py-1 text-sm">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.fromPerson.color }} />
                    <span className="font-medium text-gray-900">{s.fromPerson.name}</span>
                    <span className="text-gray-400 text-xs">quiere intercambiar contigo</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Debts */}
        {debts.length > 0 && (
          <Link href="/intercambios">
            <Card className="border-amber-200 hover:shadow-sm transition-shadow">
              <CardContent className="!py-4">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="w-4 h-4 text-amber-600" />
                  <p className="text-xs font-bold text-amber-700 uppercase">Deudas de turnos</p>
                </div>
                {debts.map((d, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="font-medium text-gray-900">{d.name}</span>
                    </div>
                    <span className={`text-xs font-bold ${d.net > 0 ? "text-emerald-600" : "text-amber-600"}`}>
                      {d.net > 0 ? `Te debe ${d.net}` : `Le debes ${Math.abs(d.net)}`}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
