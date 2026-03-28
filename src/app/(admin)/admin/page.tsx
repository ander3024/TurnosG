import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, Palmtree, Clock, AlertCircle, CheckCircle2, ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { loadEngineContext, generateSchedule, buildHoursSummary } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [
    userCount,
    personCount,
    pendingTimeOff,
    approvedTimeOff,
    eventCount,
    recentAudit,
    extraHoursSum,
  ] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.person.count({ where: { active: true } }),
    prisma.timeOffRequest.count({ where: { status: "pendiente" } }),
    prisma.timeOffRequest.count({ where: { status: "aprobada" } }),
    prisma.event.count(),
    prisma.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.extraHours.aggregate({ _sum: { hours: true } }),
  ]);

  const stats = [
    {
      label: "Usuarios activos",
      value: userCount,
      icon: Users,
      color: "bg-blue-50 text-blue-700",
      iconColor: "text-blue-600",
      href: "/admin/users",
    },
    {
      label: "Empleados",
      value: personCount,
      icon: Calendar,
      color: "bg-emerald-50 text-emerald-700",
      iconColor: "text-emerald-600",
      href: "/admin/people",
    },
    {
      label: "Solicitudes pendientes",
      value: pendingTimeOff,
      icon: AlertCircle,
      color: "bg-amber-50 text-amber-700",
      iconColor: "text-amber-600",
      href: "/admin/timeoff",
    },
    {
      label: "Vacaciones aprobadas",
      value: approvedTimeOff,
      icon: CheckCircle2,
      color: "bg-indigo-50 text-indigo-700",
      iconColor: "text-indigo-600",
      href: "/admin/timeoff",
    },
    {
      label: "Eventos especiales",
      value: eventCount,
      icon: Palmtree,
      color: "bg-purple-50 text-purple-700",
      iconColor: "text-purple-600",
      href: "/admin/events",
    },
    {
      label: "Horas extra totales",
      value: extraHoursSum._sum.hours ?? 0,
      icon: Clock,
      color: "bg-rose-50 text-rose-700",
      iconColor: "text-rose-600",
      href: "/admin/extra-hours",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen general del sistema de turnos</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center gap-4 !py-5">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                    <Icon className={`w-6 h-6 ${stat.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Hours vs Target per person */}
      <HoursOverview />

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Acciones rápidas</h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Gestionar solicitudes de vacaciones", href: "/admin/timeoff", desc: `${pendingTimeOff} pendientes` },
              { label: "Configurar eventos especiales", href: "/admin/events", desc: `${eventCount} eventos` },
              { label: "Gestionar empleados", href: "/admin/people", desc: `${personCount} activos` },
              { label: "Ver calendario de turnos", href: "/admin/calendar", desc: "Vista mensual" },
              { label: "Configuración del sistema", href: "/admin/settings", desc: "Reglas y políticas" },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-600 transition-colors" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Actividad reciente</h2>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Sin actividad reciente</p>
            ) : (
              <div className="space-y-3">
                {recentAudit.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700">
                        <span className="font-medium">{log.actor?.name || "Sistema"}</span>
                        {" "}
                        <span className="text-gray-500">{log.action}</span>
                        {" "}
                        <span className="text-gray-600">{log.entity}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString("es-ES")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function HoursOverview() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const ctx = await loadEngineContext(from, to);
    const schedule = generateSchedule(ctx, from, to);
    const allAssignments = schedule.flatMap((d) => d.assignments);
    const holidayDates = new Set<string>();
    for (const [date, h] of ctx.holidays) {
      if (!ctx.settings.consumeVacationOnHoliday || h.type !== "working") {
        holidayDates.add(date);
      }
    }
    const hours = buildHoursSummary(
      allAssignments, ctx.extraHours, ctx.timeOffs,
      ctx.settings.annualTargetHours, ctx.settings.vacationDaysNatural,
      ctx.people, holidayDates
    );

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Horas anuales vs objetivo</h2>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {hours.map((h) => {
              const pct = Math.min(100, Math.round((h.totalHours / h.targetHours) * 100));
              return (
                <div key={h.personId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: h.personColor }} />
                      <span className="font-medium text-gray-900">{h.personCode} - {h.personName}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Vac: {h.vacationDaysUsed}/{h.vacationDaysTotal}d</span>
                      <span className="font-semibold text-gray-900">{Math.round(h.totalHours)}h / {h.targetHours}h</span>
                      <span className={h.delta >= 0 ? "text-emerald-600" : "text-amber-600"}>
                        ({h.delta >= 0 ? "+" : ""}{Math.round(h.delta)}h)
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: h.personColor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  } catch {
    return null;
  }
}
