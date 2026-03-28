// ─── Hour Calculations ────────────────────────────────────
import type {
  ShiftAssignment,
  EngineExtraHours,
  EnginePerson,
  EngineTimeOff,
  HoursSummary,
  EngineShiftType,
} from "./types";
import { timeToMinutes, countBusinessDays } from "./dates";

/** Calculate net hours for a shift type */
export function shiftHours(shift: EngineShiftType): number {
  const startMin = timeToMinutes(shift.startTime);
  const endMin = timeToMinutes(shift.endTime);
  const netMinutes = Math.max(0, endMin - startMin - (shift.lunchMinutes || 0));
  return netMinutes / 60;
}

/** Calculate hours from start/end time strings directly */
export function calcHours(
  startTime: string,
  endTime: string,
  lunchMinutes: number
): number {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  return Math.max(0, endMin - startMin - (lunchMinutes || 0)) / 60;
}

/** Build hours summary per person from assignments */
export function buildHoursSummary(
  assignments: ShiftAssignment[],
  extraHoursRecords: EngineExtraHours[],
  timeOffs: EngineTimeOff[],
  targetHours: number,
  vacationDaysNatural: number,
  people: EnginePerson[],
  holidayDates: Set<string>
): HoursSummary[] {
  // Accumulate hours per person
  const weekday = new Map<number, number>();
  const weekend = new Map<number, number>();
  const refuerzo = new Map<number, number>();

  for (const p of people) {
    weekday.set(p.id, 0);
    weekend.set(p.id, 0);
    refuerzo.set(p.id, 0);
  }

  for (const a of assignments) {
    if (!a.personId) continue;
    if (a.shiftTypeCode.startsWith("refuerzo")) {
      refuerzo.set(a.personId, (refuerzo.get(a.personId) || 0) + a.hours);
    } else if (
      a.shiftTypeCode === "weekend"
    ) {
      weekend.set(a.personId, (weekend.get(a.personId) || 0) + a.hours);
    } else {
      weekday.set(a.personId, (weekday.get(a.personId) || 0) + a.hours);
    }
  }

  // Extra hours logged
  const extraMap = new Map<number, number>();
  for (const eh of extraHoursRecords) {
    extraMap.set(eh.personId, (extraMap.get(eh.personId) || 0) + eh.hours);
  }

  // Vacation days used per person
  const vacDays = new Map<number, number>();
  for (const to of timeOffs) {
    if (to.type !== "vacaciones") continue;
    const days = countBusinessDays(to.startDate, to.endDate, holidayDates);
    vacDays.set(to.personId, (vacDays.get(to.personId) || 0) + days);
  }

  return people.map((p) => {
    const wd = weekday.get(p.id) || 0;
    const we = weekend.get(p.id) || 0;
    const ref = refuerzo.get(p.id) || 0;
    const extra = extraMap.get(p.id) || 0;
    const total = wd + we + ref + extra;

    return {
      personId: p.id,
      personCode: p.code,
      personName: p.name,
      personColor: p.color,
      weekdayHours: Math.round(wd * 100) / 100,
      weekendHours: Math.round(we * 100) / 100,
      refuerzoHours: Math.round(ref * 100) / 100,
      extraHoursLogged: Math.round(extra * 100) / 100,
      totalHours: Math.round(total * 100) / 100,
      targetHours,
      delta: Math.round((total - targetHours) * 100) / 100,
      vacationDaysUsed: vacDays.get(p.id) || 0,
      vacationDaysTotal: vacationDaysNatural,
    };
  });
}
