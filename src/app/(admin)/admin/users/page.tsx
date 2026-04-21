import { prisma } from "@/lib/prisma";
import { UserManagement } from "./user-management";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      phone: true,
      createdAt: true,
      person: { select: { id: true, code: true, name: true } },
    },
  });

  const people = await prisma.person.findMany({
    where: { userId: null },
    select: { id: true, code: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-gray-500 mt-1">
            Gestiona las cuentas de acceso al sistema
          </p>
        </div>
      </div>
      <UserManagement initialUsers={users} availablePeople={people} />
    </div>
  );
}
