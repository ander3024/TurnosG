import { prisma } from "@/lib/prisma";
import { SettingsManagement } from "./settings-management";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany({
    orderBy: { key: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 mt-1">
          Ajusta los parámetros del sistema de turnos. Los cambios se aplican inmediatamente.
        </p>
      </div>
      <SettingsManagement initialSettings={settings} />
    </div>
  );
}
