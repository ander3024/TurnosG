// ─── Engine Public API ────────────────────────────────────
export { loadEngineContext, loadEngineContextForRange } from "./loader";
export { generateSchedule, generateScheduleToTarget, generateScheduleSlice } from "./scheduler";
export { buildHoursSummary, shiftHours } from "./hours";
export { calculateConciliation } from "./conciliation";
export { validateAssignments } from "./rules";
export {
  getOffPerson,
  getWeekendWorker,
  getWeekdayWorkers,
} from "./rotation";
export type { GoalFillOptions } from "./scheduler";
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
