import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// POST /api/employee/timeoff/sick — report sick leave with optional attachment
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const person = await prisma.person.findFirst({ where: { userId: user.id } });
    if (!person) return NextResponse.json({ error: "No tienes perfil de empleado" }, { status: 400 });

    const formData = await req.formData();
    const startDate = formData.get("startDate") as string;
    const endDate = formData.get("endDate") as string;
    const note = formData.get("note") as string | null;
    const file = formData.get("file") as File | null;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Fecha inicio y fin son obligatorias" }, { status: 400 });
    }

    // Save attachment if provided
    let attachmentPath: string | null = null;
    if (file && file.size > 0) {
      const uploadDir = path.join(process.cwd(), "uploads", "medical");
      await mkdir(uploadDir, { recursive: true });

      const ext = file.name.split(".").pop() || "bin";
      const filename = `${person.code}_${Date.now()}.${ext}`;
      const filePath = path.join(uploadDir, filename);

      const bytes = await file.arrayBuffer();
      await writeFile(filePath, Buffer.from(bytes));
      attachmentPath = `medical/${filename}`;
    }

    // Create sick leave — auto-approved (no admin approval needed)
    const request = await prisma.timeOffRequest.create({
      data: {
        personId: person.id,
        requesterId: user.id,
        type: "enfermedad",
        startDate,
        endDate,
        note: note || null,
        attachmentPath,
        status: "aprobada", // sick leave is auto-approved
        reviewedAt: new Date(),
        reviewedBy: "Auto (baja médica)",
      },
    });

    // Notify admins
    try {
      const { notify } = await import("@/lib/notifications");
      const admins = await prisma.user.findMany({ where: { role: "admin", active: true }, select: { id: true } });
      await notify({
        eventType: "timeoff_requested",
        recipientUserIds: admins.map(a => a.id),
        title: "Baja médica reportada",
        message: `${person.name} ha reportado baja médica del ${startDate} al ${endDate}.${attachmentPath ? " Justificante adjunto." : ""}`,
        link: "/admin/timeoff",
        type: "warning",
      });
    } catch {}

    return NextResponse.json({ request }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/employee/timeoff/sick error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
