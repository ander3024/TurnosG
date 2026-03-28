import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

// GET /api/employee/swaps — list current user's swaps (sent and received)
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const swaps = await prisma.swapRequest.findMany({
      where: {
        OR: [{ fromUserId: user.id }, { toUserId: user.id }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
        fromPerson: { select: { id: true, code: true, name: true, color: true } },
        toPerson: { select: { id: true, code: true, name: true, color: true } },
      },
    });

    return NextResponse.json({ swaps });
  } catch (error: any) {
    console.error("GET /api/employee/swaps error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/employee/swaps — create a swap request
export async function POST(req: NextRequest) {
  try {
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
    const { toPersonId, fromDate, toDate, fromShiftLabel, toShiftLabel, reason } = body;

    if (!toPersonId || !fromDate || !toDate || !fromShiftLabel || !toShiftLabel) {
      return NextResponse.json(
        { error: "toPersonId, fromDate, toDate, fromShiftLabel y toShiftLabel son obligatorios" },
        { status: 400 }
      );
    }

    // Validate toPerson exists and has a linked user
    const toPerson = await prisma.person.findUnique({
      where: { id: toPersonId },
      include: { user: true },
    });

    if (!toPerson) {
      return NextResponse.json(
        { error: "La persona destino no existe" },
        { status: 404 }
      );
    }

    if (!toPerson.user) {
      return NextResponse.json(
        { error: "La persona destino no tiene usuario vinculado" },
        { status: 400 }
      );
    }

    if (toPerson.id === person.id) {
      return NextResponse.json(
        { error: "No puedes intercambiar contigo mismo" },
        { status: 400 }
      );
    }

    // Validate: no point swapping same shift type on same date
    if (fromDate === toDate && fromShiftLabel === toShiftLabel) {
      return NextResponse.json(
        { error: "No tiene sentido intercambiar el mismo turno del mismo día. Elige un turno diferente o un día diferente." },
        { status: 400 }
      );
    }

    // Validate: same shift label on different dates is OK, but same shift on same date is not
    if (fromDate === toDate) {
      // Same day: check if they're really different shifts
      const fromType = fromShiftLabel.toLowerCase();
      const toType = toShiftLabel.toLowerCase();
      if (fromType === toType) {
        return NextResponse.json(
          { error: `Los dos tenéis turno de ${fromShiftLabel} ese día. No hay nada que intercambiar.` },
          { status: 400 }
        );
      }
    }

    const swap = await prisma.swapRequest.create({
      data: {
        fromUserId: user.id,
        toUserId: toPerson.user.id,
        fromPersonId: person.id,
        toPersonId: toPerson.id,
        fromDate,
        toDate,
        fromShiftLabel,
        toShiftLabel,
        reason: reason || null,
      },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
        fromPerson: { select: { id: true, code: true, name: true, color: true } },
        toPerson: { select: { id: true, code: true, name: true, color: true } },
      },
    });

    // Notify the target employee
    try {
      await notify({
        eventType: "swap_requested",
        recipientUserIds: [toPerson.user.id],
        title: "Intercambio propuesto",
        message: `${person.name} quiere intercambiar su turno contigo (${fromShiftLabel} del ${fromDate} por ${toShiftLabel} del ${toDate})`,
        link: "/swaps",
        type: "info",
      });
    } catch {
      /* notification failure shouldn't block */
    }

    return NextResponse.json({ swap }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/employee/swaps error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
