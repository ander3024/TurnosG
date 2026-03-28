import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  COMMERCIAL_PERIODS,
  generateCommercialEvents,
} from "@/lib/commercial-events";

// GET: Preview proposed events for a year
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    // Load saved overrides from settings
    const setting = await prisma.setting.findUnique({
      where: { key: "commercial_events_config" },
    });
    const overrides = setting ? JSON.parse(setting.value) : undefined;

    // Generate proposals
    const proposals = generateCommercialEvents(year, overrides);

    // Check which already exist in DB
    const existing = await prisma.event.findMany({
      where: {
        startDate: { gte: `${year}-01-01` },
        endDate: { lte: `${year}-12-31` },
      },
    });

    // Mark proposals that already have a matching event
    const enriched = proposals.map((p) => {
      const match = existing.find(
        (e) =>
          e.label.toLowerCase().includes(p.periodId.replace("_", " ")) ||
          (e.startDate === p.startDate && e.endDate === p.endDate)
      );
      return { ...p, alreadyExists: !!match, existingEventId: match?.id || null };
    });

    // Return periods config for the UI
    const periodsConfig = COMMERCIAL_PERIODS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      enabled: overrides?.[p.id]?.enabled ?? p.enabled,
      weekdaysExtra: overrides?.[p.id]?.weekdaysExtra ?? p.weekdaysExtra,
      weekendExtra: overrides?.[p.id]?.weekendExtra ?? p.weekendExtra,
      intensity: p.intensity,
      dateRange: p.getDateRange(year),
    }));

    return NextResponse.json({ proposals: enriched, periods: periodsConfig, year });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Apply proposed events (create them in DB)
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { events, year } = body;

    if (!events || !Array.isArray(events) || !year) {
      return NextResponse.json({ error: "events array and year required" }, { status: 400 });
    }

    let created = 0;
    for (const evt of events) {
      // Skip if already exists
      const existing = await prisma.event.findFirst({
        where: { startDate: evt.startDate, endDate: evt.endDate, label: evt.name },
      });
      if (existing) continue;

      await prisma.event.create({
        data: {
          label: evt.name,
          startDate: evt.startDate,
          endDate: evt.endDate,
          weekdaysExtraSlots: evt.weekdaysExtraSlots,
          weekendExtraSlots: evt.weekendExtraSlots,
          notes: evt.description,
        },
      });
      created++;
    }

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "event",
        details: JSON.stringify({ type: "commercial_auto", year, created }),
      },
    });

    return NextResponse.json({ ok: true, created });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT: Save period configuration overrides
export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { config } = body;

    await prisma.setting.upsert({
      where: { key: "commercial_events_config" },
      update: { value: JSON.stringify(config) },
      create: {
        key: "commercial_events_config",
        value: JSON.stringify(config),
        label: "Configuración de eventos comerciales",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
