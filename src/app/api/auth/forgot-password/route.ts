import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { ok: true, message: "Si el email existe, recibirás un enlace de recuperación" }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.passwordResetToken.create({
        data: {
          token,
          userId: user.id,
          expiresAt,
        },
      });

      const resetUrl = `https://beta.elganso.world/reset-password?token=${token}`;

      try {
        await sendPasswordResetEmail(user, resetUrl);
      } catch (err) {
        console.error("Error sending password reset email:", err);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Si el email existe, recibirás un enlace de recuperación",
    });
  } catch (error) {
    console.error("POST /api/auth/forgot-password error:", error);
    return NextResponse.json({
      ok: true,
      message: "Si el email existe, recibirás un enlace de recuperación",
    });
  }
}
