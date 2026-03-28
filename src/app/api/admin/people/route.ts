import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/people - List all people
export async function GET() {
  try {
    await requireAdmin();

    const people = await prisma.person.findMany({
      orderBy: { code: "asc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    return NextResponse.json(people);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/people - Create a new person
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { code, name, color, offset, userId } = body;

    if (!code || !name) {
      return NextResponse.json({ error: "code and name are required" }, { status: 400 });
    }

    const existing = await prisma.person.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "Code already in use" }, { status: 409 });
    }

    const person = await prisma.person.create({
      data: {
        code,
        name,
        color: color || "#3b82f6",
        offset: offset ?? 0,
        userId: userId || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "create",
        entity: "person",
        entityId: String(person.id),
        details: JSON.stringify({ code, name }),
      },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
