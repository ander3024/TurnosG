import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";

// GET /api/admin/users - List all users
export async function GET() {
  try {
    const admin = await requireAdmin();

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        person: { select: { id: true, code: true, name: true } },
      },
    });

    return NextResponse.json(users);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { email, name, password, role, phone, personId } = body;

    if (!email || !name || !password) {
      return NextResponse.json({ error: "email, name and password are required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: role || "user",
        phone: phone || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        phone: true,
        createdAt: true,
        person: { select: { id: true, code: true, name: true } },
      },
    });

    // Link person if personId provided
    if (personId) {
      await prisma.person.update({
        where: { id: parseInt(personId) },
        data: { userId: user.id },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "user",
        entityId: String(user.id),
        details: JSON.stringify({ email, name, role: role || "user" }),
      },
    });

    try {
      const { sendWelcomeEmail } = await import("@/lib/email");
      await sendWelcomeEmail({ name, email });
    } catch {}

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
