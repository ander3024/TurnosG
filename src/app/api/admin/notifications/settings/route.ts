import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { EVENT_TYPES } from "@/lib/notifications";

// GET /api/admin/notifications/settings - List event types with lock status
export async function GET() {
  try {
    await requireAdmin();

    // Get all existing preference records to determine current lock status
    // We check if any record has a locked value set (they should all be the same per eventType)
    const prefs = await prisma.notificationPreference.findMany({
      where: { locked: true },
      select: { eventType: true },
      distinct: ["eventType"],
    });

    const lockedEventTypes = new Set(prefs.map((p) => p.eventType));

    const settings = Object.entries(EVENT_TYPES).map(([key, value]) => ({
      eventType: key,
      label: value.label,
      icon: value.icon,
      defaultLocked: value.defaultLocked,
      locked: lockedEventTypes.has(key) || value.defaultLocked,
    }));

    return NextResponse.json({ settings });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    console.error("GET /api/admin/notifications/settings error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/notifications/settings - Update lock status for an event type
export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { eventType, locked } = body;

    if (!eventType || typeof locked !== "boolean") {
      return NextResponse.json(
        { error: "Se requiere eventType y locked (boolean)" },
        { status: 400 }
      );
    }

    if (!EVENT_TYPES[eventType]) {
      return NextResponse.json(
        { error: "Tipo de evento no válido" },
        { status: 400 }
      );
    }

    // Update all existing preferences for this event type
    await prisma.notificationPreference.updateMany({
      where: { eventType },
      data: { locked },
    });

    return NextResponse.json({ ok: true, eventType, locked });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    console.error("PUT /api/admin/notifications/settings error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
