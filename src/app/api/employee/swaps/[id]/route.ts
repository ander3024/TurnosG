import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { loadEngineContext, generateSchedule } from "@/lib/engine";

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

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "swap:rejected",
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
            rejectedBy: swap.toPerson.name,
          }),
        },
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
    const isOneWay = swap.isOneWay || swap.toShiftLabel.toLowerCase() === "libra";
    const isPartial = typeof swap.hours === "number" && swap.hours > 0;
    const validation = isPartial
      ? { valid: true, autoApprove: true, reason: `Cobertura parcial de ${swap.hours}h` }
      : isOneWay
      ? { valid: true, autoApprove: true, reason: "Cobertura de turno completo" }
      : validateSwap(swap.fromShiftLabel, swap.toShiftLabel);

    if (validation.autoApprove) {
      // Partial swaps: only track debt, no overrides or timeoffs needed
      // (both people still work their shifts, one just covers extra hours)
      if (isPartial) {
        // Just mark as approved — debt tracking is automatic via the hours field
        await prisma.swapRequest.update({
          where: { id: swapId },
          data: { status: "aprobado", resolvedAt: new Date() },
        });

        // Check if this settles an existing debt
        const existingDebt = await prisma.swapRequest.findFirst({
          where: {
            fromPersonId: swap.toPersonId,
            toPersonId: swap.fromPersonId,
            settled: false,
            status: "aprobado",
            hours: { not: null },
          },
          orderBy: { createdAt: "asc" },
        });
        if (existingDebt) {
          await prisma.swapRequest.updateMany({
            where: { id: { in: [existingDebt.id, swapId] } },
            data: { settled: true },
          });
        }

        await prisma.auditLog.create({
          data: {
            action: "swap:partial-approved",
            entity: "schedule",
            details: JSON.stringify({
              swapId, hours: swap.hours,
              fromPerson: swap.fromPerson.name, toPerson: swap.toPerson.name,
              fromDate: swap.fromDate, fromShift: swap.fromShiftLabel,
            }),
          },
        });

        try {
          await notify({
            eventType: "swap_approved",
            recipientUserIds: [swap.fromUserId, swap.toUserId],
            title: "Cobertura parcial aprobada",
            message: `${swap.toPerson.name} cubrirá ${swap.hours}h a ${swap.fromPerson.name} el ${swap.fromDate}.`,
            link: "/intercambios",
            type: "success",
          });
        } catch {}

        return NextResponse.json({
          swap: { ...swap, status: "aprobado" },
          autoApproved: true,
          message: `Cobertura de ${swap.hours}h aprobada automáticamente.`,
        });
      }

      // Full shift swap: create overrides
      const earliest = swap.fromDate < swap.toDate ? swap.fromDate : swap.toDate;
      const latest = swap.fromDate > swap.toDate ? swap.fromDate : swap.toDate;
      const monthStart = earliest.slice(0, 8) + "01";
      const ym = latest.slice(0, 7).split("-");
      const monthEnd = latest.slice(0, 8) + String(new Date(parseInt(ym[0]), parseInt(ym[1]), 0).getDate()).padStart(2, "0");

      const ctx = await loadEngineContext(monthStart, monthEnd);
      const schedule = generateSchedule(ctx, monthStart, monthEnd);

      // Find fromPerson's ACTUAL assignment on fromDate (whatever shift they really have)
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

          // For one-way swaps: block fromPerson from being reassigned to another shift
          // by creating a TimeOff record for that day (type "intercambio")
          if (isOneWay) {
            // Check if there's already a timeoff for this person+date
            const existingTimeOff = await prisma.timeOffRequest.findFirst({
              where: { personId: swap.fromPersonId, startDate: swap.fromDate, endDate: swap.fromDate, type: "intercambio" },
            });
            if (!existingTimeOff) {
              await prisma.timeOffRequest.create({
                data: {
                  personId: swap.fromPersonId,
                  requesterId: swap.fromUserId,
                  type: "intercambio",
                  startDate: swap.fromDate,
                  endDate: swap.fromDate,
                  status: "aprobada",
                  note: `Intercambio: ${swap.toPerson.name} cubre su turno`,
                },
              });
            }
          }

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

      // For one-way swaps, check if this settles an existing debt (reverse direction)
      if (isOneWay) {
        const existingDebt = await prisma.swapRequest.findFirst({
          where: {
            fromPersonId: swap.toPersonId,
            toPersonId: swap.fromPersonId,
            isOneWay: true,
            settled: false,
            status: "aprobado",
          },
          orderBy: { createdAt: "asc" },
        });
        if (existingDebt) {
          await prisma.swapRequest.update({
            where: { id: existingDebt.id },
            data: { settled: true, settledBySwapId: swapId },
          });
          // Also mark this new swap as settled (it's the return)
          await prisma.swapRequest.update({
            where: { id: swapId },
            data: { settled: true, settledBySwapId: existingDebt.id },
          });
        }
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
          title: isOneWay ? "Cobertura de turno aprobada" : "Intercambio de turno aprobado",
          message: isOneWay
            ? `${swap.toPerson.name} cubrirá el turno completo de ${swap.fromPerson.name} el ${swap.fromDate}.`
            : `Intercambio entre ${swap.fromPerson.name} y ${swap.toPerson.name} aprobado. ${validation.reason}`,
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

      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "swap:accepted-pending-admin",
          entity: "schedule",
          entityId: `swap-${swapId}`,
          details: JSON.stringify({
            swapId,
            fromPerson: swap.fromPerson.name,
            toPerson: swap.toPerson.name,
            fromDate: swap.fromDate,
            toDate: swap.toDate,
            reason: validation.reason,
          }),
        },
      });

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

// DELETE /api/employee/swaps/[id] — cancel my own pending swap
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const swapId = parseInt(id);

    const swap = await prisma.swapRequest.findUnique({
      where: { id: swapId },
      include: {
        fromPerson: { select: { name: true } },
        toPerson: { select: { name: true } },
        toUser: { select: { id: true } },
      },
    });

    if (!swap) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // Only the requester can cancel, and only if still pending
    if (swap.fromUserId !== user.id) {
      return NextResponse.json({ error: "Solo el solicitante puede cancelar" }, { status: 403 });
    }
    if (swap.status !== "pendiente") {
      return NextResponse.json({ error: "Solo se pueden cancelar intercambios pendientes" }, { status: 400 });
    }

    await prisma.swapRequest.delete({ where: { id: swapId } });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "swap:cancelled",
        entity: "schedule",
        entityId: `swap-${swapId}`,
        details: JSON.stringify({
          swapId,
          fromPerson: swap.fromPerson.name,
          toPerson: swap.toPerson.name,
          cancelledBy: swap.fromPerson.name,
        }),
      },
    });

    // Notify the other person that it was cancelled
    try {
      await notify({
        eventType: "swap_rejected",
        recipientUserIds: [swap.toUser.id],
        title: "Intercambio cancelado",
        message: `${swap.fromPerson.name} ha cancelado su propuesta de intercambio.`,
        link: "/intercambios",
        type: "info",
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("DELETE /api/employee/swaps/[id] error:", error);
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
