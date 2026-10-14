import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadEngineContextForRange, generateScheduleSlice } from "@/lib/engine";
import { summarizeHours } from "@/lib/schedule-state";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params required" },
        { status: 400 }
      );
    }

    const ctx = await loadEngineContextForRange(from, to);
    const schedule = generateScheduleSlice(ctx, from, to);

    // Misma funcion que usan el guardado y la simulacion: un solo calculo de
    // horas para todas las pantallas.
    const hours = summarizeHours(ctx, schedule);

    return NextResponse.json({ hours });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/schedule/hours error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
