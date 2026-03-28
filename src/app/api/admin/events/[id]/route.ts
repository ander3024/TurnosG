import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/events/[id] - Update event
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const eventId = parseInt(id);

    if (isNaN(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const existing = await prisma.event.findUnique({ where: { id: eventId } });
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    const fields = ["label", "startDate", "endDate", "color", "notes", "weekdayRefuerzo"] as const;
    for (const field of fields) {
      if (body[field] !== undefined) { data[field] = body[field]; changes[field] = body[field]; }
    }
    if (typeof body.weekdaysExtraSlots === "number") { data.weekdaysExtraSlots = body.weekdaysExtraSlots; changes.weekdaysExtraSlots = body.weekdaysExtraSlots; }
    if (typeof body.weekendExtraSlots === "number") { data.weekendExtraSlots = body.weekendExtraSlots; changes.weekendExtraSlots = body.weekendExtraSlots; }
    if (body.assigneePersonId !== undefined) { data.assigneePersonId = body.assigneePersonId || null; changes.assigneePersonId = body.assigneePersonId; }
    if (typeof body.assigneeForced === "boolean") { data.assigneeForced = body.assigneeForced; changes.assigneeForced = body.assigneeForced; }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "event",
        entityId: String(eventId),
        details: JSON.stringify(changes),
      },
    });

    return NextResponse.json(event);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/events/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/events/[id] - Delete event
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const eventId = parseInt(id);

    if (isNaN(eventId)) {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }

    const existing = await prisma.event.findUnique({ where: { id: eventId } });
    if (!existing) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    await prisma.event.delete({ where: { id: eventId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "event",
        entityId: String(eventId),
        details: JSON.stringify({ label: existing.label }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/events/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
