import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { previewOverride } from "@/lib/schedule-state";

/**
 * Simula un cambio de turno y devuelve lo que pasaría: qué se mueve ese día,
 * cuántas horas gana o pierde cada uno en el año y qué otros días reordena el
 * motor. No escribe nada en la base de datos.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { action, date, shiftTypeId, slotIndex, personId } = body;

    if (!date || !shiftTypeId) {
      return NextResponse.json({ error: "date and shiftTypeId are required" }, { status: 400 });
    }
    if (action !== "set" && action !== "remove") {
      return NextResponse.json({ error: "action must be 'set' or 'remove'" }, { status: 400 });
    }

    const preview = await previewOverride({
      action,
      date,
      shiftTypeId: Number(shiftTypeId),
      slotIndex: Number(slotIndex ?? 0),
      personId: personId ?? null,
    });

    return NextResponse.json(preview);
  } catch (error: any) {
    if (error.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("POST /api/admin/schedule/preview error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
