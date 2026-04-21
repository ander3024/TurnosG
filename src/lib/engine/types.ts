// ─── Engine Types ─────────────────────────────────────────

export interface EnginePerson {
  id: number;
  code: string;
  name: string;
  color: string;
  offset: number;
}

export interface EngineShiftType {
  id: number;
  code: string;
  label: string;
  startTime: string; // "HH:MM"
  endTime: string;
  lunchMinutes: number;
  category: "regular" | "weekend" | "refuerzo";
}

export interface EngineEvent {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  weekdaysExtraSlots: number;
  weekendExtraSlots: number;
  assigneePersonId: number | null;
  assigneeForced: boolean;
  weekdayRefuerzo: string | null; // "mañana" | "tarde" | "auto" | null
}

export interface EngineTimeOff {
  personId: number;
  startDate: string;
  endDate: string;
  type: string;
}

export interface EngineHoliday {
  date: string;
  type: string; // "official" | "custom" | "working"
  label: string | null;
}

export interface EngineOverride {
  date: string;
  shiftTypeId: number;
  shiftTypeCode: string;
  personId: number | null;
  personCode: string | null;
  slotIndex: number;
}

export interface EngineExtraHours {
  personId: number;
  date: string;
  hours: number;
}

export interface ScheduleRules {
  enforce: boolean;
  maxConsecutiveWeekends: number;
  maxDailyHours: number;
  maxWeeklyHours: number;
  minRestHours: number;
}

export interface EngineSettings {
  startDate: string;
  weeks: number;
  annualTargetHours: number;
  vacationDaysNatural: number;
  travelDefaultHours: number;
  province: string;
  rebalance: boolean;
  closeOnHolidays: boolean;
  consumeVacationOnHoliday: boolean;
  applyConciliation: boolean;
  vacationRelaxedMonths: number[]; // months (1-12) where only 2 people needed L-J
  rules: ScheduleRules;
}

export interface EngineContext {
  people: EnginePerson[];
  shiftTypes: Map<string, EngineShiftType>; // keyed by code
  shiftTypesById: Map<number, EngineShiftType>;
  events: EngineEvent[];
  timeOffs: EngineTimeOff[];
  holidays: Map<string, EngineHoliday>; // keyed by date
  overrides: Map<string, EngineOverride[]>; // keyed by date
  extraHours: EngineExtraHours[];
  settings: EngineSettings;
}

export interface ShiftAssignment {
  date: string;
  shiftTypeCode: string;
  shiftTypeLabel: string;
  startTime: string;
  endTime: string;
  personId: number | null;
  personCode: string | null;
  personName: string | null;
  personColor: string | null;
  slotIndex: number;
  source: "rotation" | "override" | "event" | "balance";
  hours: number;
}

export interface DaySchedule {
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  isClosed: boolean;
  holidayLabel: string | null;
  assignments: ShiftAssignment[];
  events: { label: string; color: string | null }[];
  timeOffs: { personId: number; personCode: string; personName: string; personColor: string; type: string }[];
  offPeople: { personId: number; personCode: string; personName: string; personColor: string }[];
}

export interface HoursSummary {
  personId: number;
  personCode: string;
  personName: string;
  personColor: string;
  weekdayHours: number;
  weekendHours: number;
  refuerzoHours: number;
  extraHoursLogged: number;
  totalHours: number;
  targetHours: number;
  delta: number;
  vacationDaysUsed: number;
  vacationDaysTotal: number;
}

export interface ConciliationScore {
  personId: number;
  personCode: string;
  personName: string;
  islandWorkDays: number;
  islandOffDays: number;
  transitions: number;
  extraWeekends: number;
  consecutiveWeekends: number;
  totalScore: number;
}

export interface RuleViolation {
  date: string;
  personId: number;
  personCode: string;
  rule: string;
  message: string;
}
