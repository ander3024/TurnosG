import { prisma } from "@/lib/prisma";
import { EventManagement } from "./event-management";
import Link from "next/link";

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { startDate: "desc" },
  });

  const people = await prisma.person.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Eventos especiales</h1>
            <p className="text-gray-500 mt-1">Gestiona periodos especiales que afectan a la planificación de turnos</p>
          </div>
          <Link href="/admin/events/commercial" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            Generar automáticos
          </Link>
        </div>
        <p className="text-gray-500 mt-1 hidden">
          Gestiona periodos especiales que afectan a la planificacion de turnos
        </p>
      </div>
      <EventManagement initialEvents={events} people={people} />
    </div>
  );
}
