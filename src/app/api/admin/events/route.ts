import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/events - List all events
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, any> = {};
    if (startDate) where.startDate = { gte: startDate };
    if (endDate) where.endDate = { lte: endDate };

    const events = await prisma.event.findMany({
      where,
      orderBy: { startDate: "desc" },
    });

    return NextResponse.json(events);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/events error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/events - Create a new event
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { label, startDate, endDate, weekdaysExtraSlots, weekendExtraSlots, assigneePersonId, assigneeForced, weekdayRefuerzo, color, notes } = body;

    if (!label || !startDate || !endDate) {
      return NextResponse.json({ error: "label, startDate and endDate are required" }, { status: 400 });
    }

    const event = await prisma.event.create({
      data: {
        label,
        startDate,
        endDate,
        weekdaysExtraSlots: weekdaysExtraSlots ?? 0,
        weekendExtraSlots: weekendExtraSlots ?? 0,
        assigneePersonId: assigneePersonId || null,
        assigneeForced: assigneeForced ?? false,
        weekdayRefuerzo: weekdayRefuerzo || null,
        color: color || null,
        notes: notes || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "event",
        entityId: String(event.id),
        details: JSON.stringify({ label, startDate, endDate }),
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/events error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
