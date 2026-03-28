import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, statusColor, statusLabel } from "@/lib/utils";
import {
  Clock,
  CalendarCheck,
  Palmtree,
  Bell,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export default async function EmployeeDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Find linked person
  const person = await prisma.person.findFirst({
    where: { userId: user.id },
  });

  const today = new Date().toISOString().split("T")[0];

  // Pending requests count
  const pendingCount = person
    ? await prisma.timeOffRequest.count({
        where: { personId: person.id, status: "pendiente" },
      })
    : 0;

  // Approved vacation days this year
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  const approvedVacations = person
    ? await prisma.timeOffRequest.findMany({
        where: {
          personId: person.id,
          status: "aprobada",
          type: "vacaciones",
          startDate: { gte: yearStart },
          endDate: { lte: yearEnd },
        },
      })
    : [];

  // Calculate total approved vacation days
  let approvedDays = 0;
  for (const req of approvedVacations) {
    const start = new Date(req.startDate + "T00:00:00");
    const end = new Date(req.endDate + "T00:00:00");
    const diff = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    approvedDays += diff + 1;
  }

  // Upcoming approved time off
  const upcomingTimeOff = person
    ? await prisma.timeOffRequest.findMany({
        where: {
          personId: person.id,
          status: "aprobada",
          endDate: { gte: today },
        },
        orderBy: { startDate: "asc" },
        take: 5,
      })
    : [];

  // Next shift (overrides for today or next days)
  const nextOverride = person
    ? await prisma.override.findFirst({
        where: {
          personId: person.id,
          date: { gte: today },
        },
        include: { shiftType: true },
        orderBy: { date: "asc" },
      })
    : null;

  // Recent notifications
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const unreadCount = notifications.filter((n: { read: boolean }) => !n.read).length;

  const firstName = user.name.split(" ")[0];

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Hola, {firstName}
        </h1>
        <p className="text-gray-500 mt-1">
          Bienvenido a tu portal de empleado
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Solicitudes pendientes</p>
              <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
              <Palmtree className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">
                Vacaciones aprobadas ({new Date().getFullYear()})
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {approvedDays}{" "}
                <span className="text-sm font-normal text-gray-400">dias</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Proximo turno</p>
              {nextOverride ? (
                <p className="text-lg font-bold text-gray-900">
                  {formatDate(nextOverride.date)}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    {nextOverride.shiftType.startTime} -{" "}
                    {nextOverride.shiftType.endTime}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-gray-400">Sin turnos asignados</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming time off */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Proximas ausencias
              </h2>
              <Link
                href="/vacaciones"
                className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {upcomingTimeOff.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No tienes ausencias programadas
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingTimeOff.map((req: { id: number; startDate: string; endDate: string; type: string; status: string }) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(req.startDate)} - {formatDate(req.endDate)}
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {req.type.replace("_", " ")}
                      </p>
                    </div>
                    <Badge className={statusColor(req.status)}>
                      {statusLabel(req.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900">Notificaciones</h2>
                {unreadCount > 0 && (
                  <Badge variant="info">{unreadCount} nuevas</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                No tienes notificaciones
              </p>
            ) : (
              <div className="space-y-3">
                {notifications.map((notif: { id: number; title: string; message: string; read: boolean }) => (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-3 py-2 ${
                      !notif.read ? "bg-blue-50/50 -mx-2 px-2 rounded-xl" : ""
                    }`}
                  >
                    <Bell
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        notif.read ? "text-gray-300" : "text-indigo-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {notif.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {notif.message}
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
