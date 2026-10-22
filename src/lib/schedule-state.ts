// ─── Estado del cuadrante para las pantallas de administración ─────────────
// Un único sitio donde se genera el cuadrante y sus horas, para que lo que ve
// la web y lo que devuelve la API no puedan divergir, y donde se simula un
// cambio ANTES de escribirlo en la base de datos.
import {
  loadEngineContextForRange,
  generateScheduleSlice,
  buildHoursSummary,
} from "@/lib/engine";
import type { DaySchedule, EngineContext, HoursSummary } from "@/lib/engine";
import type { EngineOverride } from "@/lib/engine/types";
import {
  loadApprovedSwaps, checkSwaps, indexByDate, toSwapNote,
} from "@/lib/swap-integrity";
import type { IntegritySwap, SwapNote } from "@/lib/swap-integrity";

export interface ScheduleState {
  schedule: DaySchedule[];
  hours: HoursSummary[];
}

export interface OverrideMutation {
  action: "set" | "remove";
  date: string;
  shiftTypeId: number;
  slotIndex: number;
  personId?: number | null;
}

/** Año completo que cubre una fecha: el motor siempre calcula el año entero. */
function yearOf(date: string) {
  const y = date.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Horas por persona. Misma lógica para todas las pantallas (ver GET /schedule/hours). */
export function summarizeHours(ctx: EngineContext, schedule: DaySchedule[]): HoursSummary[] {
  const holidayDates = new Set<string>();
  for (const [date, h] of ctx.holidays) {
    // Con consumeVacationOnHoliday=false ningún festivo consume vacaciones,
    // ni siquiera los que la tienda abre (type "working").
    if (!ctx.settings.consumeVacationOnHoliday || h.type !== "working") holidayDates.add(date);
  }
  return buildHoursSummary(
    schedule.flatMap((d) => d.assignments),
    ctx.extraHours,
    ctx.timeOffs,
    ctx.settings.annualTargetHours,
    ctx.settings.vacationDaysNatural,
    ctx.people,
    holidayDates
  );
}

/**
 * Cuadrante del rango pedido + horas del año completo, de UNA sola generación.
 * Así el trozo que se pinta y el total de horas salen del mismo cálculo y no
 * pueden contarse cosas distintas.
 */
export async function loadScheduleState(from: string, to: string): Promise<ScheduleState> {
  const ctx = await loadEngineContextForRange(from, to);
  const { from: yFrom, to: yTo } = yearOf(from);
  const full = generateScheduleSlice(ctx, yFrom, `${to.slice(0, 4)}-12-31`);
  return {
    schedule: full.filter((d) => d.date >= from && d.date <= to),
    hours: summarizeHours(ctx, full.filter((d) => d.date >= yFrom && d.date <= yTo)),
  };
}

/** Copia del contexto con el cambio aplicado sólo en memoria. */
function withMutation(ctx: EngineContext, m: OverrideMutation): EngineContext {
  const overrides = new Map(ctx.overrides);
  const sameSlot = (o: EngineOverride) => o.shiftTypeId === m.shiftTypeId && o.slotIndex === m.slotIndex;
  const dayOverrides = (overrides.get(m.date) ?? []).filter((o) => !sameSlot(o));
  if (m.action === "set") {
    const shift = ctx.shiftTypesById.get(m.shiftTypeId);
    const person = ctx.people.find((p) => p.id === m.personId);
    dayOverrides.push({
      date: m.date,
      shiftTypeId: m.shiftTypeId,
      shiftTypeCode: shift?.code ?? "",
      personId: m.personId ?? null,
      personCode: person?.code ?? null,
      slotIndex: m.slotIndex,
    });
  }
  overrides.set(m.date, dayOverrides);
  return { ...ctx, overrides };
}

/** Huella de un día, para detectar si el motor lo ha movido. */
function daySignature(day: DaySchedule) {
  return day.assignments
    .map((a) => `${a.shiftTypeCode}#${a.slotIndex}:${a.personId ?? 0}`)
    .sort()
    .join("|");
}

/** Personas por hueco, agrupadas (dos responsables comparten el hueco de oficina). */
function slotPeople(day: DaySchedule | undefined) {
  const rows = new Map<string, { label: string; names: string[] }>();
  for (const a of day?.assignments ?? []) {
    const k = `${a.shiftTypeCode}#${a.slotIndex}`;
    if (!rows.has(k)) rows.set(k, { label: a.shiftTypeLabel, names: [] });
    rows.get(k)!.names.push(a.personName ?? "(vacío)");
  }
  return rows;
}

export interface OverridePreview {
  date: string;
  /** Lo que cambia en el día editado. */
  dayChanges: { label: string; before: string; after: string }[];
  /** Horas del año que gana o pierde cada persona. */
  hourDeltas: { personId: number; personName: string; personColor: string; before: number; after: number; delta: number }[];
  /** Otros días del año que el motor reordena por efecto rebote. */
  otherDaysChanged: number;
  otherDaysSample: string[];
  /** true si el cambio se guardaría pero no alteraría el cuadrante. */
  noEffect: boolean;
  /** Intercambios aprobados que comprometen ESE día, tal como están ahora. */
  swapsOnDay: SwapNote[];
  /** Intercambios aprobados que este cambio dejaría sin cumplir. */
  swapsBroken: SwapNote[];
  /** Intercambios ahora incumplidos que este cambio volvería a cumplir. */
  swapsRestored: SwapNote[];
}

/**
 * Simula el cambio sobre el año completo y devuelve lo que pasaría.
 * No escribe nada: dos generaciones en memoria (~50-120 ms).
 */
export async function previewOverride(m: OverrideMutation): Promise<OverridePreview> {
  const { from, to } = yearOf(m.date);
  const ctx = await loadEngineContextForRange(from, to);
  const base = generateScheduleSlice(ctx, from, to);
  const mod = generateScheduleSlice(withMutation(ctx, m), from, to);

  const beforeRows = slotPeople(base.find((d) => d.date === m.date));
  const afterRows = slotPeople(mod.find((d) => d.date === m.date));
  const dayChanges: OverridePreview["dayChanges"] = [];
  for (const k of new Set([...beforeRows.keys(), ...afterRows.keys()])) {
    const b = beforeRows.get(k);
    const a = afterRows.get(k);
    const before = b ? b.names.join(" + ") : "—";
    const after = a ? a.names.join(" + ") : "—";
    if (before !== after) dayChanges.push({ label: (a || b)!.label, before, after });
  }

  const baseHours = summarizeHours(ctx, base);
  const modHours = summarizeHours(ctx, mod);
  const hourDeltas = modHours
    .map((h) => {
      const b = baseHours.find((x) => x.personId === h.personId);
      return {
        personId: h.personId,
        personName: h.personName,
        personColor: h.personColor,
        before: b?.totalHours ?? 0,
        after: h.totalHours,
        delta: h.totalHours - (b?.totalHours ?? 0),
      };
    })
    .filter((d) => Math.abs(d.delta) > 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Un intercambio aprobado es un compromiso con dos personas y una edición
  // manual lo puede deshacer sin que nadie se entere (pasó el 18-sep-2026).
  // Se comprueban contra los dos cuadrantes: el de ahora y el simulado.
  const approved = (await loadApprovedSwaps(from, to)) as unknown as IntegritySwap[];
  const baseRows = checkSwaps(approved, indexByDate(base));
  const modRows = checkSwaps(approved, indexByDate(mod));
  const baseById = new Map(baseRows.map((r) => [r.swapId, r]));
  const wasOk = (id: number) => baseById.get(id)?.integrity.ok === true;
  const wasBroken = (id: number) =>
    baseById.get(id)?.integrity.ok === false && !baseById.get(id)?.integrity.supersededBySwapId;

  const swapsBroken = modRows
    .filter((r) => r.integrity.ok === false && !r.integrity.supersededBySwapId && wasOk(r.swapId))
    .map(toSwapNote);
  const swapsRestored = modRows
    .filter((r) => r.integrity.ok === true && wasBroken(r.swapId))
    .map(toSwapNote);
  const swapsOnDay = baseRows
    .filter((r) => r.integrity.dates.includes(m.date))
    .map(toSwapNote);

  const baseSig = new Map(base.map((d) => [d.date, daySignature(d)]));
  const otherDays = mod
    .filter((d) => d.date !== m.date && baseSig.get(d.date) !== daySignature(d))
    .map((d) => d.date);

  return {
    date: m.date,
    dayChanges,
    hourDeltas,
    otherDaysChanged: otherDays.length,
    otherDaysSample: otherDays.slice(0, 8),
    noEffect: dayChanges.length === 0 && hourDeltas.length === 0 && otherDays.length === 0,
    swapsOnDay,
    swapsBroken,
    swapsRestored,
  };
}
