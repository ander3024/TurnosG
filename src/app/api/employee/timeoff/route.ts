import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/employee/timeoff — list own time-off requests
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const person = await prisma.person.findFirst({
    where: { userId: user.id },
  });

  if (!person) {
    return NextResponse.json({ requests: [] });
  }

  const requests = await prisma.timeOffRequest.findMany({
    where: { personId: person.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

// POST /api/employee/timeoff — create a new request
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const person = await prisma.person.findFirst({
    where: { userId: user.id },
  });

  if (!person) {
    return NextResponse.json(
      { error: "No tienes un perfil de empleado vinculado" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { type, startDate, endDate, note } = body;

  if (!type || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Tipo, fecha inicio y fecha fin son obligatorios" },
      { status: 400 }
    );
  }

  const validTypes = ["vacaciones", "asuntos_propios", "enfermedad", "otro"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Tipo no valido" }, { status: 400 });
  }

  if (endDate < startDate) {
    return NextResponse.json(
      { error: "La fecha de fin debe ser posterior a la de inicio" },
      { status: 400 }
    );
  }

  // Check for overlapping approved/pending requests
  const overlapping = await prisma.timeOffRequest.findFirst({
    where: {
      personId: person.id,
      status: { in: ["pendiente", "aprobada"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });

  if (overlapping) {
    return NextResponse.json(
      { error: "Ya tienes una solicitud que solapa con esas fechas" },
      { status: 409 }
    );
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      personId: person.id,
      requesterId: user.id,
      type,
      startDate,
      endDate,
      note: note || null,
      status: "pendiente",
    },
  });

  // Notify all admins about the new request
  try {
    const { notify } = await import("@/lib/notifications");
    const admins = await prisma.user.findMany({ where: { role: "admin", active: true }, select: { id: true } });
    if (admins.length > 0) {
      const typeLabels: Record<string, string> = { vacaciones: "Vacaciones", asuntos_propios: "Asuntos propios", enfermedad: "Baja médica", otro: "Otro" };
      await notify({
        eventType: "timeoff_requested",
        recipientUserIds: admins.map((a) => a.id),
        title: "Nueva solicitud de ausencia",
        message: `${user.name} ha solicitado ${typeLabels[type] || type} del ${startDate} al ${endDate}.`,
        link: "/admin/timeoff",
        type: "action",
      });
    }
  } catch { /* notification failure shouldn't block */ }

  return NextResponse.json({ request }, { status: 201 });
}
