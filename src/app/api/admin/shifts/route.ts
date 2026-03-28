import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/shifts - List all shift types
export async function GET() {
  try {
    await requireAdmin();

    const shifts = await prisma.shiftType.findMany({
      orderBy: { code: "asc" },
    });

    return NextResponse.json(shifts);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/shifts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/shifts - Create a new shift type
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { code, label, startTime, endTime, lunchMinutes, category } = body;

    if (!code || !label || !startTime || !endTime) {
      return NextResponse.json({ error: "code, label, startTime and endTime are required" }, { status: 400 });
    }

    const existing = await prisma.shiftType.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "Shift code already exists" }, { status: 409 });
    }

    const shift = await prisma.shiftType.create({
      data: {
        code,
        label,
        startTime,
        endTime,
        lunchMinutes: lunchMinutes ?? 0,
        category: category || "regular",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "shiftType",
        entityId: String(shift.id),
        details: JSON.stringify({ code, label, startTime, endTime }),
      },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/shifts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
