// ─── Generador de Eventos Comerciales ─────────────────────
// Calcula automáticamente los periodos de alta demanda para retail textil

export interface CommercialPeriod {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  getDateRange: (year: number) => { start: string; end: string };
  weekdaysExtra: number; // personas extra L-J
  weekendExtra: number;  // personas extra S-D
  intensity: "high" | "medium" | "low";
}

// Easter calculation (Anonymous Gregorian algorithm)
function getEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Get the 4th Thursday of November (US Thanksgiving) → Black Friday = day after
function getBlackFriday(year: number): Date {
  const nov1 = new Date(year, 10, 1); // November
  let thurCount = 0;
  let d = new Date(nov1);
  while (thurCount < 4) {
    if (d.getDay() === 4) thurCount++;
    if (thurCount < 4) d.setDate(d.getDate() + 1);
  }
  return addDays(d, 1); // Friday after Thanksgiving
}

export const COMMERCIAL_PERIODS: CommercialPeriod[] = [
  {
    id: "rebajas_invierno",
    name: "Rebajas de Invierno",
    description: "Inicio de rebajas post-navideñas. Alta afluencia las 2 primeras semanas.",
    enabled: true,
    getDateRange: (year) => ({ start: `${year}-01-07`, end: `${year}-01-20` }),
    weekdaysExtra: 1,
    weekendExtra: 1,
    intensity: "medium",
  },
  {
    id: "semana_santa",
    name: "Semana Santa",
    description: "Semana Santa y puente. Afluencia variable según zona.",
    enabled: false, // Desactivado por defecto - poca gente según el usuario
    getDateRange: (year) => {
      const easter = getEaster(year);
      const start = addDays(easter, -6); // Lunes Santo
      const end = addDays(easter, 1); // Lunes de Pascua
      return { start: fmt(start), end: fmt(end) };
    },
    weekdaysExtra: 1,
    weekendExtra: 0,
    intensity: "low",
  },
  {
    id: "rebajas_verano",
    name: "Rebajas de Verano",
    description: "Inicio de rebajas de verano. Pico las 2 primeras semanas.",
    enabled: true,
    getDateRange: (year) => ({ start: `${year}-07-01`, end: `${year}-07-15` }),
    weekdaysExtra: 1,
    weekendExtra: 1,
    intensity: "medium",
  },
  {
    id: "black_friday",
    name: "Black Friday",
    description: "Semana de Black Friday + fin de semana. Pico máximo de ventas del año.",
    enabled: true,
    getDateRange: (year) => {
      const bf = getBlackFriday(year);
      const start = addDays(bf, -3); // Martes antes
      const end = addDays(bf, 2); // Domingo después
      return { start: fmt(start), end: fmt(end) };
    },
    weekdaysExtra: 2,
    weekendExtra: 1,
    intensity: "high",
  },
  {
    id: "navidad",
    name: "Navidad",
    description: "Periodo navideño completo: últimas compras, regalos. Muy alta afluencia.",
    enabled: true,
    getDateRange: (year) => ({ start: `${year}-12-15`, end: `${year}-12-24` }),
    weekdaysExtra: 2,
    weekendExtra: 1,
    intensity: "high",
  },
  {
    id: "reyes",
    name: "Reyes",
    description: "Últimas compras antes de Reyes + inicio rebajas.",
    enabled: true,
    getDateRange: (year) => ({ start: `${year}-01-02`, end: `${year}-01-06` }),
    weekdaysExtra: 1,
    weekendExtra: 1,
    intensity: "medium",
  },
];

export interface ProposedEvent {
  periodId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  weekdaysExtraSlots: number;
  weekendExtraSlots: number;
  intensity: "high" | "medium" | "low";
}

/**
 * Generate proposed commercial events for a given year.
 * Only includes enabled periods.
 */
export function generateCommercialEvents(
  year: number,
  overrides?: Record<string, { enabled?: boolean; weekdaysExtra?: number; weekendExtra?: number }>
): ProposedEvent[] {
  const events: ProposedEvent[] = [];

  for (const period of COMMERCIAL_PERIODS) {
    const ov = overrides?.[period.id];
    const enabled = ov?.enabled ?? period.enabled;
    if (!enabled) continue;

    const range = period.getDateRange(year);
    const wdExtra = ov?.weekdaysExtra ?? period.weekdaysExtra;
    const weExtra = ov?.weekendExtra ?? period.weekendExtra;

    events.push({
      periodId: period.id,
      name: `${period.name} ${year}`,
      description: period.description,
      startDate: range.start,
      endDate: range.end,
      weekdaysExtraSlots: wdExtra,
      weekendExtraSlots: weExtra,
      intensity: period.intensity,
    });
  }

  // Sort by date
  events.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return events;
}
