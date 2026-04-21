import { prisma } from "@/lib/prisma";
import { HolidayManagement } from "./holiday-management";

export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const holidays = await prisma.holiday.findMany({
    orderBy: [{ year: "desc" }, { date: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Festivos</h1>
        <p className="text-gray-500 mt-1">
          Gestiona los dias festivos oficiales, personalizados y laborables especiales
        </p>
      </div>
      <HolidayManagement initialHolidays={holidays} />
    </div>
  );
}
