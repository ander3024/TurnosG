import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadOpenDebts, swapDebtHours, type DebtSwap } from "@/lib/swap-debts";

export async function GET() {
  try {
    await requireAdmin();

    const { swaps, hoursByLabel } = await loadOpenDebts();

    const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const pairMap = new Map<string, {
      personA: { id: number; code: string; name: string; color: string };
      personB: { id: number; code: string; name: string; color: string };
      aOwesB: number; bOwesA: number;
      details: { swapId: number; date: string; shift: string; hours: number; debtor: string }[];
    }>();

    for (const swap of swaps) {
      const key = pairKey(swap.fromPersonId, swap.toPersonId);
      // Horas reales del turno cubierto (un finde son 12h, no 8).
      const swapHours = swapDebtHours(swap as DebtSwap, hoursByLabel);
      if (!pairMap.has(key)) {
        const isOrdered = swap.fromPersonId < swap.toPersonId;
        pairMap.set(key, {
          personA: isOrdered ? swap.fromPerson : swap.toPerson,
          personB: isOrdered ? swap.toPerson : swap.fromPerson,
          aOwesB: 0, bOwesA: 0, details: [],
        });
      }
      const entry = pairMap.get(key)!;
      if (swap.fromPersonId === entry.personA.id) entry.aOwesB += swapHours;
      else entry.bOwesA += swapHours;
      entry.details.push({
        swapId: swap.id, date: swap.fromDate, shift: swap.fromShiftLabel,
        hours: swapHours, debtor: swap.fromPerson.name,
      });
    }

    const debts = Array.from(pairMap.values()).map((p) => ({
      personA: p.personA, personB: p.personB,
      aOwesB: p.aOwesB, bOwesA: p.bOwesA,
      net: p.aOwesB - p.bOwesA,
      details: p.details,
    }));

    return NextResponse.json({ debts, totalUnsettled: swaps.length });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/swaps/debts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
