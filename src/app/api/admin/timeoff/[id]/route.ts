import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { checkVacationLimit } from "@/lib/vacation-limit";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/timeoff/[id] - Update a time off request (status change or field edit)
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);

    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
    }

    const existing = await prisma.timeOffRequest.findUnique({
      where: { id: requestId },
      include: { person: { select: { code: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Time off request not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status, type, startDate, endDate, note } = body;

    // Status change flow (approve/reject/cancel)
    if (status) {
      const validStatuses = ["aprobada", "rechazada", "cancelada"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `status must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }

      if (existing.status !== "pendiente" && status !== "cancelada") {
        return NextResponse.json(
          { error: "Only pending requests can be approved or rejected" },
          { status: 400 }
        );
      }

      // Check vacation limit before approving
      if (status === "aprobada" && existing.type === "vacaciones") {
        const check = await checkVacationLimit(existing.personId, existing.startDate, existing.endDate, existing.id);
        if (!check.ok) {
          return NextResponse.json({ error: check.error }, { status: 400 });
        }
      }

      const data: Record<string, any> = {
        status,
        reviewedAt: new Date(),
        reviewedBy: admin.name,
      };
      if (note !== undefined) data.note = note;

      const timeOff = await prisma.timeOffRequest.update({
        where: { id: requestId },
        data,
        include: {
          person: { select: { id: true, code: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
        },
      });

      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: status === "aprobada" ? "approve" : status === "rechazada" ? "reject" : "cancel",
          entity: "timeoff",
          entityId: String(requestId),
          details: JSON.stringify({
            person: existing.person.name,
            type: existing.type,
            startDate: existing.startDate,
            endDate: existing.endDate,
            newStatus: status,
          }),
        },
      });

      // Notify the employee
      try {
        const { notify } = await import("@/lib/notifications");
        const person = await prisma.person.findUnique({ where: { id: existing.personId }, include: { user: true } });
        if (person?.user) {
          const evtType = status === "aprobada" ? "timeoff_approved" : "timeoff_rejected";
          const statusLabel = status === "aprobada" ? "aprobadas" : "rechazadas";
          await notify({
            eventType: evtType,
            recipientUserIds: [person.user.id],
            title: `Vacaciones ${statusLabel}`,
            message: `Tu solicitud del ${existing.startDate} al ${existing.endDate} ha sido ${statusLabel}.`,
            link: "/vacaciones",
            type: status === "aprobada" ? "success" : "warning",
          });
        }
      } catch { /* notification failure shouldn't block the response */ }

      return NextResponse.json(timeOff);
    }

    // Field edit flow (type, dates, note)
    const data: Record<string, any> = {};
    const changes: Record<string, any> = {};

    if (type !== undefined) { data.type = type; changes.type = type; }
    if (startDate !== undefined) { data.startDate = startDate; changes.startDate = startDate; }
    if (endDate !== undefined) { data.endDate = endDate; changes.endDate = endDate; }
    if (note !== undefined) { data.note = note; changes.note = note; }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const timeOff = await prisma.timeOffRequest.update({
      where: { id: requestId },
      data,
      include: {
        person: { select: { id: true, code: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "timeoff",
        entityId: String(requestId),
        details: JSON.stringify({
          person: existing.person.name,
          ...changes,
        }),
      },
    });

    return NextResponse.json(timeOff);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PATCH /api/admin/timeoff/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/timeoff/[id] - Delete a time off request
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const requestId = parseInt(id);

    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
    }

    const existing = await prisma.timeOffRequest.findUnique({
      where: { id: requestId },
      include: { person: { select: { code: true, name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Time off request not found" }, { status: 404 });
    }

    await prisma.timeOffRequest.delete({ where: { id: requestId } });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "delete",
        entity: "timeoff",
        entityId: String(requestId),
        details: JSON.stringify({
          person: existing.person.name,
          type: existing.type,
          startDate: existing.startDate,
          endDate: existing.endDate,
          status: existing.status,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("DELETE /api/admin/timeoff/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
