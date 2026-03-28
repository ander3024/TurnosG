import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/users/[id] - Update user (active, role, password reset)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    if (typeof body.active === "boolean") {
      data.active = body.active;
      changes.active = body.active;
    }
    if (body.role && ["admin", "manager", "user"].includes(body.role)) {
      data.role = body.role;
      changes.role = body.role;
    }
    if (body.name) {
      data.name = body.name;
      changes.name = body.name;
    }
    if (body.email) {
      data.email = body.email;
      changes.email = body.email;
    }
    if (body.phone !== undefined) {
      data.phone = body.phone || null;
      changes.phone = body.phone || null;
    }
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 10);
      changes.passwordReset = true;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        person: { select: { id: true, code: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "user",
        entityId: String(userId),
        details: JSON.stringify(changes),
      },
    });

    return NextResponse.json(user);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/users/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] - Delete user
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    if (userId === admin.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.delete({ where: { id: userId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "user",
        entityId: String(userId),
        details: JSON.stringify({ email: existing.email, name: existing.name }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/users/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
