import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { loadScheduleState } from "@/lib/schedule-state";

/**
 * Cuadrante ya recalculado para devolverlo junto al guardado: un solo viaje, y
 * la pantalla no puede quedarse pintando lo de antes. `range` es opcional.
 */
async function stateFor(range: { from?: string; to?: string } | null) {
  if (!range?.from || !range?.to) return null;
  try {
    return await loadScheduleState(range.from, range.to);
  } catch (e) {
    console.error("override: no se pudo recalcular el estado", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { date, shiftTypeId, personId, slotIndex, from, to } = body;

    if (!date || !shiftTypeId) {
      return NextResponse.json(
        { error: "date and shiftTypeId are required" },
        { status: 400 }
      );
    }

    // Verify shift type exists
    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });
    if (!shiftType) {
      return NextResponse.json({ error: "Shift type not found" }, { status: 404 });
    }

    // Verify person exists if provided
    if (personId) {
      const person = await prisma.person.findUnique({ where: { id: personId } });
      if (!person) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
    }

    // Upsert override
    // Detect no-op writes (same person already assigned) to skip duplicate audit logs and notifications
    const existing = await prisma.override.findUnique({
      where: {
        date_shiftTypeId_slotIndex: { date, shiftTypeId, slotIndex: slotIndex ?? 0 },
      },
    });
    const newPersonId = personId || null;
    const isNoOp = existing && existing.personId === newPersonId;

    const override = await prisma.override.upsert({
      where: {
        date_shiftTypeId_slotIndex: {
          date,
          shiftTypeId,
          slotIndex: slotIndex ?? 0,
        },
      },
      update: { personId: newPersonId },
      create: {
        date,
        shiftTypeId,
        personId: newPersonId,
        slotIndex: slotIndex ?? 0,
      },
      include: {
        shiftType: { select: { code: true, label: true } },
        person: { select: { code: true, name: true } },
      },
    });

    if (!isNoOp) {
      const personName = personId
        ? (await prisma.person.findUnique({ where: { id: personId }, select: { name: true } }))?.name || `#${personId}`
        : "vacío";

      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "override",
          entity: "schedule",
          entityId: `${date}-${shiftType.code}-${slotIndex ?? 0}`,
          details: JSON.stringify({
            date,
            shiftType: shiftType.label,
            personId,
            personName,
            slotIndex: slotIndex ?? 0,
          }),
        },
      });
    }

    // Avisar al empleado, solo si el cambio es real y el día está por venir:
    // un push de "tu turno del 18-sep ha sido modificado" cinco semanas después
    // no le sirve para nada y solo le hace dudar de lo que ya trabajó. El cambio
    // queda igualmente en el registro de auditoría de arriba.
    const hoy = new Date().toISOString().slice(0, 10);
    if (personId && !isNoOp && date >= hoy) {
      try {
        const { notify } = await import("@/lib/notifications");
        const person = await prisma.person.findUnique({ where: { id: personId }, include: { user: true } });
        if (person?.user) {
          await notify({
            eventType: "shift_change",
            recipientUserIds: [person.user.id],
            title: "Cambio de turno",
            message: `Tu turno del ${date} (${shiftType.label}) ha sido modificado.`,
            link: "/calendar",
            type: "warning",
          });
        }
      } catch { /* notification failure shouldn't block */ }
    }

    const state = await stateFor({ from, to });
    return NextResponse.json({ ...override, override, ...(state || {}) });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/schedule/override error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const shiftTypeId = searchParams.get("shiftTypeId");
    const slotIndex = searchParams.get("slotIndex") || "0";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!date || !shiftTypeId) {
      return NextResponse.json(
        { error: "date and shiftTypeId required" },
        { status: 400 }
      );
    }

    await prisma.override.delete({
      where: {
        date_shiftTypeId_slotIndex: {
          date,
          shiftTypeId: parseInt(shiftTypeId),
          slotIndex: parseInt(slotIndex),
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "override:remove",
        entity: "schedule",
        entityId: `${date}-${shiftTypeId}-${slotIndex}`,
      },
    });

    const state = await stateFor({ from: from || undefined, to: to || undefined });
    return NextResponse.json({ success: true, ...(state || {}) });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/schedule/override error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
