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

    // Time offs for this person
    const myTimeOff = person
      ? day.timeOffs.find((to) => to.personId === person.id) || null
      : null;

    return {
      date: day.date,
      isWeekend: day.isWeekend,
      isClosed: day.isClosed,
      shifts: myShifts,
      timeOff: myTimeOff ? { type: myTimeOff.type, status: "aprobada" } : null,
      holiday: day.isHoliday ? { label: day.holidayLabel || "Festivo" } : null,
      // Show all assignments so employee can see team schedule
      teamAssignments: day.assignments.map((a) => ({
        personCode: a.personCode,
        personName: a.personName,
        personColor: a.personColor,
        shiftLabel: a.shiftTypeLabel,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    };
  });

  return NextResponse.json({ days });
}
