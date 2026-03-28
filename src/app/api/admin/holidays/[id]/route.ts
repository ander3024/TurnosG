import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/holidays/[id] - Update holiday
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const holidayId = parseInt(id);

    if (isNaN(holidayId)) {
      return NextResponse.json({ error: "Invalid holiday ID" }, { status: 400 });
    }

    const existing = await prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!existing) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    if (body.date !== undefined) { data.date = body.date; changes.date = body.date; }
    if (body.label !== undefined) { data.label = body.label; changes.label = body.label; }
    if (body.type !== undefined) { data.type = body.type; changes.type = body.type; }
    if (body.province !== undefined) { data.province = body.province; changes.province = body.province; }
    if (typeof body.year === "number") { data.year = body.year; changes.year = body.year; }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const holiday = await prisma.holiday.update({
      where: { id: holidayId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "holiday",
        entityId: String(holidayId),
        details: JSON.stringify(changes),
      },
    });

    return NextResponse.json(holiday);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/holidays/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/holidays/[id] - Delete holiday
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const holidayId = parseInt(id);

    if (isNaN(holidayId)) {
      return NextResponse.json({ error: "Invalid holiday ID" }, { status: 400 });
    }

    const existing = await prisma.holiday.findUnique({ where: { id: holidayId } });
    if (!existing) {
      return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
    }

    await prisma.holiday.delete({ where: { id: holidayId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "holiday",
        entityId: String(holidayId),
        details: JSON.stringify({ date: existing.date, label: existing.label }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/holidays/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
