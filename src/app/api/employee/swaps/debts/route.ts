import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/employee/swaps/debts — get debt balances for current user
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const person = await prisma.person.findFirst({ where: { userId: user.id } });
    if (!person) return NextResponse.json({ debts: [] });

    // Find all approved one-way/partial swaps involving this person that are NOT settled
    const unsettled = await prisma.swapRequest.findMany({
      where: {
        settled: false,
        status: "aprobado",
        OR: [
          { fromPersonId: person.id, isOneWay: true },
          { toPersonId: person.id, isOneWay: true },
          { fromPersonId: person.id, hours: { not: null } },
          { toPersonId: person.id, hours: { not: null } },
        ],
      },
      include: {
        fromPerson: { select: { id: true, code: true, name: true, color: true } },
        toPerson: { select: { id: true, code: true, name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build balances in HOURS
    // Full shift (hours=null) = 8h default, partial = actual hours
    const balanceMap = new Map<number, {
      person: { id: number; code: string; name: string; color: string };
      iOweHours: number; theyOweHours: number;
      details: { date: string; shift: string; hours: number; direction: "iOwe" | "theyOwe"; isPartial: boolean }[];
    }>();

    for (const swap of unsettled) {
      const otherPersonId = swap.fromPersonId === person.id ? swap.toPersonId : swap.fromPersonId;
      const otherPerson = swap.fromPersonId === person.id ? swap.toPerson : swap.fromPerson;
      const swapHours = swap.hours ?? 8; // full shift = 8h

      if (!balanceMap.has(otherPersonId)) {
        balanceMap.set(otherPersonId, { person: otherPerson, iOweHours: 0, theyOweHours: 0, details: [] });
      }
      const entry = balanceMap.get(otherPersonId)!;
      const isPartial = swap.hours !== null;

      if (swap.fromPersonId === person.id) {
        entry.iOweHours += swapHours;
        entry.details.push({ date: swap.fromDate, shift: swap.fromShiftLabel, hours: swapHours, direction: "iOwe", isPartial });
      } else {
        entry.theyOweHours += swapHours;
        entry.details.push({ date: swap.fromDate, shift: swap.fromShiftLabel, hours: swapHours, direction: "theyOwe", isPartial });
      }
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
