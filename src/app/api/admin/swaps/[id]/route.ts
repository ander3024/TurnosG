import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { loadEngineContext, generateSchedule } from "@/lib/engine";

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

    if (!["pendiente", "aceptado"].includes(swap.status)) {
      return NextResponse.json(
        { error: "Solo se pueden gestionar intercambios pendientes o aceptados" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { status } = body;

    if (!["aprobado", "rechazado", "cancelado"].includes(status)) {
      return NextResponse.json(
        { error: "Estado debe ser 'aprobado', 'rechazado' o 'cancelado'" },
        { status: 400 }
      );
    }

    // Only "aceptado" swaps can be approved (both parties agreed)
    if (status === "aprobado" && swap.status !== "aceptado") {
      return NextResponse.json(
        { error: "Solo se pueden aprobar intercambios aceptados por el empleado" },
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

    if (status === "cancelado") {
      // Admin cancels the swap — notify both employees
      try {
        await notify({
          eventType: "swap_rejected",
          recipientUserIds: [swap.fromUserId, swap.toUserId],
          title: "Intercambio cancelado por admin",
          message: `El intercambio de turno entre ${swap.fromPerson.name} y ${swap.toPerson.name} ha sido cancelado por administración.`,
          link: "/intercambios",
          type: "warning",
        });
      } catch {}

      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "swap:cancelled",
          entity: "schedule",
          entityId: `swap-${swapId}`,
          details: JSON.stringify({
            swapId,
            fromPerson: swap.fromPerson.name,
            toPerson: swap.toPerson.name,
            previousStatus: swap.status,
          }),
        },
      });

      return NextResponse.json({ swap: updated });
    }

    if (status === "aprobado") {
      const isOneWay = swap.toShiftLabel.toLowerCase() === "libra";

      // Generate schedule for the FULL MONTH (balance algorithm needs full context)
      const earliest = swap.fromDate < swap.toDate ? swap.fromDate : swap.toDate;
      const latest = swap.fromDate > swap.toDate ? swap.fromDate : swap.toDate;
      const monthStart = earliest.slice(0, 8) + "01";
      const ym = latest.slice(0, 7).split("-");
      const monthEnd = latest.slice(0, 8) + String(new Date(parseInt(ym[0]), parseInt(ym[1]), 0).getDate()).padStart(2, "0");

      const ctx = await loadEngineContext(monthStart, monthEnd);
      const schedule = generateSchedule(ctx, monthStart, monthEnd);

      const fromDay = schedule.find(d => d.date === swap.fromDate);
      const fromAssignment = fromDay?.assignments.find(a => a.personId === swap.fromPersonId);

      if (fromAssignment) {
        const actualShiftType = await prisma.shiftType.findFirst({ where: { code: fromAssignment.shiftTypeCode } });

        if (actualShiftType) {
          // Override 1: replace fromPerson with toPerson on their actual shift+slot
          await prisma.override.upsert({
            where: { date_shiftTypeId_slotIndex: { date: swap.fromDate, shiftTypeId: actualShiftType.id, slotIndex: fromAssignment.slotIndex } },
            update: { personId: swap.toPersonId },
            create: { date: swap.fromDate, shiftTypeId: actualShiftType.id, personId: swap.toPersonId, slotIndex: fromAssignment.slotIndex },
          });

          // Override 2: only for two-way swaps
          if (!isOneWay) {
            const toDay = schedule.find(d => d.date === swap.toDate);
            const toAssignment = toDay?.assignments.find(a => a.personId === swap.toPersonId);
            if (toAssignment) {
              const toActualShiftType = await prisma.shiftType.findFirst({ where: { code: toAssignment.shiftTypeCode } });
              if (toActualShiftType) {
                await prisma.override.upsert({
                  where: { date_shiftTypeId_slotIndex: { date: swap.toDate, shiftTypeId: toActualShiftType.id, slotIndex: toAssignment.slotIndex } },
                  update: { personId: swap.fromPersonId },
                  create: { date: swap.toDate, shiftTypeId: toActualShiftType.id, personId: swap.fromPersonId, slotIndex: toAssignment.slotIndex },
                });
              }
            }
          }
        }
      }

      // Audit log
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

// DELETE /api/admin/swaps/[id] — admin deletes a swap completely
export async function DELETE(
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
        fromPerson: { select: { name: true } },
        toPerson: { select: { name: true } },
      },
    });

    if (!swap) {
      return NextResponse.json({ error: "Intercambio no encontrado" }, { status: 404 });
    }

    await prisma.swapRequest.delete({ where: { id: swapId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "swap:deleted",
        entity: "schedule",
        entityId: `swap-${swapId}`,
        details: JSON.stringify({
          swapId,
          fromPerson: swap.fromPerson.name,
          toPerson: swap.toPerson.name,
          status: swap.status,
        }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/swaps/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
