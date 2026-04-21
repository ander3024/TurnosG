// ─── Data Loader (Prisma → EngineContext) ─────────────────
import { prisma } from "@/lib/prisma";
import type {
  EngineContext,
  EngineSettings,
  ScheduleRules,
  EngineShiftType,
  EngineOverride,
} from "./types";

function parseSetting(settings: Map<string, string>, key: string, fallback: string): string {
  return settings.get(key) ?? fallback;
}

function parseJSON<T>(settings: Map<string, string>, key: string, fallback: T): T {
  const raw = settings.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadEngineContext(
  from: string,
  to: string
): Promise<EngineContext> {
  const [
    peopleRaw,
    shiftTypesRaw,
    eventsRaw,
    timeOffsRaw,
    holidaysRaw,
    overridesRaw,
    settingsRaw,
    extraHoursRaw,
  ] = await Promise.all([
    prisma.person.findMany({ where: { active: true }, orderBy: { offset: "asc" } }),
    prisma.shiftType.findMany({ where: { active: true } }),
    prisma.event.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      orderBy: { startDate: "asc" },
    }),
    prisma.timeOffRequest.findMany({
      where: { status: "aprobada", startDate: { lte: to }, endDate: { gte: from } },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: from, lte: to } },
    }),
    prisma.override.findMany({
      where: { date: { gte: from, lte: to } },
      include: {
        shiftType: { select: { code: true } },
        person: { select: { code: true } },
      },
    }),
    prisma.setting.findMany(),
    prisma.extraHours.findMany({
      where: { date: { gte: from, lte: to } },
    }),
  ]);

  // Build settings map
  const settingsMap = new Map<string, string>();
  for (const s of settingsRaw) {
    settingsMap.set(s.key, s.value);
  }

  // Parse rules
  const defaultRules: ScheduleRules = {
    enforce: false,
    maxConsecutiveWeekends: 1,
    maxDailyHours: 12,
    maxWeeklyHours: 64,
    minRestHours: 12,
  };
  const rules = parseJSON(settingsMap, "rules", defaultRules);

  // Build engine settings
  const settings: EngineSettings = {
    startDate: parseSetting(settingsMap, "startDate", "2026-01-05"),
    weeks: parseInt(parseSetting(settingsMap, "weeks", "52")),
    annualTargetHours: parseInt(parseSetting(settingsMap, "annualTargetHours", "1784")),
    vacationDaysNatural: parseInt(parseSetting(settingsMap, "vacationDaysNatural", "23")),
    travelDefaultHours: parseInt(parseSetting(settingsMap, "travelDefaultHours", "8")),
    province: parseSetting(settingsMap, "province", "Madrid"),
    rebalance: parseSetting(settingsMap, "rebalance", "true") === "true",
    closeOnHolidays: parseSetting(settingsMap, "closeOnHolidays", "true") === "true",
    consumeVacationOnHoliday: parseSetting(settingsMap, "consumeVacationOnHoliday", "false") === "true",
    applyConciliation: parseSetting(settingsMap, "applyConciliation", "false") === "true",
    vacationRelaxedMonths: (() => {
      try { return JSON.parse(parseSetting(settingsMap, "vacationRelaxedMonths", "[6,7,8]")); }
      catch { return [6, 7, 8]; }
    })(),
    rules,
  };

  // Build shift type maps
  const shiftTypes = new Map<string, EngineShiftType>();
  const shiftTypesById = new Map<number, EngineShiftType>();
  for (const st of shiftTypesRaw) {
    const est: EngineShiftType = {
      id: st.id,
      code: st.code,
      label: st.label,
      startTime: st.startTime,
      endTime: st.endTime,
      lunchMinutes: st.lunchMinutes,
      category: st.category as EngineShiftType["category"],
    };
    shiftTypes.set(st.code, est);
    shiftTypesById.set(st.id, est);
  }

  // Build holidays map
  const holidays = new Map(
    holidaysRaw.map((h) => [
      h.date,
      { date: h.date, type: h.type, label: h.label },
    ])
  );

  // Build overrides map grouped by date
  const overrides = new Map<string, EngineOverride[]>();
  for (const o of overridesRaw) {
    const eo: EngineOverride = {
      date: o.date,
      shiftTypeId: o.shiftTypeId,
      shiftTypeCode: o.shiftType.code,
      personId: o.personId,
      personCode: o.person?.code || null,
      slotIndex: o.slotIndex,
    };
    if (!overrides.has(o.date)) overrides.set(o.date, []);
    overrides.get(o.date)!.push(eo);
  }

  return {
    people: peopleRaw.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      color: p.color,
      offset: p.offset,
    })),
    shiftTypes,
    shiftTypesById,
    events: eventsRaw.map((e) => ({
      id: e.id,
      label: e.label,
      startDate: e.startDate,
      endDate: e.endDate,
      weekdaysExtraSlots: e.weekdaysExtraSlots,
      weekendExtraSlots: e.weekendExtraSlots,
      assigneePersonId: e.assigneePersonId,
      assigneeForced: e.assigneeForced,
      weekdayRefuerzo: e.weekdayRefuerzo,
    })),
    timeOffs: timeOffsRaw.map((t) => ({
      personId: t.personId,
      startDate: t.startDate,
      endDate: t.endDate,
      type: t.type,
    })),
    holidays,
    overrides,
    extraHours: extraHoursRaw.map((eh) => ({
      personId: eh.personId,
      date: eh.date,
      hours: eh.hours,
    })),
    settings,
  };
}
