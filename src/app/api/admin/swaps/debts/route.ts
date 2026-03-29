import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/swaps/debts — all unsettled debts between all people
export async function GET() {
  try {
    await requireAdmin();

    const unsettled = await prisma.swapRequest.findMany({
      where: {
        isOneWay: true,
        settled: false,
        status: "aprobado",
      },
      include: {
        fromPerson: { select: { id: true, code: true, name: true, color: true } },
        toPerson: { select: { id: true, code: true, name: true, color: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Build pair balances
    const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const pairMap = new Map<string, {
      personA: { id: number; code: string; name: string; color: string };
      personB: { id: number; code: string; name: string; color: string };
      aOwesB: number;
      bOwesA: number;
      details: { date: string; shift: string; debtor: string; creditor: string; createdAt: Date }[];
    }>();

    for (const swap of unsettled) {
      const key = pairKey(swap.fromPersonId, swap.toPersonId);
      if (!pairMap.has(key)) {
        const isOrdered = swap.fromPersonId < swap.toPersonId;
        pairMap.set(key, {
          personA: isOrdered ? swap.fromPerson : swap.toPerson,
          personB: isOrdered ? swap.toPerson : swap.fromPerson,
          aOwesB: 0, bOwesA: 0, details: [],
        });
      }
      const entry = pairMap.get(key)!;
      // fromPerson owes toPerson (fromPerson asked for coverage)
      if (swap.fromPersonId === entry.personA.id) {
        entry.aOwesB++;
      } else {
        entry.bOwesA++;
      }
      entry.details.push({
        date: swap.fromDate,
        shift: swap.fromShiftLabel,
        debtor: swap.fromPerson.name,
        creditor: swap.toPerson.name,
        createdAt: swap.createdAt,
      });
    }

    const debts = Array.from(pairMap.values()).map((p) => ({
      personA: p.personA,
      personB: p.personB,
      aOwesB: p.aOwesB,
      bOwesA: p.bOwesA,
      net: p.aOwesB - p.bOwesA, // positive = A owes B, negative = B owes A
      details: p.details,
    }));

    return NextResponse.json({ debts, totalUnsettled: unsettled.length });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/swaps/debts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
