import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendTestEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    // Optional body with custom email address
    let targetEmail = admin.email;
    try {
      const body = await request.json();
      if (body.email && typeof body.email === "string") {
        targetEmail = body.email;
      }
    } catch {
      // No body or invalid JSON — use admin's email
    }

    await sendTestEmail(targetEmail);

    return NextResponse.json({
      ok: true,
      message: `Email de prueba enviado correctamente a ${targetEmail}`,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("POST /api/admin/email/test error:", error);
    return NextResponse.json(
      { ok: false, error: "Error al enviar email de prueba", message: error.message },
      { status: 500 }
    );
  }
}
