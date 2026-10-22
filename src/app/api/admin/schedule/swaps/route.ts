import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  loadSwapsInRange, loadApprovedSwaps, scheduleIndexForDates, checkSwaps, toSwapNote,
} from "@/lib/swap-integrity";
import type { IntegritySwap } from "@/lib/swap-integrity";
import type { DaySchedule } from "@/lib/engine";

/**
 * Intercambios que tocan el rango + si el cuadrante los sigue cumpliendo.
 * Sin from/to revisa TODOS los aprobados, que es lo que necesita la pantalla
 * de intercambios para avisar de los que una edición manual dejó sin efecto.
 * El calendario lo usa para marcar los días con intercambio y para avisar de
 * los aprobados que una edición manual posterior dejó sin efecto.
 * Solo lee: genera el cuadrante en memoria y no escribe nada.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const swaps = from && to
      ? (await loadSwapsInRange(from, to)).filter((s) =>
          ["pendiente", "aceptado", "aprobado"].includes(s.status))
      : await loadApprovedSwaps("1900-01-01", "2999-12-31");

    // El cuadrante solo hace falta si hay algo aprobado que comprobar.
    const checkable = swaps.filter((s) => s.status === "aprobado");
    const days: Map<string, DaySchedule> = checkable.length
      ? await scheduleIndexForDates(checkable.flatMap((s) => [s.fromDate, s.toDate]))
      : new Map();

    const rows = checkSwaps(swaps as unknown as IntegritySwap[], days);
    const byId = new Map(rows.map((r) => [r.swapId, r]));

    const items = swaps.map((s) => {
      const note = toSwapNote(byId.get(s.id)!);
      return {
        id: s.id,
        status: s.status,
        kind: note.kind,
        fromDate: s.fromDate,
        toDate: s.toDate,
        fromShiftLabel: s.fromShiftLabel,
        toShiftLabel: s.toShiftLabel,
        fromPerson: { id: s.fromPerson.id, name: s.fromPerson.name, color: s.fromPerson.color },
        toPerson: { id: s.toPerson.id, name: s.toPerson.name, color: s.toPerson.color },
        hours: s.hours,
        people: note.people,
        shift: note.shift,
        /** ok | broken | superseded | pending (pending = aún no obliga a nada) */
        check: note.status,
        detail: note.detail,
        supersededBySwapId: note.supersededBySwapId,
      };
    });

    return NextResponse.json({
      items,
      broken: items.filter((i) => i.check === "broken").length,
      orphan: items.filter((i) => i.check === "orphan").length,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/schedule/swaps error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
