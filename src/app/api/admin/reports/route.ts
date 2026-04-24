import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadEngineContext, generateSchedule } from "@/lib/engine";
import ExcelJS from "exceljs";

const MONTH_NAMES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

function getDow(date: string) {
  const d = new Date(date + "T12:00:00Z");
  const dow = d.getUTCDay();
  return dow === 0 ? 6 : dow - 1; // 0=Mon, 6=Sun
}

// GET /api/admin/reports?type=horarios|vacaciones&year=2026
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "horarios";
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const from = `${year}-01-01`;
    const to = `${year}-12-31`;

    const people = await prisma.person.findMany({ where: { active: true }, orderBy: { code: "asc" } });
    const holidays = await prisma.holiday.findMany({ where: { year } });
    const holidayMap = new Map(holidays.map(h => [h.date, h]));

    const ctx = await loadEngineContext(from, to);
    const schedule = generateSchedule(ctx, from, to);
    const scheduleMap = new Map(schedule.map(d => [d.date, d]));

    const wb = new ExcelJS.Workbook();

    if (type === "vacaciones") {
      await buildVacacionesReport(wb, year, people, scheduleMap, holidayMap, ctx);
    } else {
      await buildHorariosReport(wb, year, people, scheduleMap, holidayMap, ctx);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const uint8 = new Uint8Array(buffer as ArrayBuffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${type === "vacaciones" ? "Control_Vacaciones" : "Horarios_Soporte"}_${year}.xlsx"`,
      },
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    console.error("GET /api/admin/reports error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
// INFORME 1: CALENDARIO VACACIONES (like the Excel)
// ═══════════════════════════════════════════════════════════════
async function buildVacacionesReport(
  wb: ExcelJS.Workbook, year: number, people: any[],
  scheduleMap: Map<string, any>, holidayMap: Map<string, any>, ctx: any
) {
  const ws = wb.addWorksheet(`Vacaciones ${year}`);

  // Header rows
  ws.mergeCells("B4:D4");
  ws.getCell("B4").value = `CONTROL DE VACACIONES ${year}`;
  ws.getCell("B4").font = { bold: true, size: 14 };

  // For each month, create columns
  let col = 6; // start column for dates (F)
  const monthStartCols: number[] = [];

  for (let m = 0; m < 12; m++) {
    monthStartCols.push(col);
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    // Month name header (row 4)
    ws.getCell(4, col).value = MONTH_NAMES[m];
    ws.getCell(4, col).font = { bold: true, size: 11 };

    // Day numbers (row 5)
    for (let d = 1; d <= daysInMonth; d++) {
      const c = col + d - 1;
      ws.getColumn(c).width = 3.5;
      ws.getCell(5, c).value = d;
      ws.getCell(5, c).font = { size: 8 };
      ws.getCell(5, c).alignment = { horizontal: "center" };

      // Day letter (row 6)
      const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = getDow(dateStr);
      ws.getCell(6, c).value = DAY_LETTERS[dow];
      ws.getCell(6, c).font = { size: 7, color: { argb: dow >= 5 ? "FFFF6600" : "FF666666" } };
      ws.getCell(6, c).alignment = { horizontal: "center" };

      // Color weekends
      if (dow >= 5) {
        for (let r = 5; r <= 6 + people.length; r++) {
          ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0F0" } };
        }
      }

      // Color holidays
      if (holidayMap.has(dateStr)) {
        for (let r = 5; r <= 6 + people.length; r++) {
          ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
        }
      }
    }
    col += daysInMonth + 1; // +1 gap between months
  }

  // Row headers
  ws.getCell(6, 2).value = "TRABAJADOR";
  ws.getCell(6, 2).font = { bold: true, size: 9 };
  ws.getCell(6, 4).value = "ÁREA / DEPARTAMENTO";
  ws.getCell(6, 4).font = { bold: true, size: 9 };
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 3;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 2;

  // People rows
  for (let pi = 0; pi < people.length; pi++) {
    const person = people[pi];
    const row = 8 + pi;

    ws.getCell(row, 2).value = person.name;
    ws.getCell(row, 2).font = { size: 9 };
    ws.getCell(row, 4).value = "SISTEMAS";
    ws.getCell(row, 4).font = { size: 8, color: { argb: "FF888888" } };

    // Fill vacation days
    col = 6;
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const day = scheduleMap.get(dateStr);
        const c = col + d - 1;

        if (day) {
          const timeOff = day.timeOffs.find((t: any) => t.personId === person.id);
          if (timeOff) {
            const cell = ws.getCell(row, c);
            if (timeOff.type === "vacaciones") {
              cell.value = "V";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } }; // green
            } else if (timeOff.type === "enfermedad") {
              cell.value = "B";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF9999" } }; // red
            } else if (timeOff.type === "asuntos_propios") {
              cell.value = "AP";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCC00" } }; // yellow
            } else if (timeOff.type === "intercambio") {
              cell.value = "I";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF99CCFF" } }; // blue
            } else {
              cell.value = "A";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
            }
            cell.font = { size: 7, bold: true };
            cell.alignment = { horizontal: "center" };
          }

          // Mark holidays with "F"
          if (holidayMap.has(dateStr) && !day.timeOffs.find((t: any) => t.personId === person.id)) {
            const cell = ws.getCell(row, c);
            cell.value = "F";
            cell.font = { size: 7, color: { argb: "FFCC0000" } };
            cell.alignment = { horizontal: "center" };
          }
        }
      }
      col += daysInMonth + 1;
    }
  }

  // Summary row
  const summaryRow = 8 + people.length + 1;
  ws.getCell(summaryRow, 2).value = "RESUMEN";
  ws.getCell(summaryRow, 2).font = { bold: true, size: 10 };

  const summaryStartRow = summaryRow + 1;
  ws.getCell(summaryStartRow, 2).value = "Empleado";
  ws.getCell(summaryStartRow, 3).value = "";
  ws.getCell(summaryStartRow, 4).value = "Usados";
  ws.getCell(summaryStartRow, 5).value = "";
  ws.getCell(summaryStartRow, 6).value = "Límite";
  ws.getCell(summaryStartRow, 7).value = "";
  ws.getCell(summaryStartRow, 8).value = "Disponibles";
  for (let c = 2; c <= 8; c++) {
    ws.getCell(summaryStartRow, c).font = { bold: true, size: 9 };
  }

  const vacLimit = parseInt((await prisma.setting.findFirst({ where: { key: "vacationDaysNatural" } }))?.value || "23");
  const holidayDates = new Set(Array.from(holidayMap.keys()));

  for (let pi = 0; pi < people.length; pi++) {
    const person = people[pi];
    const r = summaryStartRow + 1 + pi;
    let usedDays = 0;
    const timeoffs = ctx.timeOffs.filter((t: any) => t.personId === person.id && t.type === "vacaciones");
    for (const t of timeoffs) {
      const s = new Date(t.startDate + "T12:00:00Z");
      const e = new Date(t.endDate + "T12:00:00Z");
      const d = new Date(s);
      while (d <= e) {
        if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayDates.has(d.toISOString().slice(0, 10))) usedDays++;
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }

    ws.getCell(r, 2).value = person.name;
    ws.getCell(r, 4).value = usedDays;
    ws.getCell(r, 6).value = vacLimit;
    ws.getCell(r, 8).value = vacLimit - usedDays;
    ws.getCell(r, 8).font = { bold: true, color: { argb: usedDays > vacLimit ? "FFFF0000" : "FF008800" } };
  }

  // Legend
  const legendRow = summaryStartRow + people.length + 2;
  const legend = [
    { code: "V", label: "Vacaciones", color: "FF92D050" },
    { code: "B", label: "Baja médica", color: "FFFF9999" },
    { code: "AP", label: "Asuntos propios", color: "FFFFCC00" },
    { code: "I", label: "Intercambio", color: "FF99CCFF" },
    { code: "F", label: "Festivo", color: "FFFFCCCC" },
  ];
  ws.getCell(legendRow, 2).value = "Leyenda:";
  ws.getCell(legendRow, 2).font = { bold: true, size: 9 };
  for (let i = 0; i < legend.length; i++) {
    const r = legendRow + 1 + i;
    ws.getCell(r, 2).value = legend[i].code;
    ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: legend[i].color } };
    ws.getCell(r, 2).font = { bold: true, size: 8 };
    ws.getCell(r, 2).alignment = { horizontal: "center" };
    ws.getCell(r, 3).value = "";
    ws.getCell(r, 4).value = legend[i].label;
    ws.getCell(r, 4).font = { size: 8 };
  }
}

