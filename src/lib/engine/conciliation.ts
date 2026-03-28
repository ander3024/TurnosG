// ─── Conciliation Scoring ─────────────────────────────────
import type {
  DaySchedule,
  EnginePerson,
  ConciliationScore,
} from "./types";
import { iterateDates, isWeekend, getWeekStart } from "./dates";

interface ConciliationConfig {
  penalizaDiaIslaTrabajo: number;
  penalizaDiaIslaLibre: number;
  penalizaCortesSemana: number;
  penalizaFinDeSemanaExtra: number;
  penalizaFinesConsecutivos: number;
}

const DEFAULT_CONFIG: ConciliationConfig = {
  penalizaDiaIslaTrabajo: 3,
  penalizaDiaIslaLibre: 2,
  penalizaCortesSemana: 1,
  penalizaFinDeSemanaExtra: 1,
  penalizaFinesConsecutivos: 2,
};

export function calculateConciliation(
  schedule: DaySchedule[],
  people: EnginePerson[],
  config?: Partial<ConciliationConfig>
): ConciliationScore[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Build a map: date -> Set of personIds working that day
  const workingMap = new Map<string, Set<number>>();
  for (const day of schedule) {
    const pids = new Set<number>();
    for (const a of day.assignments) {
      if (a.personId) pids.add(a.personId);
    }
    workingMap.set(day.date, pids);
  }

  const dates = schedule.map((d) => d.date).sort();
  if (dates.length === 0) return [];

  return people.map((person) => {
    let islandWorkDays = 0;
    let islandOffDays = 0;
    let transitions = 0;
    let extraWeekends = 0;
    let consecutiveWeekendPenalty = 0;

    // Build work pattern: true = working, false = off
    const pattern = dates.map((d) => workingMap.get(d)?.has(person.id) ?? false);

    // Count transitions and islands
    for (let i = 0; i < pattern.length; i++) {
      // Transitions
      if (i > 0 && pattern[i] !== pattern[i - 1]) {
        transitions++;
      }
      // Island working day: OFF-WORK-OFF
      if (
        i > 0 &&
        i < pattern.length - 1 &&
        !pattern[i - 1] &&
        pattern[i] &&
        !pattern[i + 1]
      ) {
        islandWorkDays++;
      }
      // Island off day: WORK-OFF-WORK
      if (
        i > 0 &&
        i < pattern.length - 1 &&
        pattern[i - 1] &&
        !pattern[i] &&
        pattern[i + 1]
      ) {
        islandOffDays++;
      }
    }

    // Count weekends worked and consecutive weekends
    const weekendDates = dates.filter((d) => isWeekend(d));
    // Group by week
    const weekendWeeks = new Map<string, boolean>();
    for (const d of weekendDates) {
      const ws = getWeekStart(d);
      if (workingMap.get(d)?.has(person.id)) {
        weekendWeeks.set(ws, true);
      } else if (!weekendWeeks.has(ws)) {
        weekendWeeks.set(ws, false);
      }
    }

    const workedWeekends = [...weekendWeeks.values()].filter(Boolean).length;
    const fairShare = Math.ceil(workedWeekends / Math.max(people.length, 1));
    if (workedWeekends > fairShare) {
      extraWeekends = workedWeekends - fairShare;
    }

    // Consecutive weekends
    const weeks = [...weekendWeeks.entries()].sort(([a], [b]) => a.localeCompare(b));
    let consecutive = 0;
    for (const [, worked] of weeks) {
      if (worked) {
        consecutive++;
        if (consecutive >= 2) {
          consecutiveWeekendPenalty++;
        }
      } else {
        consecutive = 0;
      }
    }

    const totalScore =
      islandWorkDays * cfg.penalizaDiaIslaTrabajo +
      islandOffDays * cfg.penalizaDiaIslaLibre +
      transitions * cfg.penalizaCortesSemana +
      extraWeekends * cfg.penalizaFinDeSemanaExtra +
      consecutiveWeekendPenalty * cfg.penalizaFinesConsecutivos;

    return {
      personId: person.id,
      personCode: person.code,
      personName: person.name,
      islandWorkDays,
      islandOffDays,
      transitions,
      extraWeekends,
      consecutiveWeekends: consecutiveWeekendPenalty,
      totalScore,
    };
  });
}
