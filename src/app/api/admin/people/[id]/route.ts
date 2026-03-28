import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/people/[id] - Update person
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const personId = parseInt(id);

    if (isNaN(personId)) {
      return NextResponse.json({ error: "Invalid person ID" }, { status: 400 });
    }

    const existing = await prisma.person.findUnique({ where: { id: personId } });
    if (!existing) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    if (body.name) { data.name = body.name; changes.name = body.name; }
    if (body.code) { data.code = body.code; changes.code = body.code; }
    if (body.color) { data.color = body.color; changes.color = body.color; }
    if (typeof body.offset === "number") { data.offset = body.offset; changes.offset = body.offset; }
    if (typeof body.active === "boolean") { data.active = body.active; changes.active = body.active; }
    if (body.userId !== undefined) { data.userId = body.userId || null; changes.userId = body.userId; }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const person = await prisma.person.update({
      where: { id: personId },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "person",
        entityId: String(personId),
        details: JSON.stringify(changes),
      },
    });

    return NextResponse.json(person);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/people/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/people/[id] - Delete person
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const personId = parseInt(id);

    if (isNaN(personId)) {
      return NextResponse.json({ error: "Invalid person ID" }, { status: 400 });
    }

    const existing = await prisma.person.findUnique({ where: { id: personId } });
    if (!existing) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    await prisma.person.delete({ where: { id: personId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "person",
        entityId: String(personId),
        details: JSON.stringify({ code: existing.code, name: existing.name }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/people/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
