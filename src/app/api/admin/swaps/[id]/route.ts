import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

// PATCH /api/admin/swaps/[id] — admin approves or rejects an accepted swap
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const swapId = parseInt(id);

    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        fromPerson: { select: { id: true, code: true, name: true } },
        toPerson: { select: { id: true, code: true, name: true } },
      },
    });

    if (!swap) {
      return NextResponse.json({ error: "Intercambio no encontrado" }, { status: 404 });
    }

    if (swap.status !== "aceptado") {
      return NextResponse.json(
        { error: "Solo se pueden aprobar/rechazar intercambios aceptados por el empleado" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { status } = body;

    if (!["aprobado", "rechazado"].includes(status)) {
      return NextResponse.json(
        { error: "Estado debe ser 'aprobado' o 'rechazado'" },
        { status: 400 }
      );
    }

    const updated = await prisma.swapRequest.update({
      where: { id: swapId },
      data: {
        status,
        resolvedAt: new Date(),
      },
    });

    if (status === "aprobado") {
      // Find shift types by label to create overrides
      const fromShiftType = await prisma.shiftType.findFirst({
        where: { label: swap.fromShiftLabel },
      });
      const toShiftType = await prisma.shiftType.findFirst({
        where: { label: swap.toShiftLabel },
      });

      if (fromShiftType && toShiftType) {
        // Override 1: fromDate + fromShift → toPerson (toPerson takes fromPerson's shift)
        await prisma.override.upsert({
          where: {
            date_shiftTypeId_slotIndex: {
              date: swap.fromDate,
              shiftTypeId: fromShiftType.id,
              slotIndex: 0,
            },
          },
          update: { personId: swap.toPersonId },
          create: {
            date: swap.fromDate,
            shiftTypeId: fromShiftType.id,
            personId: swap.toPersonId,
            slotIndex: 0,
          },
        });

        // Override 2: toDate + toShift → fromPerson (fromPerson takes toPerson's shift)
        await prisma.override.upsert({
          where: {
            date_shiftTypeId_slotIndex: {
              date: swap.toDate,
              shiftTypeId: toShiftType.id,
              slotIndex: 0,
            },
          },
          update: { personId: swap.fromPersonId },
          create: {
            date: swap.toDate,
            shiftTypeId: toShiftType.id,
            personId: swap.fromPersonId,
            slotIndex: 0,
          },
        });

        // Audit log for both overrides
        await prisma.auditLog.create({
          data: {
            actorId: admin.id,
            action: "swap:approved",
            entity: "schedule",
            entityId: `swap-${swapId}`,
            details: JSON.stringify({
              swapId,
              fromPerson: swap.fromPerson.name,
              toPerson: swap.toPerson.name,
              fromDate: swap.fromDate,
              toDate: swap.toDate,
              fromShift: swap.fromShiftLabel,
              toShift: swap.toShiftLabel,
              source: "intercambio",
            }),
          },
        });
      }

      // Notify both employees
      try {
        await notify({
          eventType: "swap_approved",
          recipientUserIds: [swap.fromUserId, swap.toUserId],
          title: "Intercambio aprobado",
          message: `El intercambio de turno entre ${swap.fromPerson.name} y ${swap.toPerson.name} ha sido aprobado. Los turnos han sido actualizados.`,
          link: "/calendar",
          type: "success",
        });
      } catch {
        /* notification failure shouldn't block */
      }
    } else {
      // Rejected by admin — notify both employees
      try {
        await notify({
          eventType: "swap_rejected",
          recipientUserIds: [swap.fromUserId, swap.toUserId],
          title: "Intercambio rechazado",
          message: `El intercambio de turno entre ${swap.fromPerson.name} y ${swap.toPerson.name} ha sido rechazado por administración.`,
          link: "/swaps",
          type: "warning",
        });
      } catch {
        /* notification failure shouldn't block */
      }

      // Audit log for rejection
      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "swap:rejected",
          entity: "schedule",
          entityId: `swap-${swapId}`,
          details: JSON.stringify({
            swapId,
            fromPerson: swap.fromPerson.name,
            toPerson: swap.toPerson.name,
          }),
        },
      });
    }

    return NextResponse.json({ swap: updated });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/swaps/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
