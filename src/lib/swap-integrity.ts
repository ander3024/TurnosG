// ─── ¿Se sigue cumpliendo lo que se pactó en un intercambio? ───────────────
// Un intercambio aprobado es un compromiso con dos personas: quien cubre y
// quien libra. El cuadrante, en cambio, se puede editar a mano meses después
// y pisar ese compromiso sin que nadie se entere (pasó el 18-sep-2026: una
// edición manual de agosto deshizo un intercambio aprobado en julio).
// Aquí se traduce cada intercambio a lo que tiene que verse en el cuadrante y
// se comprueba contra el cuadrante de verdad, el que genera el motor.
import { prisma } from "@/lib/prisma";
import { loadEngineContextForRange, generateScheduleSlice } from "@/lib/engine";
import type { DaySchedule } from "@/lib/engine";

/** Lo mínimo que hace falta de un intercambio para saber qué prometió. */
export interface IntegritySwap {
  id: number;
  status: string;
  fromDate: string;
  toDate: string;
  fromShiftLabel: string;
  toShiftLabel: string;
  isOneWay: boolean;
  hours: number | null;
  fromPersonId: number;
  toPersonId: number;
  fromPerson: { name: string; color?: string | null };
  toPerson: { name: string; color?: string | null };
  resolvedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/**
 * Qué clase de intercambio es, con las MISMAS reglas que usa la aprobación
 * (ver PATCH /api/employee/swaps/[id]):
 *   partial → solo deuda de horas, no toca el cuadrante
 *   cover   → una persona cubre el turno completo de otra, que libra
 *   swap    → los dos trabajan, intercambiando turnos
 */
export type SwapKind = "partial" | "cover" | "swap";

export function swapKind(s: Pick<IntegritySwap, "hours" | "isOneWay" | "toShiftLabel">): SwapKind {
  if (typeof s.hours === "number" && s.hours > 0) return "partial";
  if (s.isOneWay || (s.toShiftLabel || "").trim().toLowerCase() === "libra") return "cover";
  return "swap";
}

/** Etiqueta pactada → código de turno. Único sitio donde se traduce. */
export function shiftCodeForLabel(shiftLabel: string): string | null {
  const l = (shiftLabel || "").toLowerCase();
  if (l.includes("libra")) return null;
  if (l.includes("finde") || l.includes("fin de semana")) return "weekend";
  if (l.includes("refuerzo") && l.includes("tarde")) return "refuerzo_afternoon";
  if (l.includes("refuerzo") && (l.includes("mañana") || l.includes("manana"))) return "refuerzo_morning";
  if (l.includes("refuerzo")) return "refuerzo_ofi";
  if (l.includes("oficina") && l.includes("viernes")) return "office_friday";
  if (l.includes("oficina")) return "office";
  if (l.includes("tarde")) return "afternoon";
  if (l.includes("mañana") || l.includes("manana")) return "morning";
  return null;
}

/** Un compromiso concreto: tal persona, tal día, en tal turno. */
export interface SwapLeg {
  date: string;
  /** Quien tiene que estar en ese turno. */
  personId: number;
  personName: string;
  shiftLabel: string;
  shiftCode: string | null;
  /** Solo en coberturas: quien NO debe tener turno ese día porque libra. */
  freedPersonId?: number;
  freedPersonName?: string;
}

/**
 * Lo que un intercambio aprobado obliga a que se vea en el cuadrante.
 * Las coberturas parciales no obligan a nada: nadie cambia de turno, solo se
 * apunta la deuda de horas.
 */
export function swapLegs(s: IntegritySwap): SwapLeg[] {
  const kind = swapKind(s);
  if (kind === "partial") return [];

  const legs: SwapLeg[] = [{
    date: s.fromDate,
    personId: s.toPersonId,
    personName: s.toPerson.name,
    shiftLabel: s.fromShiftLabel,
    shiftCode: shiftCodeForLabel(s.fromShiftLabel),
    ...(kind === "cover" ? { freedPersonId: s.fromPersonId, freedPersonName: s.fromPerson.name } : {}),
  }];

  if (kind === "swap") {
    legs.push({
      date: s.toDate,
      personId: s.fromPersonId,
      personName: s.fromPerson.name,
      shiftLabel: s.toShiftLabel,
      shiftCode: shiftCodeForLabel(s.toShiftLabel),
    });
  }
  return legs;
}

export interface SwapProblem {
  date: string;
  /** Frase lista para enseñar, en los términos del acuerdo. */
  detail: string;
}

export interface SwapIntegrity {
  /** false = el cuadrante ya no cumple el acuerdo. null = no se ha podido comprobar. */
  ok: boolean | null;
  problems: SwapProblem[];
  /** Días del cuadrante que este intercambio compromete. */
  dates: string[];
  /**
   * Si el que lo deshizo fue otro intercambio posterior entre los mismos dos
   * el mismo día (se pidieron el cambio y luego el contrario): no es un
   * descuadre que haya que arreglar, los dos se anulan entre sí.
   */
  supersededBySwapId?: number | null;
}

/**
 * Familia de turno: un "Refuerzo Mañana" cubre lo mismo que una "Mañana".
 * Al pedir el intercambio se guarda la etiqueta que vio el empleado, que no
 * siempre es el turno exacto que el motor le había puesto, así que comparar
 * por familia evita dar por roto lo que sí se cumplió.
 */
const SHIFT_FAMILY: Record<string, string> = {
  morning: "mañana", refuerzo_morning: "mañana", refuerzo_ofi: "mañana",
  afternoon: "tarde", refuerzo_afternoon: "tarde",
  weekend: "finde", office: "oficina", office_friday: "oficina",
};

function familyOfCode(code: string) {
  return SHIFT_FAMILY[code] ?? code;
}

function familyOfLabel(label: string) {
  const code = shiftCodeForLabel(label);
  return code ? familyOfCode(code) : null;
}

function assignmentsOf(day: DaySchedule, personId: number) {
  return day.assignments.filter((a) => a.personId === personId);
}

/** Comprueba un intercambio contra el cuadrante generado (indexado por fecha). */
export function checkSwap(s: IntegritySwap, days: Map<string, DaySchedule>): SwapIntegrity {
  const legs = swapLegs(s);
  // Pendiente o aceptado todavía no obliga a nada, y la parcial no toca el
  // cuadrante: en los dos casos no hay nada que comprobar.
  if (legs.length === 0 || s.status !== "aprobado") {
    return { ok: null, problems: [], dates: [...new Set(legs.map((l) => l.date))] };
  }

  const problems: SwapProblem[] = [];
  let checked = 0;

  for (const leg of legs) {
    const day = days.get(leg.date);
    if (!day) continue; // fuera del rango calculado: no se afirma nada
    checked++;

    const family = familyOfLabel(leg.shiftLabel);
    const mine = assignmentsOf(day, leg.personId);
    const covers = family
      ? mine.some((a) => familyOfCode(a.shiftTypeCode) === family)
      : mine.length > 0;

    if (!covers) {
      const holders = day.assignments
        .filter((a) => family && familyOfCode(a.shiftTypeCode) === family && a.personName)
        .map((a) => a.personName);
      const whereIsIt = mine.length > 0
        ? `está en ${mine.map((a) => a.shiftTypeLabel).join(" + ")}`
        : "no tiene turno ese día";
      const whoHasIt = holders.length > 0
        ? `ese turno lo tiene ${holders.join(" + ")}`
        : `ese día ya no hay turno de ${leg.shiftLabel}`;
      problems.push({
        date: leg.date,
        detail: `${leg.personName} tenía que cubrir ${leg.shiftLabel}: ${whereIsIt} y ${whoHasIt}.`,
      });
    }

    if (leg.freedPersonId) {
      const freed = assignmentsOf(day, leg.freedPersonId);
      if (freed.length > 0) {
        problems.push({
          date: leg.date,
          detail: `${leg.freedPersonName} libraba ese día y vuelve a tener turno (${freed.map((a) => a.shiftTypeLabel).join(" + ")}).`,
        });
      }
    }
  }

  if (checked === 0) return { ok: null, problems: [], dates: [...new Set(legs.map((l) => l.date))] };
  return { ok: problems.length === 0, problems, dates: [...new Set(legs.map((l) => l.date))] };
}

/** Intercambios aprobados que comprometen algún día del rango. */
export async function loadApprovedSwaps(from: string, to: string) {
  const swaps = await prisma.swapRequest.findMany({
    where: {
      status: "aprobado",
      OR: [
        { fromDate: { gte: from, lte: to } },
        { toDate: { gte: from, lte: to } },
      ],
    },
    include: {
      fromPerson: { select: { id: true, name: true, color: true } },
      toPerson: { select: { id: true, name: true, color: true } },
    },
    orderBy: { fromDate: "asc" },
  });
  // Las parciales no comprometen el cuadrante: fuera de la comprobación.
  return swaps.filter((s) => swapKind(s) !== "partial");
}

/** Índice por fecha del cuadrante. */
export function indexByDate(days: DaySchedule[]) {
  return new Map(days.map((d) => [d.date, d]));
}

export interface SwapCheckRow {
  swapId: number;
  kind: SwapKind;
  fromDate: string;
  toDate: string;
  fromShiftLabel: string;
  toShiftLabel: string;
  fromPerson: { name: string; color?: string | null };
  toPerson: { name: string; color?: string | null };
  integrity: SwapIntegrity;
}

function when(s: IntegritySwap) {
  const d = s.resolvedAt ?? s.createdAt;
  return d ? new Date(d).getTime() : 0;
}

/**
 * Revisa una lista de intercambios contra un cuadrante ya generado.
 * Si uno está roto porque los mismos dos pidieron después el intercambio
 * contrario el mismo día, se marca como anulado por ese otro en vez de como
 * descuadre: el segundo pisa el override del primero y la pareja queda a cero.
 */
export function checkSwaps(swaps: IntegritySwap[], days: Map<string, DaySchedule>): SwapCheckRow[] {
  const rows = swaps.map((s) => ({
    swapId: s.id,
    kind: swapKind(s),
    fromDate: s.fromDate,
    toDate: s.toDate,
    fromShiftLabel: s.fromShiftLabel,
    toShiftLabel: s.toShiftLabel,
    fromPerson: { name: s.fromPerson.name, color: s.fromPerson.color ?? null },
    toPerson: { name: s.toPerson.name, color: s.toPerson.color ?? null },
    integrity: checkSwap(s, days),
  }));

  for (const row of rows) {
    if (row.integrity.ok !== false) continue;
    const s = swaps.find((x) => x.id === row.swapId)!;
    const opposite = swaps.find(
      (o) =>
        o.id !== s.id &&
        o.fromDate === s.fromDate &&
        o.toDate === s.toDate &&
        o.fromPersonId === s.toPersonId &&
        o.toPersonId === s.fromPersonId &&
        when(o) > when(s)
    );
    if (opposite) row.integrity.supersededBySwapId = opposite.id;
  }
  return rows;
}

/** Todos los intercambios que tocan el rango, en cualquier estado. */
export async function loadSwapsInRange(from: string, to: string) {
  return prisma.swapRequest.findMany({
    where: {
      OR: [
        { fromDate: { gte: from, lte: to } },
        { toDate: { gte: from, lte: to } },
      ],
    },
    include: {
      fromPerson: { select: { id: true, name: true, color: true } },
      toPerson: { select: { id: true, name: true, color: true } },
    },
    orderBy: { fromDate: "asc" },
  });
}

/** Cuadrante de los años que hagan falta, generando SIEMPRE el año completo. */
export async function scheduleIndexForDates(dates: string[]) {
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))].sort();
  const days = new Map<string, DaySchedule>();
  for (const y of years) {
    const ctx = await loadEngineContextForRange(`${y}-01-01`, `${y}-12-31`);
    for (const d of generateScheduleSlice(ctx, `${y}-01-01`, `${y}-12-31`)) days.set(d.date, d);
  }
  return days;
}

