import { prisma } from "@/lib/prisma";
import { AuditLogViewer } from "./audit-log-viewer";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const logs = await prisma.auditLog.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });

  const totalCount = await prisma.auditLog.count();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Registro de actividad</h1>
        <p className="text-gray-500 mt-1">
          Historial de todas las acciones realizadas en el sistema
        </p>
      </div>
      <AuditLogViewer initialLogs={logs} totalCount={totalCount} />
    </div>
  );
}
