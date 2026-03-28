import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

// Validate if a swap can be auto-approved
function validateSwap(fromShift: string, toShift: string): {
  valid: boolean;
  autoApprove: boolean;
  reason: string;
} {
  const fromType = getShiftType(fromShift);
  const toType = getShiftType(toShift);

  // Same type → always OK
  if (fromType === toType) {
    return { valid: true, autoApprove: true, reason: "Mismo tipo de turno" };
  }

  // Weekday ↔ Weekday (mañana↔tarde, both 8h) → OK
  if (fromType !== "finde" && toType !== "finde") {
    return { valid: true, autoApprove: true, reason: "Turnos entre semana (mismas horas)" };
  }

  // Weekend ↔ Weekday (12h vs 8h) → needs admin approval
  return {
    valid: true,
    autoApprove: false,
    reason: "Intercambio de fin de semana por entre semana (horas diferentes: 12h vs 8h). Requiere aprobación del administrador.",
  };
}

function getShiftType(label: string): "mañana" | "tarde" | "finde" | "refuerzo" {
  const l = label.toLowerCase();
  if (l.includes("finde") || l.includes("fin")) return "finde";
  if (l.includes("tarde")) return "tarde";
  if (l.includes("refuerzo")) return "refuerzo";
  return "mañana";
}

// PATCH /api/employee/swaps/[id] — accept or reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const swapId = parseInt(id);

    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        fromPerson: { select: { id: true, code: true, name: true } },
        toPerson: { select: { id: true, code: true, name: true } },
      },
    });

    if (!swap) {
      return NextResponse.json({ error: "Intercambio no encontrado" }, { status: 404 });
    }

    if (swap.toUserId !== user.id) {
      return NextResponse.json({ error: "Solo el destinatario puede aceptar o rechazar" }, { status: 403 });
    }

    if (swap.status !== "pendiente") {
      return NextResponse.json({ error: "Este intercambio ya fue procesado" }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    if (!["aceptado", "rechazado"].includes(status)) {
      return NextResponse.json({ error: "Estado debe ser 'aceptado' o 'rechazado'" }, { status: 400 });
    }

    if (status === "rechazado") {
      await prisma.swapRequest.update({
        where: { id: swapId },
        data: { status: "rechazado", resolvedAt: new Date() },
      });

      try {
        await notify({
          eventType: "swap_rejected",
          recipientUserIds: [swap.fromUserId],
          title: "Intercambio rechazado",
          message: `${swap.toPerson.name} ha rechazado tu propuesta de intercambio.`,
          link: "/intercambios",
          type: "warning",
        });
      } catch {}

      return NextResponse.json({ swap: { ...swap, status: "rechazado" } });
    }

    // ── ACEPTADO: validate and possibly auto-approve ──
    const validation = validateSwap(swap.fromShiftLabel, swap.toShiftLabel);

    if (validation.autoApprove) {
      // Auto-approve: create overrides and mark as approved
      // Find shift types for the overrides
      const fromShiftType = await findShiftType(swap.fromShiftLabel);
      const toShiftType = await findShiftType(swap.toShiftLabel);

      if (fromShiftType && toShiftType) {
        // Override 1: fromDate gets toPerson
        await prisma.override.upsert({
          where: { date_shiftTypeId_slotIndex: { date: swap.fromDate, shiftTypeId: fromShiftType.id, slotIndex: 0 } },
          update: { personId: swap.toPersonId },
          create: { date: swap.fromDate, shiftTypeId: fromShiftType.id, personId: swap.toPersonId, slotIndex: 0 },
        });
        // Override 2: toDate gets fromPerson
        await prisma.override.upsert({
          where: { date_shiftTypeId_slotIndex: { date: swap.toDate, shiftTypeId: toShiftType.id, slotIndex: 0 } },
          update: { personId: swap.fromPersonId },
          create: { date: swap.toDate, shiftTypeId: toShiftType.id, personId: swap.fromPersonId, slotIndex: 0 },
        });
      }

      await prisma.swapRequest.update({
        where: { id: swapId },
        data: { status: "aprobado", resolvedAt: new Date() },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: "swap:auto-approved",
          entity: "schedule",
          details: JSON.stringify({
            source: "intercambio",
            fromPerson: swap.fromPerson.name,
            toPerson: swap.toPerson.name,
            fromDate: swap.fromDate,
            toDate: swap.toDate,
            fromShift: swap.fromShiftLabel,
            toShift: swap.toShiftLabel,
            reason: validation.reason,
          }),
        },
      });

      // Notify both
      try {
        await notify({
          eventType: "swap_approved",
          recipientUserIds: [swap.fromUserId, swap.toUserId],
          title: "Intercambio aprobado automáticamente",
          message: `El intercambio entre ${swap.fromPerson.name} y ${swap.toPerson.name} ha sido aprobado. ${validation.reason}`,
          link: "/intercambios",
          type: "success",
        });
      } catch {}

      return NextResponse.json({
        swap: { ...swap, status: "aprobado" },
        autoApproved: true,
        message: `Intercambio aprobado automáticamente. ${validation.reason}`,
      });

    } else {
      // Needs admin approval: mark as "aceptado" (waiting for admin)
      await prisma.swapRequest.update({
        where: { id: swapId },
        data: { status: "aceptado", resolvedAt: new Date() },
      });

      // Notify admins
      try {
        const admins = await prisma.user.findMany({
          where: { role: "admin", active: true },
          select: { id: true },
        });
        await notify({
          eventType: "swap_accepted",
          recipientUserIds: admins.map((a) => a.id),
          title: "Intercambio requiere aprobación",
          message: `${swap.fromPerson.name} y ${swap.toPerson.name} quieren intercambiar turnos pero no cumple las reglas automáticas: ${validation.reason}`,
          link: "/admin/swaps",
          type: "warning",
        });
      } catch {}

      // Notify requester
      try {
        await notify({
          eventType: "swap_accepted",
          recipientUserIds: [swap.fromUserId],
          title: "Intercambio aceptado - pendiente de admin",
          message: `${swap.toPerson.name} ha aceptado tu intercambio, pero necesita aprobación del administrador: ${validation.reason}`,
          link: "/intercambios",
          type: "info",
        });
      } catch {}

      return NextResponse.json({
        swap: { ...swap, status: "aceptado" },
        autoApproved: false,
        message: validation.reason,
        needsAdminApproval: true,
      });
    }

  } catch (error: any) {
    console.error("PATCH /api/employee/swaps/[id] error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

async function findShiftType(shiftLabel: string) {
  const l = shiftLabel.toLowerCase();
  let code = "morning";
  if (l.includes("finde") || l.includes("fin")) code = "weekend";
  else if (l.includes("refuerzo") && l.includes("tarde")) code = "refuerzo_afternoon";
  else if (l.includes("refuerzo") && l.includes("mañana")) code = "refuerzo_morning";
  else if (l.includes("refuerzo")) code = "refuerzo_ofi";
  else if (l.includes("tarde")) code = "afternoon";

  return prisma.shiftType.findUnique({ where: { code } });
}