/** unchecked = no hay nada que comprobar (parcial, o aún sin aprobar). */
export type SwapNoteStatus = "ok" | "broken" | "superseded" | "unchecked";

/** Un intercambio resumido en una línea, para enseñarlo en el calendario. */
export interface SwapNote {
  swapId: number;
  kind: SwapKind;
  status: SwapNoteStatus;
  /** "Heins cubre a Edu" / "Edu ↔ Heins". */
  people: string;
  dates: string[];
  shift: string;
  detail: string | null;
  supersededBySwapId?: number | null;
}

export function toSwapNote(row: SwapCheckRow): SwapNote {
  const people = row.kind === "swap"
    ? `${row.fromPerson.name} ↔ ${row.toPerson.name}`
    : `${row.toPerson.name} cubre a ${row.fromPerson.name}`;
  const status: SwapNoteStatus =
    row.integrity.ok === null ? "unchecked"
    : row.integrity.ok ? "ok"
    : row.integrity.supersededBySwapId ? "superseded"
    : "broken";
  return {
    swapId: row.swapId,
    kind: row.kind,
    status,
    people,
    dates: row.integrity.dates,
    shift: row.kind === "swap" ? `${row.fromShiftLabel} ↔ ${row.toShiftLabel}` : row.fromShiftLabel,
    detail: row.integrity.problems[0]?.detail ?? null,
    supersededBySwapId: row.integrity.supersededBySwapId ?? null,
  };
}

/**
 * Revisión de los intercambios aprobados de un rango contra el cuadrante real.
 * Genera el año (o años) completo, como manda el motor, y no escribe nada.
 */
export async function auditSwaps(from: string, to: string): Promise<SwapCheckRow[]> {
  const swaps = await loadApprovedSwaps(from, to);
  if (swaps.length === 0) return [];

  const days = await scheduleIndexForDates(swaps.flatMap((s) => [s.fromDate, s.toDate]));
  return checkSwaps(swaps as IntegritySwap[], days);
}
