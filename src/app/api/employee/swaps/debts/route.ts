import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadOpenDebts, swapDebtHours, type DebtSwap } from "@/lib/swap-debts";

// GET /api/employee/swaps/debts — saldo de horas del usuario con cada compañero
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const person = await prisma.person.findFirst({ where: { userId: user.id } });
    if (!person) return NextResponse.json({ debts: [] });

    const { swaps, hoursByLabel } = await loadOpenDebts(person.id);

    const balanceMap = new Map<number, {
      person: { id: number; code: string; name: string; color: string };
      iOweHours: number; theyOweHours: number;
      details: { date: string; shift: string; hours: number; direction: "iOwe" | "theyOwe"; isPartial: boolean }[];
    }>();

    for (const swap of swaps) {
      const otherPersonId = swap.fromPersonId === person.id ? swap.toPersonId : swap.fromPersonId;
      const otherPerson = swap.fromPersonId === person.id ? swap.toPerson : swap.fromPerson;
      // Horas reales del turno cubierto (un finde son 12h, no 8).
      const swapHours = swapDebtHours(swap as DebtSwap, hoursByLabel);

      if (!balanceMap.has(otherPersonId)) {
        balanceMap.set(otherPersonId, { person: otherPerson, iOweHours: 0, theyOweHours: 0, details: [] });
      }
      const entry = balanceMap.get(otherPersonId)!;
      const isPartial = swap.hours !== null;
      const direction = swap.fromPersonId === person.id ? "iOwe" : "theyOwe";

      if (direction === "iOwe") entry.iOweHours += swapHours;
      else entry.theyOweHours += swapHours;
      entry.details.push({ date: swap.fromDate, shift: swap.fromShiftLabel, hours: swapHours, direction, isPartial });
    }

    const debts = Array.from(balanceMap.values()).map((b) => ({
      person: b.person,
      iOweHours: b.iOweHours,
      theyOweHours: b.theyOweHours,
      netHours: b.theyOweHours - b.iOweHours,
      details: b.details,
    }));

    return NextResponse.json({ debts });
  } catch (error: any) {
    console.error("GET /api/employee/swaps/debts error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
