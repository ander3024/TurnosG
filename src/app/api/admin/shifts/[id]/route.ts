import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/shifts/[id] - Update shift type
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const shiftId = parseInt(id);

    if (isNaN(shiftId)) {
      return NextResponse.json({ error: "Invalid shift ID" }, { status: 400 });
    }

    const existing = await prisma.shiftType.findUnique({ where: { id: shiftId } });
    if (!existing) {
      return NextResponse.json({ error: "Shift type not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    const stringFields = ["code", "label", "startTime", "endTime", "category"] as const;
    for (const field of stringFields) {
      if (body[field] !== undefined) { data[field] = body[field]; changes[field] = body[field]; }
    }
    if (typeof body.lunchMinutes === "number") { data.lunchMinutes = body.lunchMinutes; changes.lunchMinutes = body.lunchMinutes; }
    if (typeof body.active === "boolean") { data.active = body.active; changes.active = body.active; }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const shift = await prisma.shiftType.update({
      where: { id: shiftId },
      data,
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "shiftType",
        entityId: String(shiftId),
        details: JSON.stringify(changes),
      },
    });

    return NextResponse.json(shift);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/shifts/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/shifts/[id] - Delete shift type
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const shiftId = parseInt(id);

    if (isNaN(shiftId)) {
      return NextResponse.json({ error: "Invalid shift ID" }, { status: 400 });
    }

    const existing = await prisma.shiftType.findUnique({ where: { id: shiftId } });
    if (!existing) {
      return NextResponse.json({ error: "Shift type not found" }, { status: 404 });
    }

    // Check for related overrides before deleting
    const relatedOverrides = await prisma.override.count({ where: { shiftTypeId: shiftId } });
    if (relatedOverrides > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${relatedOverrides} override(s) reference this shift type` },
        { status: 409 }
      );
    }

    await prisma.shiftType.delete({ where: { id: shiftId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "shiftType",
        entityId: String(shiftId),
        details: JSON.stringify({ code: existing.code, label: existing.label }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/shifts/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
