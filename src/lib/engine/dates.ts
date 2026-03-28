// ─── Date Utilities ───────────────────────────────────────

/** Parse "YYYY-MM-DD" to Date (UTC noon to avoid timezone issues) */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Format Date to "YYYY-MM-DD" */
export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add N days to a date string */
export function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

/** Get day of week: 0=Monday, 6=Sunday */
export function getDayOfWeek(dateStr: string): number {
  const d = parseDate(dateStr);
  const jsDay = d.getUTCDay(); // 0=Sun, 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1;
}

/** Is Saturday (5) or Sunday (6)? */
export function isWeekend(dateStr: string): boolean {
  const dow = getDayOfWeek(dateStr);
  return dow >= 5;
}

/** Is Saturday? */
export function isSaturday(dateStr: string): boolean {
  return getDayOfWeek(dateStr) === 5;
}

/** Get week number relative to a startDate (0-based) */
export function getWeekNumber(dateStr: string, startDate: string): number {
  const d = parseDate(dateStr).getTime();
  const s = parseDate(startDate).getTime();
  const diffDays = Math.floor((d - s) / (24 * 60 * 60 * 1000));
  return Math.floor(diffDays / 7);
}

/** Get the Monday of the week containing dateStr */
export function getWeekStart(dateStr: string): string {
  const dow = getDayOfWeek(dateStr);
  return addDays(dateStr, -dow);
}

/** Iterate all dates from `from` to `to` (inclusive) */
export function iterateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let current = from;
  while (current <= to) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

/** Parse "HH:MM" to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Count business days between two dates (Mon-Fri, excluding specific holidays) */
export function countBusinessDays(
  from: string,
  to: string,
  holidayDates: Set<string>
): number {
  let count = 0;
  for (const d of iterateDates(from, to)) {
    if (!isWeekend(d) && !holidayDates.has(d)) {
      count++;
    }
  }
  return count;
}
