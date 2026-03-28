import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/extra-hours - List extra hours
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const personId = searchParams.get("personId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, any> = {};
    if (personId) where.personId = parseInt(personId);
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const [items, total] = await Promise.all([
      prisma.extraHours.findMany({
        where,
        include: {
          person: { select: { id: true, code: true, name: true } },
          actor: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.extraHours.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/extra-hours error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/extra-hours - Create extra hours entry
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { personId, date, hours, comment } = body;

    if (!personId || !date || typeof hours !== "number") {
      return NextResponse.json({ error: "personId, date and hours are required" }, { status: 400 });
    }

    if (hours <= 0) {
      return NextResponse.json({ error: "hours must be greater than 0" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const entry = await prisma.extraHours.create({
      data: {
        personId,
        actorId: admin.id,
        date,
        hours,
        comment: comment || null,
      },
      include: {
        person: { select: { id: true, code: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "extraHours",
        entityId: String(entry.id),
        details: JSON.stringify({ personId, date, hours, personName: person.name }),
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/extra-hours error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
