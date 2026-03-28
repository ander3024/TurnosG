import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/swaps — list all swap requests with pagination and filters
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status");

    const where: Record<string, any> = {};
    if (status && status !== "todos") {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      prisma.swapRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser: { select: { id: true, name: true, email: true } },
          fromPerson: { select: { id: true, code: true, name: true, color: true } },
          toPerson: { select: { id: true, code: true, name: true, color: true } },
        },
      }),
      prisma.swapRequest.count({ where }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/swaps error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
