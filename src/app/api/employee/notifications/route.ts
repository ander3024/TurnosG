import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/employee/notifications — own notifications
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ notifications });
}

// PATCH /api/employee/notifications — mark as read
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { ids, all } = body;

  if (all) {
    // Mark all as read
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
  } else if (Array.isArray(ids) && ids.length > 0) {
    // Mark specific ones as read
    await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      data: { read: true },
    });
  } else {
    return NextResponse.json(
      { error: "Se requiere 'ids' o 'all'" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/employee/notifications — delete specific or all read
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { id, deleteAllRead } = body;

  if (deleteAllRead) {
    // Delete all read notifications for this user
    const result = await prisma.notification.deleteMany({
      where: { userId: user.id, read: true },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  } else if (id) {
    // Delete a specific notification (must belong to this user)
    const notification = await prisma.notification.findFirst({
      where: { id: Number(id), userId: user.id },
    });
    if (!notification) {
      return NextResponse.json(
        { error: "Notificación no encontrada" },
        { status: 404 }
      );
    }
    await prisma.notification.delete({ where: { id: notification.id } });
    return NextResponse.json({ ok: true });
  } else {
    return NextResponse.json(
      { error: "Se requiere 'id' o 'deleteAllRead'" },
      { status: 400 }
    );
  }
}
