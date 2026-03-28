import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { EVENT_TYPES } from "@/lib/notifications";

// GET /api/employee/notifications/preferences - Get current user's preferences
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const existing = await prisma.notificationPreference.findMany({
    where: { userId: user.id },
  });

  const existingMap = new Map(existing.map((p) => [p.eventType, p]));

  // Build full preferences list, filling defaults for missing event types
  const preferences = Object.entries(EVENT_TYPES).map(([key, value]) => {
    const pref = existingMap.get(key);
    return {
      eventType: key,
      label: value.label,
      icon: value.icon,
      inApp: pref ? pref.inApp : true,
      push: pref ? pref.push : true,
      locked: pref ? pref.locked : value.defaultLocked,
    };
  });

  return NextResponse.json({ preferences });
}

// PUT /api/employee/notifications/preferences - Update a preference
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { eventType, inApp, push } = body;

  if (!eventType) {
    return NextResponse.json(
      { error: "Se requiere eventType" },
      { status: 400 }
    );
  }

  if (!EVENT_TYPES[eventType]) {
    return NextResponse.json(
      { error: "Tipo de evento no válido" },
      { status: 400 }
    );
  }

  // Check if this preference is locked
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId_eventType: { userId: user.id, eventType } },
  });

  const isLocked = existing
    ? existing.locked
    : EVENT_TYPES[eventType].defaultLocked;

  if (isLocked) {
    return NextResponse.json(
      { error: "Esta preferencia está bloqueada y no se puede modificar" },
      { status: 403 }
    );
  }

  // Build update data only with provided fields
  const data: Record<string, any> = {};
  if (typeof inApp === "boolean") data.inApp = inApp;
  if (typeof push === "boolean") data.push = push;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Se requiere al menos inApp o push" },
      { status: 400 }
    );
  }

  const pref = await prisma.notificationPreference.upsert({
    where: { userId_eventType: { userId: user.id, eventType } },
    update: data,
    create: {
      userId: user.id,
      eventType,
      inApp: typeof inApp === "boolean" ? inApp : true,
      push: typeof push === "boolean" ? push : true,
      locked: false,
    },
  });

  return NextResponse.json({ preference: pref });
}
