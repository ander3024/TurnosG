import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadEngineContext, generateSchedule } from "@/lib/engine";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to query params required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const ctx = await loadEngineContext(from, to);
    const schedule = generateSchedule(ctx, from, to);

    return NextResponse.json({ schedule, settings: ctx.settings });
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/schedule error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
