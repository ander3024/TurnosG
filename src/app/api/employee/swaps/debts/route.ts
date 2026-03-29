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

    // Find all approved one-way swaps involving this person that are NOT settled
    const unsettled = await prisma.swapRequest.findMany({
      where: {
        isOneWay: true,
        settled: false,
        status: "aprobado",
        OR: [{ fromPersonId: person.id }, { toPersonId: person.id }],
      },
      include: {
        fromPerson: { select: { id: true, code: true, name: true, color: true } },
        toPerson: { select: { id: true, code: true, name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build balances: who owes me vs who I owe
    // fromPerson requested → toPerson covered → fromPerson owes toPerson
    const balanceMap = new Map<number, { person: { id: number; code: string; name: string; color: string }; iOwe: number; theyOwe: number; details: { date: string; shift: string; createdAt: Date; direction: "iOwe" | "theyOwe" }[] }>();

    for (const swap of unsettled) {
      const otherPersonId = swap.fromPersonId === person.id ? swap.toPersonId : swap.fromPersonId;
      const otherPerson = swap.fromPersonId === person.id ? swap.toPerson : swap.fromPerson;

      if (!balanceMap.has(otherPersonId)) {
        balanceMap.set(otherPersonId, { person: otherPerson, iOwe: 0, theyOwe: 0, details: [] });
      }
      const entry = balanceMap.get(otherPersonId)!;

      if (swap.fromPersonId === person.id) {
        // I requested, they covered → I owe them
        entry.iOwe++;
        entry.details.push({ date: swap.fromDate, shift: swap.fromShiftLabel, createdAt: swap.createdAt, direction: "iOwe" });
      } else {
        // They requested, I covered → they owe me
        entry.theyOwe++;
        entry.details.push({ date: swap.fromDate, shift: swap.fromShiftLabel, createdAt: swap.createdAt, direction: "theyOwe" });
      }
    }

    const debts = Array.from(balanceMap.values()).map((b) => ({
      person: b.person,
      iOwe: b.iOwe,
      theyOwe: b.theyOwe,
      net: b.theyOwe - b.iOwe, // positive = they owe me, negative = I owe them
      details: b.details,
    }));

    return NextResponse.json({ debts });
  } catch (error: any) {
    console.error("GET /api/employee/swaps/debts error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
