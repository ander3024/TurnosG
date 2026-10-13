import { prisma } from "@/lib/prisma";
import { ShiftManagement } from "./shift-management";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ShiftsPage() {
  await requireAdminPage();
  const shifts = await prisma.shiftType.findMany({
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tipos de turno</h1>
        <p className="text-gray-500 mt-1">
          Configura los distintos tipos de turno del sistema
        </p>
      </div>
      <ShiftManagement initialShifts={shifts} />
    </div>
  );
}
