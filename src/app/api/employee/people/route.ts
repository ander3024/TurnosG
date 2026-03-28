import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/employee/people - List all active people (for swaps, calendar, etc.)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const people = await prisma.person.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true, color: true },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(people);
}
