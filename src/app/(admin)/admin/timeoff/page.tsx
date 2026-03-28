import { prisma } from "@/lib/prisma";
import { TimeOffManagement } from "./timeoff-management";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function TimeOffPage() {
  const [requests, people, holidays, settings] = await Promise.all([
    prisma.timeOffRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        person: { select: { id: true, code: true, name: true, color: true } },
        requester: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.person.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.holiday.findMany(),
    prisma.setting.findMany(),
  ]);

  const vacLimit = parseInt(settings.find((s) => s.key === "vacationDaysNatural")?.value || "23");
  const holidayDates = new Set(holidays.map((h) => h.date));

  // Calculate vacation days per person
  const vacSummary = people.map((person) => {
    const approved = requests.filter(
      (r) => r.personId === person.id && r.status === "aprobada" && r.type === "vacaciones"
    );
    let usedDays = 0;
    for (const t of approved) {
      const s = new Date(t.startDate + "T12:00:00Z");
      const e = new Date(t.endDate + "T12:00:00Z");
      const d = new Date(s);
      while (d <= e) {
        if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayDates.has(d.toISOString().slice(0, 10))) usedDays++;
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    return {
      personId: person.id,
      code: person.code,
      name: person.name,
      color: person.color,
      used: usedDays,
      total: vacLimit,
      remaining: vacLimit - usedDays,
      exceeded: usedDays > vacLimit,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Solicitudes de ausencia</h1>
        <p className="text-gray-500 mt-1">
          Revisa y gestiona las solicitudes de vacaciones y ausencias
        </p>
      </div>

      {/* Vacation days summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {vacSummary.map((v) => (
          <Card key={v.personId} className={v.exceeded ? "!border-red-300 !bg-red-50/50" : ""}>
            <CardContent className="!p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: v.color }} />
                <span className="text-sm font-semibold text-gray-900">{v.code} - {v.name}</span>
              </div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xl font-bold text-gray-900">{v.used}</span>
                <span className="text-sm text-gray-500">/ {v.total} días</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (v.used / v.total) * 100)}%`,
                    backgroundColor: v.exceeded ? "#ef4444" : v.remaining <= 3 ? "#f59e0b" : v.color,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">{v.used} usados</span>
                {v.exceeded ? (
                  <Badge variant="danger">{Math.abs(v.remaining)} de más</Badge>
                ) : v.remaining === 0 ? (
                  <Badge variant="warning">Agotados</Badge>
                ) : (
                  <span className="text-emerald-600 font-medium">{v.remaining} disponibles</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <TimeOffManagement initialRequests={requests} />
    </div>
  );
}
