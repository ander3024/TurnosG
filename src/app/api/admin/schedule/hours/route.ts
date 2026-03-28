import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  loadEngineContext,
  generateSchedule,
  buildHoursSummary,
} from "@/lib/engine";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params required" },
        { status: 400 }
      );
    }

    const ctx = await loadEngineContext(from, to);
    const schedule = generateSchedule(ctx, from, to);

    // Flatten all assignments
    const allAssignments = schedule.flatMap((d) => d.assignments);

    // Build holiday dates set for vacation counting
    // If consumeVacationOnHoliday is false, ALL holidays (including working) don't consume vacation days
    const holidayDates = new Set<string>();
    for (const [date, h] of ctx.holidays) {
      if (!ctx.settings.consumeVacationOnHoliday || h.type !== "working") {
        holidayDates.add(date);
      }
    }

    const hours = buildHoursSummary(
      allAssignments,
      ctx.extraHours,
      ctx.timeOffs,
      ctx.settings.annualTargetHours,
      ctx.settings.vacationDaysNatural,
      ctx.people,
      holidayDates
    );

    return NextResponse.json({ hours });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/schedule/hours error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
