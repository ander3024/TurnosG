import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/extra-hours/[id] - Update extra hours entry
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const entryId = parseInt(id);

    if (isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid entry ID" }, { status: 400 });
    }

    const existing = await prisma.extraHours.findUnique({
      where: { id: entryId },
      include: { person: { select: { code: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Extra hours entry not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    if (body.personId !== undefined) {
      const person = await prisma.person.findUnique({ where: { id: body.personId } });
      if (!person) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
      data.personId = body.personId;
      changes.personId = body.personId;
    }
    if (body.date !== undefined) { data.date = body.date; changes.date = body.date; }
    if (typeof body.hours === "number") {
      if (body.hours <= 0) {
        return NextResponse.json({ error: "hours must be greater than 0" }, { status: 400 });
      }
      data.hours = body.hours;
      changes.hours = body.hours;
    }
    if (body.comment !== undefined) { data.comment = body.comment; changes.comment = body.comment; }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const entry = await prisma.extraHours.update({
      where: { id: entryId },
      data,
      include: {
        person: { select: { id: true, code: true, name: true } },
        actor: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "extraHours",
        entityId: String(entryId),
        details: JSON.stringify(changes),
      },
    });

    return NextResponse.json(entry);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/extra-hours/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/extra-hours/[id] - Delete extra hours entry
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const entryId = parseInt(id);

    if (isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid entry ID" }, { status: 400 });
    }

    const existing = await prisma.extraHours.findUnique({
      where: { id: entryId },
      include: { person: { select: { code: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Extra hours entry not found" }, { status: 404 });
    }

    await prisma.extraHours.delete({ where: { id: entryId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "extraHours",
        entityId: String(entryId),
        details: JSON.stringify({
          person: existing.person.name,
          date: existing.date,
          hours: existing.hours,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/extra-hours/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
