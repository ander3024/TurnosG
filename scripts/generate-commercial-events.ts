/**
 * Genera las campañas comerciales (Reyes, Rebajas, Black Friday, Navidad...) que
 * falten para un año, a partir de `commercial_events_config`.
 *
 * Uso:
 *   npx tsx scripts/generate-commercial-events.ts          -> el año que viene
 *   npx tsx scripts/generate-commercial-events.ts 2028      -> ese año concreto
 *
 * Sin argumento solo toca años POSTERIORES al actual, nunca el año en curso ni el
 * pasado: las horas del año en curso ya están repartidas y añadir refuerzos a
 * posteriori las descuadraría. Forzar el año en curso exige pasarlo a mano Y --force.
 *
 * Es idempotente: salta una campaña si ya existe un evento con su etiqueta, o si
 * ya hay algún evento con refuerzos que solape sus fechas.
 */
import { PrismaClient } from "@prisma/client";
import { generateCommercialEvents } from "../src/lib/commercial-events";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  const thisYear = new Date().getFullYear();
  const year = arg ? parseInt(arg, 10) : thisYear + 1;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    console.error(`Año no válido: ${arg}`);
    process.exit(1);
  }
  if (!arg && year <= thisYear) {
    console.log(`Nada que hacer: ${year} no es posterior al año actual.`);
    return;
  }
  if (year < thisYear) {
    console.error(`Me niego a generar campañas para ${year}, que ya pasó.`);
    process.exit(1);
  }
  if (year === thisYear && !process.argv.includes("--force")) {
    console.error(
      `${year} es el año en curso y su reparto de horas ya está cerrado: añadir ` +
      `campañas ahora lo descuadraría. Si de verdad lo quieres, añade --force.`
    );
    process.exit(1);
  }

  const row = await prisma.setting.findUnique({ where: { key: "commercial_events_config" } });
  const cfg = row ? JSON.parse(row.value) : undefined;
  const propuestas = generateCommercialEvents(year, cfg);
  if (!propuestas.length) {
    console.log(`No hay campañas activadas en la configuración.`);
    return;
  }

  const existentes = await prisma.event.findMany({
    where: { startDate: { lte: `${year}-12-31` }, endDate: { gte: `${year}-01-01` } },
  });

  let creados = 0;
  for (const p of propuestas) {
    if (existentes.some((e) => e.label === p.name)) {
      console.log(`  = ya existe: ${p.name}`);
      continue;
    }
    const solapa = existentes.find(
      (e) =>
        e.startDate <= p.endDate &&
        e.endDate >= p.startDate &&
        (e.weekdaysExtraSlots > 0 || e.weekendExtraSlots > 0)
    );
    if (solapa) {
      console.log(`  ! salto ${p.name}: "${solapa.label}" ya refuerza esas fechas`);
      continue;
    }
    await prisma.event.create({
      data: {
        label: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        weekdaysExtraSlots: p.weekdaysExtraSlots,
        weekendExtraSlots: p.weekendExtraSlots,
        notes: p.description,
      },
    });
    console.log(
      `  + ${p.name}  ${p.startDate} -> ${p.endDate}  L-J:+${p.weekdaysExtraSlots} S-D:+${p.weekendExtraSlots}`
    );
    creados++;
  }

  if (creados) {
    await prisma.auditLog.create({
      data: {
        action: "create",
        entity: "event",
        entityId: `campanas-${year}`,
        details: JSON.stringify({ year, creados, total: propuestas.length, origen: "generate-commercial-events" }),
      },
    });
  }
  console.log(`\nCampañas ${year}: ${creados} creadas de ${propuestas.length}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
