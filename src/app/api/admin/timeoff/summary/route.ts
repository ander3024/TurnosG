import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/timeoff/summary - Vacation days summary per person
export async function GET() {
  try {
    await requireAdmin();

    const people = await prisma.person.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    });

    const timeOffs = await prisma.timeOffRequest.findMany({
      where: { status: "aprobada", type: "vacaciones" },
    });

    const holidays = await prisma.holiday.findMany();
    const holidayDates = new Set(holidays.map((h) => h.date));

    const settings = await prisma.setting.findMany();
    const vacDaysTotal = parseInt(
      settings.find((s) => s.key === "vacationDaysNatural")?.value || "23"
    );

    const summary = people.map((person) => {
      const personTimeOffs = timeOffs.filter((t) => t.personId === person.id);
      let usedDays = 0;

      for (const to of personTimeOffs) {
        // Count only business days (Mon-Fri, excluding holidays)
        const start = new Date(to.startDate + "T12:00:00Z");
        const end = new Date(to.endDate + "T12:00:00Z");
        const d = new Date(start);
        while (d <= end) {
          const dow = d.getUTCDay();
          const dateStr = d.toISOString().slice(0, 10);
          if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) {
            usedDays++;
          }
          d.setUTCDate(d.getUTCDate() + 1);
        }
      }

      const remaining = vacDaysTotal - usedDays;
      const exceeded = usedDays > vacDaysTotal;

      return {
        personId: person.id,
        personCode: person.code,
        personName: person.name,
        personColor: person.color,
        usedDays,
        totalDays: vacDaysTotal,
        remainingDays: remaining,
        exceeded,
      };
    });

    return NextResponse.json({ summary });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/admin/timeoff/summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
