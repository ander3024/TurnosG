/**
 * Migra los overrides del sistema antiguo (JSON blob) a la tabla Override.
 * Uso: npx tsx scripts/migrate-overrides.ts
 */
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

const OLD_DB_PATH = "/opt/turnos-api/turnos.db";
const prisma = new PrismaClient();

// Map old shift key patterns to new shift type codes
function mapShiftKey(key: string): { code: string; slotIndex: number } | null {
  const lower = key.toLowerCase();

  // Exact matches first
  if (lower.includes("refuerzo tarde")) {
    const match = key.match(/(\d+)$/);
    return { code: "refuerzo_afternoon", slotIndex: match ? parseInt(match[1]) : 1 };
  }
  if (lower.includes("refuerzo mañana") || lower.includes("refuerzo manana")) {
    const match = key.match(/(\d+)$/);
    return { code: "refuerzo_morning", slotIndex: match ? parseInt(match[1]) : 1 };
  }
  if (lower.includes("refuerzo (ofi)") || lower.includes("refuerzo (ofi)")) {
    const match = key.match(/(\d+)$/);
    return { code: "refuerzo_ofi", slotIndex: match ? parseInt(match[1]) : 1 };
  }
  if (lower.includes("refuerzo")) {
    const match = key.match(/(\d+)$/);
    return { code: "refuerzo_ofi", slotIndex: match ? parseInt(match[1]) : 1 };
  }
  if (lower.includes("mañana") || lower.includes("manana")) {
    return { code: "morning", slotIndex: 0 };
  }
  if (lower.includes("tarde")) {
    return { code: "afternoon", slotIndex: 0 };
  }
  if (lower.includes("finde")) {
    const match = key.match(/(\d+)$/);
    return { code: "weekend", slotIndex: match ? parseInt(match[1]) : 0 };
  }

  console.log(`  ⚠️ Unknown shift key: ${key}`);
  return null;
}

async function main() {
  console.log("🔄 Migrando overrides del sistema antiguo...\n");

  // Read old data
  const oldDb = new Database(OLD_DB_PATH, { readonly: true });
  const stateRow = oldDb
    .prepare("SELECT payload FROM states WHERE id = 'turnos-2025'")
    .get() as { payload: string } | undefined;

  if (!stateRow) {
    console.error("❌ No se encontró el state");
    process.exit(1);
  }

  const data = JSON.parse(stateRow.payload);
  const overrides = data.overrides || {};
  oldDb.close();

  // Load shift types and people from new DB
  const shiftTypes = await prisma.shiftType.findMany();
  const people = await prisma.person.findMany();

  const stMap = new Map(shiftTypes.map((s) => [s.code, s.id]));
  const pMap = new Map(people.map((p) => [p.code, p.id]));

  console.log(`📦 ${Object.keys(overrides).length} días con overrides\n`);

  let created = 0;
  let skipped = 0;

  for (const [date, slots] of Object.entries(overrides)) {
    const slotsObj = slots as Record<string, string>;

    for (const [shiftKey, personCode] of Object.entries(slotsObj)) {
      const mapped = mapShiftKey(shiftKey);
      if (!mapped) {
        skipped++;
        continue;
      }

      const shiftTypeId = stMap.get(mapped.code);
      if (!shiftTypeId) {
        console.log(`  ⚠️ Shift type not found: ${mapped.code} for key ${shiftKey}`);
        skipped++;
        continue;
      }

      // __EMPTY__ means explicitly empty slot
      const personId =
        personCode === "__EMPTY__" ? null : pMap.get(personCode) || null;

      if (personCode !== "__EMPTY__" && !personId) {
        console.log(`  ⚠️ Person not found: ${personCode}`);
        skipped++;
        continue;
      }

      try {
        await prisma.override.upsert({
          where: {
            date_shiftTypeId_slotIndex: {
              date,
              shiftTypeId,
              slotIndex: mapped.slotIndex,
            },
          },
          update: { personId },
          create: {
            date,
            shiftTypeId,
            personId,
            slotIndex: mapped.slotIndex,
          },
        });
        created++;
      } catch (e: any) {
        console.log(`  ⚠️ Error on ${date}/${shiftKey}: ${e.message}`);
        skipped++;
      }
    }
  }

  console.log(`\n✅ Migración completada:`);
  console.log(`   ${created} overrides creados`);
  console.log(`   ${skipped} omitidos`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
