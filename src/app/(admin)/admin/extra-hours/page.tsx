import { prisma } from "@/lib/prisma";
import { ExtraHoursManagement } from "./extra-hours-management";

export default async function ExtraHoursPage() {
  const entries = await prisma.extraHours.findMany({
    orderBy: { date: "desc" },
    include: {
      person: { select: { id: true, code: true, name: true } },
      actor: { select: { id: true, name: true } },
    },
  });

  const people = await prisma.person.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Horas extra</h1>
        <p className="text-gray-500 mt-1">
          Registro de horas extra trabajadas por los empleados
        </p>
      </div>
      <ExtraHoursManagement initialEntries={entries} people={people} />
    </div>
  );
}
