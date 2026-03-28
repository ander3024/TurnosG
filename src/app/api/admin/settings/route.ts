import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/settings - List all settings
export async function GET() {
  try {
    await requireAdmin();

    const settings = await prisma.setting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(settings);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/admin/settings - Update a setting (upsert by key)
export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();

    const { key, value, label } = body;

    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value are required" }, { status: 400 });
    }

    const setting = await prisma.setting.upsert({
      where: { key },
      update: {
        value: String(value),
        ...(label !== undefined && { label }),
      },
      create: {
        key,
        value: String(value),
        label: label || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        action: "update",
        entity: "setting",
        entityId: String(setting.id),
        details: JSON.stringify({ key, value }),
      },
    });

    return NextResponse.json(setting);
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("PUT /api/admin/settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