// ═══════════════════════════════════════════════════════════════
// INFORME 2: HORARIOS SOPORTE (shift schedule per day)
// ═══════════════════════════════════════════════════════════════
async function buildHorariosReport(
  wb: ExcelJS.Workbook, year: number, people: any[],
  scheduleMap: Map<string, any>, holidayMap: Map<string, any>, ctx: any
) {
  const ws = wb.addWorksheet(`Horarios ${year}`);

  ws.mergeCells("B4:D4");
  ws.getCell("B4").value = `CALENDARIO TURNOS SOPORTE ${year}`;
  ws.getCell("B4").font = { bold: true, size: 14 };

  let col = 6;
  const monthStartCols: number[] = [];

  for (let m = 0; m < 12; m++) {
    monthStartCols.push(col);
    const daysInMonth = new Date(year, m + 1, 0).getDate();

    ws.getCell(4, col).value = MONTH_NAMES[m];
    ws.getCell(4, col).font = { bold: true, size: 11 };

    for (let d = 1; d <= daysInMonth; d++) {
      const c = col + d - 1;
      ws.getColumn(c).width = 3.5;

      const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = getDow(dateStr);

      ws.getCell(5, c).value = d;
      ws.getCell(5, c).font = { size: 8 };
      ws.getCell(5, c).alignment = { horizontal: "center" };

      ws.getCell(6, c).value = DAY_LETTERS[dow];
      ws.getCell(6, c).font = { size: 7, color: { argb: dow >= 5 ? "FFFF6600" : "FF666666" } };
      ws.getCell(6, c).alignment = { horizontal: "center" };

      if (dow >= 5) {
        for (let r = 5; r <= 6 + people.length; r++) {
          ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5DC" } };
        }
      }
      if (holidayMap.has(dateStr)) {
        for (let r = 5; r <= 6 + people.length; r++) {
          ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFCCCC" } };
        }
      }
    }
    col += daysInMonth + 1;
  }

  ws.getCell(6, 2).value = "TRABAJADOR";
  ws.getCell(6, 2).font = { bold: true, size: 9 };
  ws.getCell(6, 4).value = "ÁREA / DEPARTAMENTO";
  ws.getCell(6, 4).font = { bold: true, size: 9 };
  ws.getColumn(2).width = 25;
  ws.getColumn(3).width = 3;
  ws.getColumn(4).width = 20;
  ws.getColumn(5).width = 2;

  // Shift code map
  const shiftCodes: Record<string, { code: string; color: string }> = {
    morning: { code: "M", color: "FFFFD699" },
    afternoon: { code: "T", color: "FFB4C6E7" },
    weekend: { code: "F", color: "FFFCE4D6" },
    refuerzo_morning: { code: "RM", color: "FFC6EFCE" },
    refuerzo_afternoon: { code: "RT", color: "FFD9E2F3" },
    refuerzo_ofi: { code: "RO", color: "FFE2EFDA" },
    office: { code: "O", color: "FFE8E8FF" },
    office_friday: { code: "OV", color: "FFE8E8FF" },
  };

  for (let pi = 0; pi < people.length; pi++) {
    const person = people[pi];
    const row = 8 + pi;

    ws.getCell(row, 2).value = person.name;
    ws.getCell(row, 2).font = { size: 9 };
    ws.getCell(row, 4).value = "SISTEMAS";
    ws.getCell(row, 4).font = { size: 8, color: { argb: "FF888888" } };

    col = 6;
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(year, m + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const day = scheduleMap.get(dateStr);
        const c = col + d - 1;

        if (day) {
          // Check if person has a shift
          const assignment = day.assignments.find((a: any) => a.personId === person.id);
          const timeOff = day.timeOffs.find((t: any) => t.personId === person.id);
          const isOff = day.offPeople?.some((o: any) => o.personId === person.id);

          const cell = ws.getCell(row, c);
          cell.alignment = { horizontal: "center" };

          if (timeOff) {
            if (timeOff.type === "vacaciones") {
              cell.value = "V";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
            } else if (timeOff.type === "intercambio") {
              cell.value = "I";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF99CCFF" } };
            } else {
              cell.value = "A";
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
            }
            cell.font = { size: 7, bold: true };
          } else if (assignment) {
            const sc = shiftCodes[assignment.shiftTypeCode] || { code: "?", color: "FFFFFFFF" };
            cell.value = sc.code;
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sc.color } };
            cell.font = { size: 7, bold: true };
          } else if (isOff) {
            cell.value = "L";
            cell.font = { size: 7, color: { argb: "FFAAAAAA" } };
          }
        }
      }
      col += daysInMonth + 1;
    }
  }

  // Legend
  const legendRow = 8 + people.length + 2;
  ws.getCell(legendRow, 2).value = "Leyenda:";
  ws.getCell(legendRow, 2).font = { bold: true, size: 9 };
  const legend = [
    { code: "M", label: "Mañana (8:00-17:30)", color: "FFFFD699" },
    { code: "T", label: "Tarde (14:00-22:00)", color: "FFB4C6E7" },
    { code: "F", label: "Finde (10:00-22:00)", color: "FFFCE4D6" },
    { code: "RM", label: "Refuerzo Mañana", color: "FFC6EFCE" },
    { code: "O", label: "Oficina (8:00-17:00)", color: "FFE8E8FF" },
    { code: "OV", label: "Oficina Viernes (8:00-15:00)", color: "FFE8E8FF" },
    { code: "V", label: "Vacaciones", color: "FF92D050" },
    { code: "I", label: "Intercambio", color: "FF99CCFF" },
    { code: "L", label: "Libra", color: "FFFFFFFF" },
  ];
  for (let i = 0; i < legend.length; i++) {
    const r = legendRow + 1 + i;
    ws.getCell(r, 2).value = legend[i].code;
    ws.getCell(r, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: legend[i].color } };
    ws.getCell(r, 2).font = { bold: true, size: 8 };
    ws.getCell(r, 2).alignment = { horizontal: "center" };
    ws.getCell(r, 4).value = legend[i].label;
    ws.getCell(r, 4).font = { size: 8 };
  }
}
