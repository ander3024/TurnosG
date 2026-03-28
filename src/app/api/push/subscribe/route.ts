import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// POST /api/push/subscribe - Subscribe to push notifications
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Se requiere endpoint y keys (p256dh, auth)" },
      { status: 400 }
    );
  }

  // Upsert: if same endpoint exists for this user, update keys
  const existing = await prisma.pushSubscription.findFirst({
    where: { userId: user.id, endpoint },
  });

  if (existing) {
    await prisma.pushSubscription.update({
      where: { id: existing.id },
      data: { p256dh: keys.p256dh, auth: keys.auth },
    });
  } else {
    await prisma.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/push/subscribe - Unsubscribe from push notifications
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json(
      { error: "Se requiere endpoint" },
      { status: 400 }
    );
  }

  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, endpoint },
  });

  return NextResponse.json({ ok: true });
}
