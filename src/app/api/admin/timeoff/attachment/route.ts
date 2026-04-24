import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

// GET /api/admin/timeoff/attachment?id=123
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const id = parseInt(req.nextUrl.searchParams.get("id") || "0");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const timeoff = await prisma.timeOffRequest.findUnique({ where: { id } });
    if (!timeoff?.attachmentPath) {
      return NextResponse.json({ error: "No attachment" }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), "uploads", timeoff.attachmentPath);
    const buffer = await readFile(filePath);
    const ext = filePath.split(".").pop()?.toLowerCase() || "";

    const contentTypes: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      pdf: "application/pdf", doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentTypes[ext] || "application/octet-stream",
        "Content-Disposition": `inline; filename="justificante_${id}.${ext}"`,
      },
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("GET /api/admin/timeoff/attachment error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
