/**
 * Script de migración: Importa datos del JSON blob de omega.elganso.world
 * a la nueva base de datos normalizada de beta.elganso.world
 *
 * Uso: npx tsx scripts/migrate-data.ts
 */
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const OLD_DB_PATH = "/opt/turnos-api/turnos.db";
const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Iniciando migración de datos...\n");

  // 1. Leer datos del JSON blob antiguo
  const oldDb = new Database(OLD_DB_PATH, { readonly: true });
  const stateRow = oldDb.prepare("SELECT payload FROM states WHERE id = 'turnos-2025'").get() as { payload: string } | undefined;
  const oldUsers = oldDb.prepare("SELECT * FROM users").all() as {
    id: number; email: string; name: string; password_hash: string; role: string; created_at: number;
  }[];

  if (!stateRow) {
    console.error("❌ No se encontró el state 'turnos-2025'");
    process.exit(1);
  }

  const data = JSON.parse(stateRow.payload);
  console.log("📦 Datos leídos del sistema antiguo:");
  console.log(`   - ${data.people?.length || 0} personas`);
  console.log(`   - ${data.events?.length || 0} eventos`);
  console.log(`   - ${data.timeOffs?.length || 0} solicitudes de vacaciones`);
  console.log(`   - ${Object.keys(data.overrides || {}).length} días con overrides`);
  console.log(`   - ${data.extraHours?.length || 0} registros de horas extra`);
  console.log(`   - ${oldUsers.length} usuarios`);
  console.log();

  // 2. Migrar usuarios
  console.log("👤 Migrando usuarios...");
  const userMap = new Map<string, number>(); // email -> new id
  for (const u of oldUsers) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      userMap.set(u.email, existing.id);
      continue;
    }
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash: u.password_hash,
        role: u.role,
        active: true,
        createdAt: new Date(u.created_at * 1000),
      },
    });
    userMap.set(u.email, user.id);
    console.log(`   ✅ ${u.name} (${u.email}) -> id ${user.id}`);
  }

  // 3. Migrar personas (empleados)
  console.log("\n👥 Migrando personas...");
  const personMap = new Map<string, number>(); // old code -> new id
  const personEmailMap: Record<string, string> = {
    P1: "heinsrodriguez@elganso.com",
    P2: "migueljimenez@elganso.com",
    P3: "eduardocentron@elganso.com",
    P4: "mariogarzon@elganso.com",
  };

  for (const p of data.people || []) {
    const existing = await prisma.person.findUnique({ where: { code: p.id } });
    if (existing) {
      personMap.set(p.id, existing.id);
      continue;
    }
    const linkedEmail = personEmailMap[p.id];
    const linkedUserId = linkedEmail ? userMap.get(linkedEmail) : undefined;

    const person = await prisma.person.create({
      data: {
        code: p.id,
        name: p.name,
        color: p.color || "#3b82f6",
        offset: p.offset || 0,
        active: true,
        userId: linkedUserId || null,
      },
    });
    personMap.set(p.id, person.id);
    console.log(`   ✅ ${p.id} - ${p.name} (color: ${p.color})`);
  }

  // 4. Migrar tipos de turno
  console.log("\n⏰ Migrando tipos de turno...");
  const shiftTypes = [
    { code: "morning", label: "Mañana", startTime: "08:00", endTime: "17:30", lunchMinutes: 90, category: "regular" },
    { code: "afternoon", label: "Tarde", startTime: "14:00", endTime: "22:00", lunchMinutes: 0, category: "regular" },
    { code: "weekend", label: "Finde", startTime: "10:00", endTime: "22:00", lunchMinutes: 0, category: "weekend" },
    { code: "refuerzo_ofi", label: "Refuerzo (OFI)", startTime: "08:00", endTime: "17:30", lunchMinutes: 90, category: "refuerzo" },
    { code: "refuerzo_morning", label: "Refuerzo Mañana", startTime: "08:00", endTime: "17:30", lunchMinutes: 90, category: "refuerzo" },
    { code: "refuerzo_afternoon", label: "Refuerzo Tarde", startTime: "14:00", endTime: "22:00", lunchMinutes: 0, category: "refuerzo" },
  ];

  const shiftTypeMap = new Map<string, number>();
  for (const st of shiftTypes) {
    const existing = await prisma.shiftType.findUnique({ where: { code: st.code } });
    if (existing) {
      shiftTypeMap.set(st.code, existing.id);
      continue;
    }
    const created = await prisma.shiftType.create({ data: st });
    shiftTypeMap.set(st.code, created.id);
    console.log(`   ✅ ${st.label} (${st.startTime}-${st.endTime})`);
  }

  // 5. Migrar eventos
  console.log("\n🎉 Migrando eventos...");
  let eventsCreated = 0;
  for (const e of data.events || []) {
    await prisma.event.create({
      data: {
        label: e.label,
        startDate: e.start,
        endDate: e.end,
        weekdaysExtraSlots: e.weekdaysExtraSlots || 0,
        weekendExtraSlots: e.weekendExtraSlots || 0,
        assigneePersonId: e.assigneeId ? (personMap.get(e.assigneeId) || null) : null,
        assigneeForced: e.assigneeForced || false,
        weekdayRefuerzo: e.weekdayRefuerzo || null,
      },
    });
    eventsCreated++;
  }
  console.log(`   ✅ ${eventsCreated} eventos migrados`);

  // 6. Migrar solicitudes de vacaciones
  console.log("\n🏖️  Migrando solicitudes de vacaciones...");
  let timeOffsCreated = 0;
  const adminUserId = userMap.get("andres@careucom.com") || 1;
  for (const t of data.timeOffs || []) {
    const personId = personMap.get(t.personId);
    if (!personId) {
      console.log(`   ⚠️ Persona ${t.personId} no encontrada, saltando...`);
      continue;
    }
    const requesterId = t.requestedBy ? (userMap.get(t.requestedBy) || adminUserId) : adminUserId;

    await prisma.timeOffRequest.create({
      data: {
        personId,
        requesterId,
        type: t.type || "vacaciones",
        startDate: t.start,
        endDate: t.end,
        hoursPerDay: t.hoursPerDay || 8,
        status: t.status || "pendiente",
        note: t.note || null,
        createdAt: t.requestedAt ? new Date(t.requestedAt) : new Date(),
      },
    });
    timeOffsCreated++;
  }
  console.log(`   ✅ ${timeOffsCreated} solicitudes migradas`);

  // 7. Migrar festivos
  console.log("\n📅 Migrando festivos...");
  let holidaysCreated = 0;
  for (const [year, dates] of Object.entries(data.customHolidaysByYear || {})) {
    for (const date of dates as string[]) {
      try {
        await prisma.holiday.create({
          data: {
            date,
            year: parseInt(year),
            province: "Madrid",
            type: "official",
          },
        });
        holidaysCreated++;
      } catch {
        // duplicate
      }
    }
  }
  // Working holidays
  for (const date of data.workingHolidays || []) {
    try {
      await prisma.holiday.create({
        data: {
          date,
          year: parseInt(date.substring(0, 4)),
          province: "Madrid",
          type: "working",
          label: "Festivo laborable",
        },
      });
      holidaysCreated++;
    } catch {
      // duplicate
    }
  }
  console.log(`   ✅ ${holidaysCreated} festivos migrados`);

  // 8. Migrar horas extra
  console.log("\n⏱️  Migrando horas extra...");
  let extraCreated = 0;
  for (const eh of data.extraHours || []) {
    const personId = personMap.get(eh.personId);
    const actorId = eh.actor ? (userMap.get(eh.actor) || adminUserId) : adminUserId;
    if (!personId) continue;

    await prisma.extraHours.create({
      data: {
        personId,
        actorId,
        date: eh.dateStr,
        hours: eh.hours,
        comment: eh.comment || null,
        createdAt: eh.ts ? new Date(eh.ts) : new Date(),
      },
    });
    extraCreated++;
  }
  console.log(`   ✅ ${extraCreated} registros de horas extra migrados`);

  // 9. Migrar configuración
  console.log("\n⚙️  Migrando configuración...");
  const settingsToMigrate: { key: string; value: string; label: string }[] = [
    { key: "annualTargetHours", value: String(data.annualTargetHours || 1784), label: "Objetivo anual de horas" },
    { key: "vacationDaysNatural", value: String(data.vacationDaysNatural || 23), label: "Días de vacaciones naturales" },
    { key: "travelDefaultHours", value: String(data.travelDefaultHours || 8), label: "Horas por defecto de viaje" },
    { key: "province", value: data.province || "Madrid", label: "Provincia" },
    { key: "startDate", value: data.startDate || "2026-01-05", label: "Fecha de inicio del calendario" },
    { key: "weeks", value: String(data.weeks || 52), label: "Semanas en el calendario" },
    { key: "rebalance", value: String(data.rebalance ?? true), label: "Rebalanceo automático" },
    { key: "consumeVacationOnHoliday", value: String(data.consumeVacationOnHoliday ?? false), label: "Consumir vacaciones en festivos" },
    { key: "closeOnHolidays", value: String(data.closeOnHolidays ?? true), label: "Cerrado en festivos" },
    { key: "applyConciliation", value: String(data.applyConciliation ?? false), label: "Aplicar conciliación" },
    { key: "rules", value: JSON.stringify(data.rules || {}), label: "Reglas de turnos" },
    { key: "conciliacion", value: JSON.stringify(data.conciliacion || {}), label: "Configuración de conciliación" },
    { key: "offPolicy", value: JSON.stringify(data.offPolicy || {}), label: "Política de días libres" },
    { key: "vacationPolicy", value: JSON.stringify(data.vacationPolicy || {}), label: "Política de vacaciones" },
    { key: "refuerzoPolicy", value: JSON.stringify(data.refuerzoPolicy || {}), label: "Política de refuerzos" },
  ];

  for (const s of settingsToMigrate) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value, label: s.label },
      create: s,
    });
  }
  console.log(`   ✅ ${settingsToMigrate.length} configuraciones migradas`);

  // 10. Log de auditoría
  await prisma.auditLog.create({
    data: {
      actorId: adminUserId,
      action: "migrate",
      entity: "system",
      details: JSON.stringify({
        source: "omega.elganso.world",
        users: oldUsers.length,
        people: (data.people || []).length,
        events: eventsCreated,
        timeOffs: timeOffsCreated,
        holidays: holidaysCreated,
        extraHours: extraCreated,
      }),
    },
  });

  console.log("\n✅ Migración completada con éxito!");
  console.log("   Los datos de omega.elganso.world han sido importados a beta.elganso.world");

  oldDb.close();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error en la migración:", e);
  process.exit(1);
});
