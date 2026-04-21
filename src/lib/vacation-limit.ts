import { prisma } from "@/lib/prisma";

/**
 * Count business days (Mon-Fri, excluding holidays) between two dates.
 */
function countBusinessDays(start: string, end: string, holidayDates: Set<string>): number {
  let count = 0;
  const d = new Date(start + "T12:00:00Z");
  const e = new Date(end + "T12:00:00Z");
  while (d <= e) {
    const dow = d.getUTCDay();
    const dateStr = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidayDates.has(dateStr)) {
      count++;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Check if approving a vacation request would exceed the annual limit.
 * Convention: vacations can be taken within 13 months (current year + January next year).
 * Returns { ok, used, requested, limit, remaining } or { ok: false, error }.
 */
export async function checkVacationLimit(
  personId: number,
  startDate: string,
  endDate: string,
  excludeRequestId?: number // exclude this request from counting (for re-checks)
): Promise<{
  ok: boolean;
  used: number;
  requested: number;
  limit: number;
  remaining: number;
  error?: string;
}> {
  const year = new Date().getFullYear();

  // Convention: 13 months = current year + January next year
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year + 1}-01-31`;

  // Get limit from settings
  const limitSetting = await prisma.setting.findFirst({ where: { key: "vacationDaysNatural" } });
  const limit = parseInt(limitSetting?.value || "23");

  // Get holidays for counting business days
  const holidays = await prisma.holiday.findMany();
  const holidayDates = new Set(holidays.map(h => h.date));

  // Count already approved vacation days in the period
  const approved = await prisma.timeOffRequest.findMany({
    where: {
      personId,
      type: "vacaciones",
      status: "aprobada",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
  });

  let used = 0;
  for (const req of approved) {
    used += countBusinessDays(req.startDate, req.endDate, holidayDates);
  }

  // Count the new request's days
  const requested = countBusinessDays(startDate, endDate, holidayDates);
  const remaining = limit - used;

  if (used + requested > limit) {
    return {
      ok: false,
      used,
      requested,
      limit,
      remaining,
      error: `No se puede aprobar: ${used} días usados + ${requested} solicitados = ${used + requested} días. El límite es ${limit} días/año. Quedan ${remaining} días disponibles.`,
    };
  }

  // Check that dates are within the 13-month period
  if (startDate > periodEnd || endDate < periodStart) {
    return {
      ok: false,
      used,
      requested,
      limit,
      remaining,
      error: `Las vacaciones deben estar dentro del periodo ${year} (hasta enero ${year + 1}).`,
    };
  }

  return { ok: true, used, requested, limit, remaining };
}
