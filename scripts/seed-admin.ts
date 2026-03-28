/**
 * Crea el usuario admin inicial
 * Uso: npx tsx scripts/seed-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: "admin@elganso.com" },
  });

  if (existing) {
    console.log("Admin user already exists");
    return;
  }

  const hash = await bcrypt.hash("admin123", 12);

  const user = await prisma.user.create({
    data: {
      email: "admin@elganso.com",
      name: "Administrador",
      passwordHash: hash,
      role: "admin",
      active: true,
    },
  });

  console.log("Admin user created:", user.email);
  console.log("Password: admin123 (CHANGE THIS!)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
