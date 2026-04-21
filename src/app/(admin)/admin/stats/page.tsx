import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadEngineContext, generateSchedule, buildHoursSummary } from "@/lib/engine";
import {
  BarChart3, Clock, ArrowLeftRight, Palmtree, Users, TrendingUp, Sun, Moon, Sunrise,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const today = now.toISOString().slice(0, 10);
  const to = `${year}-12-31`;

  const [people, swaps, timeoffs, extraHours, holidays, settings] = await Promise.all([
    prisma.person.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.swapRequest.findMany({ where: { status: "aprobado" } }),
    prisma.timeOffRequest.findMany({ where: { status: "aprobada" } }),
    prisma.extraHours.findMany(),
    prisma.holiday.findMany(),
    prisma.setting.findMany(),
  ]);

  const vacLimit = parseInt(settings.find(s => s.key === "vacationDaysNatural")?.value || "23");
  const holidayDates = new Set(holidays.map(h => h.date));

  // Generate full year schedule
  const ctx = await loadEngineContext(from, to);
  const schedule = generateSchedule(ctx, from, to);
  const allAssignments = schedule.flatMap(d => d.assignments);

  const hours = buildHoursSummary(
    allAssignments, ctx.extraHours, ctx.timeOffs,
    ctx.settings.annualTargetHours, ctx.settings.vacationDaysNatural,
    ctx.people, holidayDates
  );

  // Count shifts per person per type
  const shiftCounts = new Map<number, { morning: number; afternoon: number; weekend: number; refuerzo: number }>();
  for (const p of people) shiftCounts.set(p.id, { morning: 0, afternoon: 0, weekend: 0, refuerzo: 0 });

  // Only count past days
  for (const day of schedule) {
    if (day.date > today) continue;
    for (const a of day.assignments) {
      if (!a.personId) continue;
      const c = shiftCounts.get(a.personId);
      if (!c) continue;
      if (a.shiftTypeCode === "morning") c.morning++;
      else if (a.shiftTypeCode === "afternoon") c.afternoon++;
      else if (a.shiftTypeCode === "weekend") c.weekend++;
      else if (a.shiftTypeCode.startsWith("refuerzo")) c.refuerzo++;
    }
  }

  // Vacation days per person
  const vacDays = new Map<number, number>();
  for (const p of people) {
    let used = 0;
    for (const t of timeoffs.filter(t => t.personId === p.id && t.type === "vacaciones")) {
      const s = new Date(t.startDate + "T12:00:00Z");
      const e = new Date(t.endDate + "T12:00:00Z");
      const d = new Date(s);
      while (d <= e) {
        if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayDates.has(d.toISOString().slice(0, 10))) used++;
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    vacDays.set(p.id, used);
  }

  // Swap stats
  const swapsByPerson = new Map<number, number>();
  for (const s of swaps) {
    swapsByPerson.set(s.fromPersonId, (swapsByPerson.get(s.fromPersonId) || 0) + 1);
    swapsByPerson.set(s.toPersonId, (swapsByPerson.get(s.toPersonId) || 0) + 1);
  }
  const oneWaySwaps = swaps.filter(s => s.isOneWay);
  const unsettledDebts = oneWaySwaps.filter(s => !s.settled);

  // Months worked so far
  const monthsWorked = now.getMonth() + 1;
  const targetHoursToDate = Math.round(ctx.settings.annualTargetHours * monthsWorked / 12);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>
        <p className="text-gray-500 text-sm mt-1">Análisis del año {year} hasta hoy ({today})</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="!py-4 text-center">
            <Clock className="w-6 h-6 text-indigo-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{targetHoursToDate}h</p>
            <p className="text-xs text-gray-500">Objetivo hasta hoy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!py-4 text-center">
            <ArrowLeftRight className="w-6 h-6 text-purple-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{swaps.length}</p>
            <p className="text-xs text-gray-500">Intercambios aprobados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="!py-4 text-center">
            <Palmtree className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{timeoffs.filter(t => t.type === "vacaciones").length}</p>
            <p className="text-xs text-gray-500">Solicitudes de vacaciones</p>
          </CardContent>
        </Card>
        <Card className={unsettledDebts.length > 0 ? "border-amber-200" : ""}>
          <CardContent className="!py-4 text-center">
            <BarChart3 className="w-6 h-6 text-amber-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{unsettledDebts.length}</p>
            <p className="text-xs text-gray-500">Deudas pendientes</p>
          </CardContent>
        </Card>
      </div>

      {/* Hours per person */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Horas trabajadas vs objetivo</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {hours.map(h => {
              const pct = Math.min(100, Math.round((h.totalHours / h.targetHours) * 100));
              const pctToDate = Math.min(100, Math.round((h.totalHours / targetHoursToDate) * 100));
              return (
                <div key={h.personId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: h.personColor }}>
                        {h.personName.slice(0, 2)}
                      </div>
                      <span className="font-semibold text-gray-900">{h.personName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-500">{Math.round(h.totalHours)}h / {h.targetHours}h</span>
                      <span className={h.delta >= 0 ? "text-emerald-600 font-bold" : "text-amber-600 font-bold"}>
                        {h.delta >= 0 ? "+" : ""}{Math.round(h.delta)}h
                      </span>
                      <Badge variant={pctToDate >= 95 ? "success" : pctToDate >= 80 ? "warning" : "danger"}>
                        {pctToDate}%
                      </Badge>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden relative">
                    <div className="absolute inset-y-0 border-r-2 border-dashed border-gray-400" style={{ left: `${Math.round(monthsWorked / 12 * 100)}%` }} title="Hoy" />
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: h.personColor }} />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-gray-400 mt-2">La línea punteada marca el progreso esperado a día de hoy</p>
          </div>
        </CardContent>
      </Card>

      {/* Shift distribution per person */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Distribución de turnos (hasta hoy)</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Persona</th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1 text-orange-600"><Sunrise className="w-3.5 h-3.5" /> Mañana</div>
                  </th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1 text-indigo-600"><Moon className="w-3.5 h-3.5" /> Tarde</div>
                  </th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1 text-amber-600"><Sun className="w-3.5 h-3.5" /> Finde</div>
                  </th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1 text-emerald-600"><Clock className="w-3.5 h-3.5" /> Refuerzo</div>
                  </th>
                  <th className="text-center py-2 px-3 text-gray-500 font-medium">Total</th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-1 text-emerald-600"><Palmtree className="w-3.5 h-3.5" /> Vac</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map(p => {
                  const c = shiftCounts.get(p.id)!;
                  const total = c.morning + c.afternoon + c.weekend + c.refuerzo;
                  const vac = vacDays.get(p.id) || 0;
                  return (
                    <tr key={p.id} className="border-b border-gray-50">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: p.color }}>{p.code}</div>
                          <span className="font-medium text-gray-900">{p.name}</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 font-semibold text-orange-700">{c.morning}</td>
                      <td className="text-center py-2.5 font-semibold text-indigo-700">{c.afternoon}</td>
                      <td className="text-center py-2.5 font-semibold text-amber-700">{c.weekend}</td>
                      <td className="text-center py-2.5 font-semibold text-emerald-700">{c.refuerzo}</td>
                      <td className="text-center py-2.5 font-bold text-gray-900">{total}</td>
                      <td className="text-center py-2.5">
                        <span className={vac > vacLimit ? "text-red-600 font-bold" : "text-gray-600"}>{vac}/{vacLimit}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Swap activity */}
      {swaps.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-gray-900">Actividad de intercambios</h2>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {people.map(p => {
                const count = swapsByPerson.get(p.id) || 0;
                return (
                  <div key={p.id} className="text-center p-3 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-lg mx-auto mb-2 flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: p.color }}>
                      {p.name.slice(0, 2)}
                    </div>
                    <p className="text-xl font-bold text-gray-900">{count}</p>
                    <p className="text-xs text-gray-500">{p.name}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
