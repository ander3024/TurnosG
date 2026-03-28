// ─── Engine Public API ────────────────────────────────────
export { loadEngineContext } from "./loader";
export { generateSchedule } from "./scheduler";
export { buildHoursSummary, shiftHours } from "./hours";
export { calculateConciliation } from "./conciliation";
export { validateAssignments } from "./rules";
export {
  getOffPerson,
  getWeekendWorker,
  getWeekdayWorkers,
} from "./rotation";
export type {
  EngineContext,
  EnginePerson,
  ShiftAssignment,
  DaySchedule,
  HoursSummary,
  ConciliationScore,
  RuleViolation,
  EngineSettings,
} from "./types";
