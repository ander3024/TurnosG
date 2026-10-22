// ─── Deudas de horas entre compañeros ─────────────────────────────────────
// Un único sitio donde se decide cuánto vale un intercambio y cuánto se deben
// entre sí, para que la pantalla del empleado y la del admin no puedan dar
// números distintos.
import { prisma } from "@/lib/prisma";
import { shiftHours } from "@/lib/engine";

export interface DebtSwap {
  id: number;
  fromPersonId: number;
  toPersonId: number;
  fromDate: string;
  fromShiftLabel: string;
  isOneWay: boolean;
  hours: number | null;
  settled: boolean;
}

/** Horas reales de cada turno, por etiqueta: Finde 12h, Oficina Viernes 7h, el resto 8h. */
export async function shiftHoursByLabel(): Promise<Map<string, number>> {
  const types = await prisma.shiftType.findMany();
  const map = new Map<string, number>();
  for (const t of types) {
    map.set(t.label.trim().toLowerCase(), shiftHours({
      code: t.code, label: t.label, startTime: t.startTime, endTime: t.endTime,
      lunchMinutes: t.lunchMinutes, category: t.category,
    } as any));
  }
  return map;
}

/**
 * Lo que vale un intercambio en horas.
 * Cobertura parcial: las horas pactadas. Turno completo: lo que dura ESE turno
 * de verdad — un finde son 12h, no 8, que es lo que se daba por supuesto antes.
 */
export function swapDebtHours(swap: DebtSwap, hoursByLabel: Map<string, number>): number {
  if (swap.hours != null) return swap.hours;
  return hoursByLabel.get(swap.fromShiftLabel.trim().toLowerCase()) ?? 8;
}

/**
 * Liquida una deuda nueva contra la contraria SOLO si son de la misma cantidad.
 * Antes se daba por liquidada cualquier pareja en sentidos opuestos sin mirar
 * las horas, así que 0,5h cancelaban 3h y 2h cancelaban un finde de 12h. Si no
 * coinciden se dejan las dos vivas: el saldo neto sale correcto solo.
 */
export async function settleAgainstOpposite(swapId: number): Promise<number | null> {
  const swap = await prisma.swapRequest.findUnique({ where: { id: swapId } });
  if (!swap) return null;

  const hoursByLabel = await shiftHoursByLabel();
  const amount = swapDebtHours(swap as DebtSwap, hoursByLabel);

  const candidates = await prisma.swapRequest.findMany({
    where: {
      fromPersonId: swap.toPersonId,
      toPersonId: swap.fromPersonId,
      settled: false,
      status: "aprobado",
      id: { not: swapId },
      OR: [{ isOneWay: true }, { hours: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
  });

  const match = candidates.find(
    (c) => Math.abs(swapDebtHours(c as DebtSwap, hoursByLabel) - amount) < 0.01
  );
  if (!match) return null;

  await prisma.swapRequest.update({ where: { id: match.id }, data: { settled: true, settledBySwapId: swapId } });
  await prisma.swapRequest.update({ where: { id: swapId }, data: { settled: true, settledBySwapId: match.id } });
  return match.id;
}

export interface DebtDetail {
  swapId: number;
  date: string;
  shift: string;
  hours: number;
  direction: "iOwe" | "theyOwe";
  isPartial: boolean;
}

/** Intercambios con deuda viva. Con `personId`, solo los de esa persona. */
export async function loadOpenDebts(personId?: number) {
  const hoursByLabel = await shiftHoursByLabel();
  const open = await prisma.swapRequest.findMany({
    where: {
      settled: false,
      status: "aprobado",
      OR: [{ isOneWay: true }, { hours: { not: null } }],
    },
    include: {
      fromPerson: { select: { id: true, code: true, name: true, color: true } },
      toPerson: { select: { id: true, code: true, name: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const swaps = personId
    ? open.filter((s) => s.fromPersonId === personId || s.toPersonId === personId)
    : open;

  return { swaps, hoursByLabel };
}
