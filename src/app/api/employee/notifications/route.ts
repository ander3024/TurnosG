import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/employee/notifications — las propias, de la más nueva a la más vieja.
 *
 * Antes devolvía las 50 últimas y punto: el resto del historial era
 * inalcanzable desde la app. A Miguel le cortaba justo el 8-ago-2026 y no podía
 * comprobar cuándo cubrió unas horas, que es precisamente para lo que se mira.
 * Ahora se pagina con cursor (`before` = id de la última que ya tienes).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  const before = Number(searchParams.get("before")) || null;

  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id, ...(before ? { id: { lt: before } } : {}) },
      // Por id: es autoincremental, así que el orden es el de creación y el
      // cursor no se puede descolocar si dos caen en el mismo milisegundo.
      orderBy: { id: "desc" },
      take: limit + 1,
    }),
    prisma.notification.count({ where: { userId: user.id } }),
    // Sin leer de verdad, no solo entre las que se devuelven: la campana
    // contaba sobre las 50 cargadas y se dejaba fuera las más antiguas.
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const hasMore = rows.length > limit;
  const notifications = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({ notifications, hasMore, total, unread });
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
      data: { read: true, readAt: new Date() },
    });
  } else if (Array.isArray(ids) && ids.length > 0) {
    // Mark specific ones as read
    await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId: user.id,
        read: false,
      },
      data: { read: true, readAt: new Date() },
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
