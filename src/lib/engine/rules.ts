// ─── Rules Validation ─────────────────────────────────────
import type {
  DaySchedule,
  EnginePerson,
  ScheduleRules,
  RuleViolation,
} from "./types";
import { isWeekend, getWeekStart } from "./dates";

export function validateAssignments(
  schedule: DaySchedule[],
  people: EnginePerson[],
  rules: ScheduleRules
): RuleViolation[] {
  if (!rules.enforce) return [];

  const violations: RuleViolation[] = [];

  // Group schedule by week for weekly checks
  const weeklyHours = new Map<string, Map<number, number>>(); // weekStart -> personId -> hours
  const dailyHours = new Map<string, Map<number, number>>(); // date -> personId -> hours

  for (const day of schedule) {
    for (const a of day.assignments) {
      if (!a.personId) continue;

      // Daily hours
      if (!dailyHours.has(day.date)) dailyHours.set(day.date, new Map());
      const dh = dailyHours.get(day.date)!;
      dh.set(a.personId, (dh.get(a.personId) || 0) + a.hours);

      // Weekly hours
      const ws = getWeekStart(day.date);
      if (!weeklyHours.has(ws)) weeklyHours.set(ws, new Map());
      const wh = weeklyHours.get(ws)!;
      wh.set(a.personId, (wh.get(a.personId) || 0) + a.hours);
    }
  }

  // Check max daily hours
  for (const [date, personHours] of dailyHours) {
    for (const [personId, hours] of personHours) {
      if (hours > rules.maxDailyHours) {
        const p = people.find((pp) => pp.id === personId);
        violations.push({
          date,
          personId,
          personCode: p?.code || "?",
          rule: "maxDailyHours",
          message: `${p?.name || "?"} tiene ${hours}h en ${date} (máx: ${rules.maxDailyHours}h)`,
        });
      }
    }
  }

  // Check max weekly hours
  for (const [weekStart, personHours] of weeklyHours) {
    for (const [personId, hours] of personHours) {
      if (hours > rules.maxWeeklyHours) {
        const p = people.find((pp) => pp.id === personId);
        violations.push({
          date: weekStart,
          personId,
          personCode: p?.code || "?",
          rule: "maxWeeklyHours",
          message: `${p?.name || "?"} tiene ${hours}h en semana de ${weekStart} (máx: ${rules.maxWeeklyHours}h)`,
        });
      }
    }
  }

  // Check consecutive weekends
  if (rules.maxConsecutiveWeekends > 0) {
    for (const person of people) {
      const weekendWorked = new Map<string, boolean>(); // weekStart -> worked

      for (const day of schedule) {
        if (!isWeekend(day.date)) continue;
        const ws = getWeekStart(day.date);
        if (day.assignments.some((a) => a.personId === person.id)) {
          weekendWorked.set(ws, true);
        } else if (!weekendWorked.has(ws)) {
          weekendWorked.set(ws, false);
        }
      }

      const weeks = [...weekendWorked.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
      );
      let consecutive = 0;
      for (const [ws, worked] of weeks) {
        if (worked) {
          consecutive++;
          if (consecutive > rules.maxConsecutiveWeekends) {
            violations.push({
              date: ws,
              personId: person.id,
              personCode: person.code,
              rule: "maxConsecutiveWeekends",
              message: `${person.name} lleva ${consecutive} fines de semana consecutivos (máx: ${rules.maxConsecutiveWeekends})`,
            });
          }
        } else {
          consecutive = 0;
        }
      }
    }
  }

  return violations;
}
