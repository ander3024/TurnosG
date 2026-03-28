import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/timeoff - List time off requests with filters
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const personId = searchParams.get("personId");
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (personId) where.personId = parseInt(personId);
    if (type) where.type = type;
    if (startDate) where.startDate = { gte: startDate };
    if (endDate) where.endDate = { lte: endDate };

    const [items, total] = await Promise.all([
      prisma.timeOffRequest.findMany({
        where,
        include: {
          person: { select: { id: true, code: true, name: true, color: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.timeOffRequest.count({ where }),
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
    console.error("GET /api/admin/timeoff error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/timeoff - Create a time off request
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { personId, type, startDate, endDate, hoursPerDay, note } = body;

    if (!personId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: "personId, type, startDate and endDate are required" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Validate vacation days limit
    if (type === "vacaciones") {
      const settings = await prisma.setting.findMany();
      const vacLimit = parseInt(settings.find((s) => s.key === "vacationDaysNatural")?.value || "23");
      const holidays = await prisma.holiday.findMany();
      const holidayDates = new Set(holidays.map((h) => h.date));

      // Count existing approved vacation days
      const existing = await prisma.timeOffRequest.findMany({
        where: { personId, status: "aprobada", type: "vacaciones" },
      });
      let usedDays = 0;
      for (const t of existing) {
        const s = new Date(t.startDate + "T12:00:00Z");
        const e = new Date(t.endDate + "T12:00:00Z");
        const d = new Date(s);
        while (d <= e) {
          if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayDates.has(d.toISOString().slice(0, 10))) usedDays++;
          d.setUTCDate(d.getUTCDate() + 1);
        }
      }

      // Count new request days
      let newDays = 0;
      const ns = new Date(startDate + "T12:00:00Z");
      const ne = new Date(endDate + "T12:00:00Z");
      const nd = new Date(ns);
      while (nd <= ne) {
        if (nd.getUTCDay() !== 0 && nd.getUTCDay() !== 6 && !holidayDates.has(nd.toISOString().slice(0, 10))) newDays++;
        nd.setUTCDate(nd.getUTCDate() + 1);
      }

      if (usedDays + newDays > vacLimit) {
        return NextResponse.json({
          error: `Excede el límite de vacaciones: ${usedDays} días usados + ${newDays} solicitados = ${usedDays + newDays} (máximo ${vacLimit})`,
          usedDays,
          newDays,
          total: usedDays + newDays,
          limit: vacLimit,
        }, { status: 400 });
      }
    }

    const timeOff = await prisma.timeOffRequest.create({
      data: {
        personId,
        requesterId: admin.id,
        type,
        startDate,
        endDate,
        hoursPerDay: hoursPerDay ?? 8,
        note: note || null,
        status: "aprobada", // admin-created requests are auto-approved
        reviewedAt: new Date(),
        reviewedBy: admin.name,
      },
      include: {
        person: { select: { id: true, code: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "timeoff",
        entityId: String(timeOff.id),
        details: JSON.stringify({ personId, type, startDate, endDate }),
      },
    });

    return NextResponse.json(timeOff, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/timeoff error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
