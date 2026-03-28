import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/holidays - List holidays
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const province = searchParams.get("province");
    const type = searchParams.get("type");

    const where: Record<string, any> = {};
    if (year) where.year = parseInt(year);
    if (province) where.province = province;
    if (type) where.type = type;

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: "asc" },
    });

    return NextResponse.json(holidays);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/holidays error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/holidays - Create a holiday
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { date, label, year, province, type } = body;

    if (!date || !year) {
      return NextResponse.json({ error: "date and year are required" }, { status: 400 });
    }

    const holiday = await prisma.holiday.create({
      data: {
        date,
        label: label || null,
        year,
        province: province || "Madrid",
        type: type || "official",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "holiday",
        entityId: String(holiday.id),
        details: JSON.stringify({ date, label, year }),
      },
    });

    return NextResponse.json(holiday, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Holiday already exists for this date and province" }, { status: 409 });
    }
    console.error("POST /api/admin/holidays error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
