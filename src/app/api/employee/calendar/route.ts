import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadEngineContext, generateSchedule } from "@/lib/engine";

// GET /api/employee/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "Se requieren parametros start y end" },
      { status: 400 }
    );
  }

  // Find the person linked to this user
  const person = await prisma.person.findFirst({
    where: { userId: user.id },
  });

  // Use the engine to compute the full schedule
  const ctx = await loadEngineContext(start, end);
  const schedule = generateSchedule(ctx, start, end);

  // Build response with employee's shifts highlighted
  const days = schedule.map((day) => {
    // Filter assignments for this person
    const myShifts = person
      ? day.assignments
          .filter((a) => a.personId === person.id)
          .map((a) => ({
            code: a.shiftTypeCode,
            label: a.shiftTypeLabel,
            startTime: a.startTime,
            endTime: a.endTime,
            hours: a.hours,
            source: a.source,
          }))
      : [];

    // Time offs for this person (exclude "intercambio" type — those show as "Libra")
    const myTimeOff = person
      ? day.timeOffs.find((to) => to.personId === person.id && to.type !== "intercambio") || null
      : null;

    // Separate intercambio timeoffs (show as "Libra") from real vacations
    const swapTimeOffs = day.timeOffs.filter((to) => to.type === "intercambio");
    const realTimeOffs = day.timeOffs.filter((to) => to.type !== "intercambio");

    // offPeople = rotation off + intercambio off
    const offFromRotation = (day.offPeople || []).map((op) => ({
      personCode: op.personCode,
      personName: op.personName,
      personColor: op.personColor,
    }));
    const offFromSwaps = swapTimeOffs
      .filter((to) => !offFromRotation.some((op) => op.personCode === to.personCode))
      .map((to) => ({
        personCode: to.personCode,
        personName: to.personName,
        personColor: to.personColor,
      }));

    return {
      date: day.date,
      isWeekend: day.isWeekend,
      isClosed: day.isClosed,
      shifts: myShifts,
      myPersonCode: person?.code || null,
      timeOff: myTimeOff ? { type: myTimeOff.type, status: "aprobada" } : null,
      // If I have an intercambio timeoff, I'm off but NOT on vacation
      isSwapOff: person ? swapTimeOffs.some((to) => to.personId === person.id) : false,
      holiday: day.isHoliday ? { label: day.holidayLabel || "Festivo" } : null,
      teamAssignments: day.assignments.map((a) => ({
        personCode: a.personCode,
        personName: a.personName,
        personColor: a.personColor,
        shiftLabel: a.shiftTypeLabel,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
      offPeople: [...offFromRotation, ...offFromSwaps]
        .filter((op) => {
          // Don't show "me" in offPeople — I already see my own status via shifts/timeOff/isSwapOff
          if (person && op.personCode === person.code) return false;
          return true;
        }),
      teamTimeOffs: realTimeOffs
        .filter((to) => !person || to.personId !== person.id)
        .map((to) => ({
          personCode: to.personCode,
          personName: to.personName,
          personColor: to.personColor,
          type: to.type,
        })),
    };
  });

  return NextResponse.json({ days });
}
