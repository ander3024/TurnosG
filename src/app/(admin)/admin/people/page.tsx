import { prisma } from "@/lib/prisma";
import { PeopleManagement } from "./people-management";

export default async function PeoplePage() {
  const people = await prisma.person.findMany({
    orderBy: { code: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const availableUsers = await prisma.user.findMany({
    where: { person: null, active: true },
    select: { id: true, name: true, email: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
        <p className="text-gray-500 mt-1">
          Gestiona las personas asignadas al calendario de turnos
        </p>
      </div>
      <PeopleManagement
        initialPeople={people}
        availableUsers={availableUsers}
      />
    </div>
  );
}
