import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { loadEngineContext, generateSchedule } from "@/lib/engine";

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
    const { toPersonId, fromDate, toDate, fromShiftLabel, toShiftLabel, reason, hours } = body;
    const isPartial = typeof hours === "number" && hours > 0;

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

    const isOneWay = toShiftLabel.toLowerCase() === "libra";

    // Validate: check that fromPerson actually works on fromDate
    // Use FULL MONTH context (balance algorithm needs it for consistent results)
    const earliest = fromDate < toDate ? fromDate : toDate;
    const latest = fromDate > toDate ? fromDate : toDate;
    const monthStart = earliest.slice(0, 8) + "01";
    const ym = latest.slice(0, 7).split("-");
    const monthEnd = latest.slice(0, 8) + String(new Date(parseInt(ym[0]), parseInt(ym[1]), 0).getDate()).padStart(2, "0");
    const ctx = await loadEngineContext(monthStart, monthEnd);
    const schedule = generateSchedule(ctx, monthStart, monthEnd);
    const fromDay = schedule.find(d => d.date === fromDate);
    const myAssignments = fromDay?.assignments.filter(a => a.personId === person.id) || [];

    if (myAssignments.length === 0) {
      return NextResponse.json(
        { error: `No tienes ningún turno el ${fromDate}. No puedes intercambiar un día que libras.` },
        { status: 400 }
      );
    }

    // Find the best matching assignment (exact label match, or fallback to any)
    const exactMatch = myAssignments.find(a => a.shiftTypeLabel === fromShiftLabel);
    const actualShift = exactMatch || myAssignments[0];
    // Use the actual shift label from the engine (in case frontend sent a slightly different one)
    const actualFromShiftLabel = actualShift.shiftTypeLabel;

    // For one-way: validate toPerson is actually off on fromDate
    if (isOneWay) {
      const toPersonWorks = fromDay?.assignments.some(a => a.personId === toPersonId);
      if (toPersonWorks) {
        return NextResponse.json(
          { error: `${toPerson.name} ya está trabajando ese día. Usa un intercambio normal, no cobertura.` },
          { status: 400 }
        );
      }
    }

    if (!isOneWay) {
      // Validate: no point swapping same shift type on same date
      if (fromDate === toDate && fromShiftLabel === toShiftLabel) {
        return NextResponse.json(
          { error: "No tiene sentido intercambiar el mismo turno del mismo día. Elige un turno diferente o un día diferente." },
          { status: 400 }
        );
      }

      // Validate: same shift label on different dates is OK, but same shift on same date is not
      if (fromDate === toDate) {
        const fromType = fromShiftLabel.toLowerCase();
        const toType = toShiftLabel.toLowerCase();
        if (fromType === toType) {
          return NextResponse.json(
            { error: `Los dos tenéis turno de ${fromShiftLabel} ese día. No hay nada que intercambiar.` },
            { status: 400 }
          );
        }
      }

      // Validate: can't swap shifts with different hours (finde 12h vs weekday 8h)
      const fromIsFinde = fromShiftLabel.toLowerCase().includes("finde") || fromShiftLabel.toLowerCase().includes("fin");
      const toIsFinde = toShiftLabel.toLowerCase().includes("finde") || toShiftLabel.toLowerCase().includes("fin");
      if (fromIsFinde !== toIsFinde) {
        return NextResponse.json(
          { error: `No puedes intercambiar un turno de ${fromIsFinde ? "fin de semana (12h)" : "entre semana (8h)"} por uno de ${toIsFinde ? "fin de semana (12h)" : "entre semana (8h)"}. Las horas son diferentes. Si realmente lo necesitas, contacta al administrador.` },
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
        fromShiftLabel: actualFromShiftLabel,
        toShiftLabel,
        reason: reason || null,
        isOneWay,
        hours: isPartial ? hours : null,
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
        title: isPartial ? `Cobertura de ${hours}h propuesta` : isOneWay ? "Cobertura de turno propuesta" : "Intercambio de turno propuesto",
        message: isPartial
          ? `${person.name} te pide que le cubras ${hours} horas de su turno de ${actualFromShiftLabel} el ${fromDate}.`
          : isOneWay
          ? `${person.name} te pide que le cubras su turno completo (${actualFromShiftLabel}) el ${fromDate}. Estás librando ese día.`
          : `${person.name} quiere intercambiar su turno contigo: su ${actualFromShiftLabel} del ${fromDate} por tu ${toShiftLabel} del ${toDate}.`,
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
