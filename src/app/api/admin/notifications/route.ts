import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { notify } from "@/lib/notifications";

// GET /api/admin/notifications - List all notifications with pagination
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const userId = searchParams.get("userId");
    const type = searchParams.get("type");
    const read = searchParams.get("read");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, any> = {};
    if (userId) where.userId = parseInt(userId);
    if (type) where.type = type;
    if (read !== null && read !== undefined && read !== "") {
      where.read = read === "true";
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate)
        where.createdAt.lte = new Date(endDate + "T23:59:59.999Z");
    }

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    console.error("GET /api/admin/notifications error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// POST /api/admin/notifications - Send notification to specific users or all
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { title, message, userIds, userId, target, type, link } = body;

    if (!title || !message) {
      return NextResponse.json(
        { error: "Se requiere título y mensaje" },
        { status: 400 }
      );
    }

    let recipientIds: number[];

    if (target === "specific" && userId) {
      // Single user from frontend
      recipientIds = [userId];
    } else if (Array.isArray(userIds) && userIds.length > 0) {
      recipientIds = userIds;
    } else {
      // Send to all active users
      const activeUsers = await prisma.user.findMany({
        where: { active: true },
        select: { id: true },
      });
      recipientIds = activeUsers.map((u) => u.id);
    }

    await notify({
      eventType: "system_message",
      recipientUserIds: recipientIds,
      title,
      message,
      link,
      type: type || "info",
    });

    return NextResponse.json({
      ok: true,
      sent: recipientIds.length,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    console.error("POST /api/admin/notifications error:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
