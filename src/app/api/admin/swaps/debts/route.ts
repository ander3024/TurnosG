import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();

    const unsettled = await prisma.swapRequest.findMany({
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

    const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const pairMap = new Map<string, {
      personA: { id: number; code: string; name: string; color: string };
      personB: { id: number; code: string; name: string; color: string };
      aOwesB: number; bOwesA: number;
    }>();

    for (const swap of unsettled) {
      const key = pairKey(swap.fromPersonId, swap.toPersonId);
      const swapHours = swap.hours ?? 8;
      if (!pairMap.has(key)) {
        const isOrdered = swap.fromPersonId < swap.toPersonId;
        pairMap.set(key, {
          personA: isOrdered ? swap.fromPerson : swap.toPerson,
          personB: isOrdered ? swap.toPerson : swap.fromPerson,
          aOwesB: 0, bOwesA: 0,
        });
      }
      const entry = pairMap.get(key)!;
      if (swap.fromPersonId === entry.personA.id) {
        entry.aOwesB += swapHours;
      } else {
        entry.bOwesA += swapHours;
      }
    }

    const debts = Array.from(pairMap.values()).map((p) => ({
      personA: p.personA, personB: p.personB,
      aOwesB: p.aOwesB, bOwesA: p.bOwesA,
      net: p.aOwesB - p.bOwesA,
    }));

    return NextResponse.json({ debts, totalUnsettled: unsettled.length });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
