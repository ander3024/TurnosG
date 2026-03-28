import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { date, shiftTypeId, personId, slotIndex } = body;

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
    const override = await prisma.override.upsert({
      where: {
        date_shiftTypeId_slotIndex: {
          date,
          shiftTypeId,
          slotIndex: slotIndex ?? 0,
        },
      },
      update: { personId: personId || null },
      create: {
        date,
        shiftTypeId,
        personId: personId || null,
        slotIndex: slotIndex ?? 0,
      },
      include: {
        shiftType: { select: { code: true, label: true } },
        person: { select: { code: true, name: true } },
      },
    });

    // Get person name for audit log
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

    // Notify the affected employee
    if (personId) {
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

    return NextResponse.json(override);
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

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/schedule/override error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
