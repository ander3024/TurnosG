// ─── Main Scheduler ───────────────────────────────────────
// REGLAS:
// - 4 personas rotan en ciclo de 4 semanas
// - Cada semana: 1 persona libra ENTERA (la que trabajó L-D la semana anterior)
// - De las 3 restantes: 1 hace TODA la semana L-D (será quien libre la siguiente)
//   - L-J: mañana o tarde (titular) + hace finde S-D
//   - V: también trabaja
// - Las otras 2: trabajan L-V
//   - L-J: una mañana, otra tarde (consistente toda la semana)
//   - V: una mañana, otra tarde
// - 3ª persona L-J: la persona del finde (ya trabaja como titular)
// - Refuerzos: solo en eventos comerciales, con presupuesto

import type {
  EngineContext, EnginePerson, EngineShiftType, ShiftAssignment, DaySchedule,
} from "./types";
import {
  isWeekend, isSaturday, getWeekNumber, iterateDates, getDayOfWeek, addDays, getWeekStart,
} from "./dates";
import { getOffPerson, getWeekendWorker } from "./rotation";
import { shiftHours } from "./hours";

function findPerson(ctx: EngineContext, id: number): EnginePerson | undefined {
  return ctx.people.find((p) => p.id === id);
}

function makeAssignment(
  date: string, shift: EngineShiftType, person: EnginePerson | null,
  slotIndex: number, source: ShiftAssignment["source"]
): ShiftAssignment {
  return {
    date, shiftTypeCode: shift.code, shiftTypeLabel: shift.label,
    startTime: shift.startTime, endTime: shift.endTime,
    personId: person?.id ?? null, personCode: person?.code ?? null,
    personName: person?.name ?? null, personColor: person?.color ?? null,
    slotIndex, source, hours: person ? shiftHours(shift) : 0,
  };
}

function buildBlockedDates(ctx: EngineContext): Map<number, Set<string>> {
  const blocked = new Map<number, Set<string>>();
  for (const p of ctx.people) blocked.set(p.id, new Set());
  for (const to of ctx.timeOffs) {
    // cita_medica is partial hours within a day → informational only, do not block
    if (to.type === "cita_medica") continue;
    let d = to.startDate;
    while (d <= to.endDate) {
      const dow = getDayOfWeek(d);
      // Only block weekdays (vacations are working days, weekends don't count)
      if (dow < 5) {
        blocked.get(to.personId)?.add(d);
        // Also block the whole week's weekdays for regular shifts (consistency)
        const ws = getWeekStart(d);
        for (let i = 0; i < 5; i++) { // Mon-Fri only
          blocked.get(to.personId)?.add(addDays(ws, i));
        }
      }
      d = addDays(d, 1);
    }
  }
  return blocked;
}

function isBlocked(bd: Map<number, Set<string>>, pid: number, date: string): boolean {
  return bd.get(pid)?.has(date) ?? false;
}

function isClosed(ctx: EngineContext, date: string): boolean {
  const h = ctx.holidays.get(date);
  if (!h) return false;
  return h.type !== "working" && ctx.settings.closeOnHolidays;
}

function isWorkingHoliday(ctx: EngineContext, date: string): boolean {
  return ctx.holidays.get(date)?.type === "working" || false;
}

// ─── Week Plan: pre-compute roles for the whole week ──────

interface WeekPlan {
  offPerson: EnginePerson | null;        // libra toda la semana
  weekendPerson: EnginePerson | null;    // trabaja L-D, hace finde
  morningPerson: EnginePerson | null;    // trabaja L-V mañana
  afternoonPerson: EnginePerson | null;  // trabaja L-V tarde
}

function planWeek(
  ctx: EngineContext, weekNum: number, blockedDates: Map<number, Set<string>>,
  weekStart: string, counts: { weekday: Map<number, number>; weekend: Map<number, number> }
): WeekPlan {
  // Only rotation people participate in shifts
  const rPeople = ctx.people.filter(p => p.scheduleType === "rotation");
  const offP = getOffPerson(weekNum, rPeople);
  const weP = getWeekendWorker(weekNum, rPeople);

  // Real hours for balancing (weekday*8 + weekend*12)
  const realH = (pid: number) =>
    (counts.weekday.get(pid) || 0) * 8 + (counts.weekend.get(pid) || 0) * 12;

  // Available = rotation people except OFF, and not blocked for the week
  let available = rPeople.filter(
    (p) => p.id !== offP?.id && !isBlocked(blockedDates, p.id, weekStart)
  );

  // Weekend person: preferably the rotation one, if available
  let weekendPerson: EnginePerson | null = null;
  if (weP && available.some((p) => p.id === weP.id)) {
    weekendPerson = weP;
  } else if (available.length > 0) {
    const sorted = [...available].sort((a, b) => (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0));
    weekendPerson = sorted[0];
  }

  // The other 2 do morning and afternoon
  // Sort by REAL HOURS so person with fewer hours gets more work
  const others = available.filter((p) => p.id !== weekendPerson?.id);
  let morningPerson: EnginePerson | null = null;
  let afternoonPerson: EnginePerson | null = null;

  if (others.length >= 2) {
    const sorted = [...others].sort((a, b) => realH(a.id) - realH(b.id));
    morningPerson = sorted[0]; // person with fewer hours gets morning (8h)
    afternoonPerson = sorted[1];
  } else if (others.length === 1) {
    morningPerson = others[0];
    afternoonPerson = weekendPerson;
  }

  // If not enough people (vacations), pull in OFF person
  if (!morningPerson || !afternoonPerson) {
    if (offP && !isBlocked(blockedDates, offP.id, weekStart)) {
      if (!morningPerson) morningPerson = offP;
      else if (!afternoonPerson) afternoonPerson = offP;
    }
  }

  return {
    offPerson: offP && !isBlocked(blockedDates, offP.id, weekStart) ? offP : null,
    weekendPerson,
    morningPerson,
    afternoonPerson,
  };
}

// ─── Main ─────────────────────────────────────────────────

export interface GoalFillOptions {
  /** personId -> horas de refuerzo a ANADIR a esa persona en el periodo */
  fillHours: Map<number, number>;
  /** maximo de dias consecutivos trabajados que el relleno puede provocar */
  maxConsecutiveDays?: number;
}

export function generateSchedule(
  ctx: EngineContext,
  from: string,
  to: string,
  goals?: GoalFillOptions
): DaySchedule[] {
  const dates = iterateDates(from, to);
  const schedule: DaySchedule[] = [];
  const blockedDates = buildBlockedDates(ctx);

  // Separate rotation people from fixed-schedule (managers)
  const rotationPeople = ctx.people.filter(p => p.scheduleType === "rotation");
  const fixedPeople = ctx.people.filter(p => p.scheduleType === "fixed");

  const counts = {
    weekday: new Map<number, number>(),
    weekend: new Map<number, number>(),
  };
  for (const p of ctx.people) { counts.weekday.set(p.id, 0); counts.weekend.set(p.id, 0); }

  const morningShift = ctx.shiftTypes.get("morning");
  const afternoonShift = ctx.shiftTypes.get("afternoon");
  const weekendShift = ctx.shiftTypes.get("weekend");
  const refuerzoMorning = ctx.shiftTypes.get("refuerzo_morning");
  const refuerzoAfternoon = ctx.shiftTypes.get("refuerzo_afternoon");
  const refuerzoOfi = ctx.shiftTypes.get("refuerzo_ofi");
  const officeShift = ctx.shiftTypes.get("office");
  const officeFridayShift = ctx.shiftTypes.get("office_friday");

  const BUFFER_HOURS = 40;
  const refUsed = new Map<number, number>();
  for (const p of ctx.people) refUsed.set(p.id, 0);
  // Presupuesto aproximado por persona para los refuerzos de evento. Solo se usa
  // cuando NO hay objetivos: con `goals` manda el control proporcional, que mide
  // el retraso real de cada uno en vez de estimarlo con una constante.
  const refBudget = new Map<number, number>();
  for (const p of ctx.people) {
    const extra = ctx.extraHours.filter((e) => e.personId === p.id).reduce((t, e) => t + e.hours, 0);
    refBudget.set(p.id, Math.max(0, ctx.settings.annualTargetHours - 1400 - extra - BUFFER_HOURS));
  }
  const refuerzoAllowed = (pid: number, refH: number) =>
    (refUsed.get(pid) || 0) + refH <= (refBudget.get(pid) || 0);

  // Holidays covered so far, to spread them evenly instead of letting them fall
  // on whoever happens to be the week's weekend worker.
  const holidaysWorked = new Map<number, number>();
  for (const p of ctx.people) holidaysWorked.set(p.id, 0);

  // ─── Goal fill: refuerzos extra para llegar al objetivo anual ───
  // Clave del diseno: estos refuerzos NO entran en `counts`, asi que el algoritmo
  // base elige exactamente igual que sin ellos. Eso permite calcular el hueco de
  // cada persona en una primera pasada y gastarlo en la segunda sin que el reparto
  // base se mueva por debajo. Sin `goals` nada de esto actua.
  const fillBudget = new Map<number, number>();
  const fillSpent = new Map<number, number>();
  for (const p of ctx.people) {
    fillBudget.set(p.id, Math.max(0, goals?.fillHours.get(p.id) ?? 0));
    fillSpent.set(p.id, 0);
  }
  const maxRun = goals?.maxConsecutiveDays ?? 7;
  const workedOn = new Map<number, Set<string>>();
  for (const p of ctx.people) workedOn.set(p.id, new Set());
  const refWeek = new Map<string, number>();
  const refMonth = new Map<string, number>();
  let dayIdx = 0;
  const totalDays = dates.length;
  /** Cabe otro refuerzo de relleno para esta persona hoy? */
  const fillFits = (pid: number, refH: number) => {
    const budget = fillBudget.get(pid) || 0;
    const spent = fillSpent.get(pid) || 0;
    if (spent + refH > budget) return false;              // nunca pasarse del hueco
    return spent < budget * (dayIdx / totalDays);         // repartido a lo largo del periodo
  };
  /** Tercero de L-J: por horas reales acumuladas (el relleno no cuenta aqui). */
  const byHours = (a: EnginePerson, b: EnginePerson) =>
    ((counts.weekday.get(a.id) || 0) * 8 + (counts.weekend.get(a.id) || 0) * 12) -
    ((counts.weekday.get(b.id) || 0) * 8 + (counts.weekend.get(b.id) || 0) * 12);
  /** Refuerzos de evento en laborable: por turnos de laborable. */
  const byWeekday = (a: EnginePerson, b: EnginePerson) =>
    (counts.weekday.get(a.id) || 0) - (counts.weekday.get(b.id) || 0);
  /** Slots extra de finde: por turnos de finde. */
  const byWeekend = (a: EnginePerson, b: EnginePerson) =>
    (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0);
  /** A quien le queda mas hueco por rellenar. */
  const byFillLeft = (a: EnginePerson, b: EnginePerson) =>
    ((fillBudget.get(b.id) || 0) - (fillSpent.get(b.id) || 0)) -
    ((fillBudget.get(a.id) || 0) - (fillSpent.get(a.id) || 0));
  const runIfAdded = (pid: number, date: string) => {
    const w = workedOn.get(pid)!;
    let b = 0, f = 0;
    for (let d = addDays(date, -1); w.has(d); d = addDays(d, -1)) b++;
    for (let d = addDays(date, 1); w.has(d); d = addDays(d, 1)) f++;
    return b + 1 + f;
  };

  // Cache week plans
  const weekPlans = new Map<number, WeekPlan>();
  let saturdayPerson: EnginePerson | null = null;

  for (const date of dates) {
    dayIdx++;   // al principio: los dias cerrados salen por `continue` mas abajo
    const isWe = isWeekend(date);
    const isSat = isSaturday(date);
    const closed = isClosed(ctx, date);
    const holiday = ctx.holidays.get(date);
    const isWH = isWorkingHoliday(ctx, date);
    const activeEvents = ctx.events.filter((e) => e.startDate <= date && e.endDate >= date);
    const weekNum = getWeekNumber(date, ctx.settings.startDate);
    const dow = getDayOfWeek(date);
    const ws = getWeekStart(date);

    // Get or compute week plan
    if (!weekPlans.has(weekNum)) {
      weekPlans.set(weekNum, planWeek(ctx, weekNum, blockedDates, ws, counts));
    }
    const plan = weekPlans.get(weekNum)!;

    // TimeOffs for display (deduplicate by personId)
    const seenTimeOff = new Set<number>();
    const dayTimeOffs = ctx.timeOffs
      .filter((to) => to.startDate <= date && to.endDate >= date)
      .map((to) => {
        const p = ctx.people.find((pp) => pp.id === to.personId);
        return {
          personId: to.personId,
          personCode: p?.code || "?",
          personName: p?.name || "?",
          personColor: p?.color || "#9ca3af",
          type: to.type,
          startTime: to.startTime ?? null,
          endTime: to.endTime ?? null,
        };
      })
      .filter((to) => {
        // Allow multiple cita_medica entries on the same day, but dedupe other types per person
        if (to.type === "cita_medica") return true;
        if (seenTimeOff.has(to.personId)) return false;
        seenTimeOff.add(to.personId);
        return true;
      });

    const day: DaySchedule = {
      date, isWeekend: isWe, isHoliday: !!holiday, isClosed: closed,
      holidayLabel: holiday?.label || null, assignments: [],
      events: activeEvents.map((e) => ({ label: e.label, color: null as string | null })),
      timeOffs: dayTimeOffs, offPeople: [],
    };

    if (closed) { schedule.push(day); continue; }

    const dayOverrides = ctx.overrides.get(date) || [];

    // ═══ WEEKEND or WORKING HOLIDAY: 1 person, finde shift ═══
    if ((isWe || isWH) && weekendShift) {
      let person: EnginePerson | null = null;
      let source: ShiftAssignment["source"] = "rotation";

      const ov = dayOverrides.find((o) => o.shiftTypeCode === "weekend" && o.slotIndex === 0);
      if (ov) {
        person = ov.personId ? findPerson(ctx, ov.personId) || null : null;
        source = "override";
      } else if (isSat || isWH) {
        if (isWH && !isWe) {
          // Weekday holiday: the shop opens with a single person, so pick whoever
          // has covered the fewest holidays this year. Using the week's weekend
          // worker spread them very unevenly (6/3/2/0 across four people).
          // A holiday falling on a weekend is left to the weekend worker, who is
          // already working that weekend anyway.
          const avail = rotationPeople.filter(
            (p) => !isBlocked(blockedDates, p.id, date) && p.id !== plan.offPerson?.id
          );
          avail.sort((a, b) =>
            (holidaysWorked.get(a.id) || 0) - (holidaysWorked.get(b.id) || 0) ||
            (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0) ||
            (counts.weekday.get(a.id) || 0) - (counts.weekday.get(b.id) || 0)
          );
          person = avail[0] || plan.weekendPerson;
          source = "balance";
        } else {
          person = plan.weekendPerson;
          if (person && isBlocked(blockedDates, person.id, date)) {
            const avail = rotationPeople.filter((p) => !isBlocked(blockedDates, p.id, date) && p.id !== plan.offPerson?.id);
            avail.sort((a, b) => (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0));
            person = avail[0] || null; source = "balance";
          }
        }
        if (!isWH) saturdayPerson = person;
      } else {
        person = saturdayPerson || plan.weekendPerson;
        if (person && isBlocked(blockedDates, person.id, date)) {
          const avail = rotationPeople.filter((p) => !isBlocked(blockedDates, p.id, date));
          avail.sort((a, b) => (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0));
          person = avail[0] || null; source = "balance";
        }
      }

      if (person) {
        day.assignments.push(makeAssignment(date, weekendShift, person, 0, source));
        counts.weekend.set(person.id, (counts.weekend.get(person.id) || 0) + 1);
        if (isWH) holidaysWorked.set(person.id, (holidaysWorked.get(person.id) || 0) + 1);
      }

      // Weekend extra slots from events
      let weSlot = 1;
      for (const evt of activeEvents) {
        if (evt.weekendExtraSlots <= 0) continue;
        for (let i = 0; i < evt.weekendExtraSlots; i++) {
          const ov2 = dayOverrides.find((o) => o.shiftTypeCode === "weekend" && o.slotIndex === weSlot);
          let ep: EnginePerson | null = null; let es: ShiftAssignment["source"] = "event";
          const assigned = new Set(day.assignments.map((a) => a.personId).filter(Boolean));
          if (ov2) { ep = ov2.personId ? findPerson(ctx, ov2.personId) || null : null; es = "override"; }
          else if (evt.assigneeForced && evt.assigneePersonId) {
            const f = findPerson(ctx, evt.assigneePersonId);
            if (f && !assigned.has(f.id)) { ep = f; es = "event"; }
          }
          if (!ep) {
            const avail = rotationPeople.filter((p) => !isBlocked(blockedDates, p.id, date) && !assigned.has(p.id));
            avail.sort(byWeekend);
            ep = avail[0] || null; es = "balance";
          }
          if (ep) {
            day.assignments.push(makeAssignment(date, weekendShift, ep, weSlot, es));
            counts.weekend.set(ep.id, (counts.weekend.get(ep.id) || 0) + 1);
          }
          weSlot++;
        }
      }

    // ═══ WEEKDAY ═══════════════════════════════════════════
    } else if (!isWe && morningShift && afternoonShift) {

      const mOv = dayOverrides.find((o) => o.shiftTypeCode === "morning" && o.slotIndex === 0);
      const aOv = dayOverrides.find((o) => o.shiftTypeCode === "afternoon" && o.slotIndex === 0);

      const mOvPerson = mOv?.personId ? findPerson(ctx, mOv.personId) || null : null;
      const aOvPerson = aOv?.personId ? findPerson(ctx, aOv.personId) || null : null;
      const mOverridden = !!mOv;
      const aOverridden = !!aOv;

      const realH = (pid: number) =>
        (counts.weekday.get(pid) || 0) * 8 + (counts.weekend.get(pid) || 0) * 12;

      // Base pool: rotation people who aren't the off person and aren't blocked
      let todayPool = rotationPeople.filter(
        (p) => p.id !== plan.offPerson?.id && !isBlocked(blockedDates, p.id, date)
      );

      // If someone is sick (blocked but not on vacation), pull in the off person to cover
      const hasSickPerson = rotationPeople.some(
        (p) => p.id !== plan.offPerson?.id && isBlocked(blockedDates, p.id, date)
          && ctx.timeOffs.some(t => t.personId === p.id && t.type === "enfermedad" && t.startDate <= date && t.endDate >= date)
      );
      if (hasSickPerson && plan.offPerson && !isBlocked(blockedDates, plan.offPerson.id, date)) {
        todayPool = [...todayPool, plan.offPerson];
      }

      let mp: EnginePerson | null = null;
      let ap: EnginePerson | null = null;
      let mSrc: ShiftAssignment["source"] = "rotation";
      let aSrc: ShiftAssignment["source"] = "rotation";

      if (mOv && mOvPerson) {
        mp = mOvPerson; mSrc = "override";
      }
      if (aOv && aOvPerson) {
        ap = aOvPerson; aSrc = "override";
      }

      // Auto-assign only slots NOT touched by admin
      if ((!mp && !mOverridden) || (!ap && !aOverridden)) {
        const used = new Set<number>();
        if (mp) used.add(mp.id);
        if (ap) used.add(ap.id);
        for (const ov of dayOverrides) { if (ov.personId) used.add(ov.personId); }
        const remaining = todayPool.filter((p) => !used.has(p.id));
        remaining.sort((a, b) => realH(a.id) - realH(b.id));

        if (!mp && !mOverridden && remaining.length > 0) {
          mp = remaining.shift()!; mSrc = "balance";
        }
        if (!ap && !aOverridden && remaining.length > 0) {
          ap = remaining.shift()!; aSrc = "balance";
        }
      }

      // Prevent same person on both
      if (mp && ap && mp.id === ap.id) {
        const alt = todayPool.filter((p) => p.id !== mp!.id);
        alt.sort((a, b) => realH(a.id) - realH(b.id));
        ap = alt[0] || null; aSrc = "balance";
      }

      if (mp) {
        day.assignments.push(makeAssignment(date, morningShift, mp, 0, mSrc));
        counts.weekday.set(mp.id, (counts.weekday.get(mp.id) || 0) + 1);
      }
      if (ap) {
        day.assignments.push(makeAssignment(date, afternoonShift, ap, 0, aSrc));
        counts.weekday.set(ap.id, (counts.weekday.get(ap.id) || 0) + 1);
      }

      // ─── 3rd person L-J only: Friday is 2 people unless event says otherwise ───
      const isFriday = dow === 4;
      const currentMonth = parseInt(date.slice(5, 7));
      const isRelaxedMonth = ctx.settings.vacationRelaxedMonths.includes(currentMonth);

      if (dow <= 3 && !isRelaxedMonth) { // Monday(0) to Thursday(3) - 3 people (except relaxed months)
        const assigned = new Set(day.assignments.map((a) => a.personId).filter(Boolean));
        const refShift = refuerzoMorning || refuerzoOfi || morningShift;

        const refOv = dayOverrides.find((o) =>
          (o.shiftTypeCode === "refuerzo_morning" || o.shiftTypeCode === "refuerzo_ofi") && o.slotIndex === 1
        );

        let tp: EnginePerson | null = null;
        let tSrc: ShiftAssignment["source"] = "rotation";

        const refOverridden = !!refOv; // admin touched this slot
        if (refOv) {
          const ovP = refOv.personId ? findPerson(ctx, refOv.personId) || null : null;
          if (ovP && !assigned.has(ovP.id)) {
            tp = ovP; tSrc = "override";
          }
          // If override with null personId → admin explicitly removed refuerzo
        }
        if (!tp && !refOverridden) {
          // 3rd worker L-V: pick person with FEWEST REAL HOURS
          // For refuerzos, only block on EXACT vacation days (not whole week)
          // This allows the person to do refuerzos on non-vacation days of their vacation week
          const hasTimeOffToday = (pid: number) => ctx.timeOffs.some(
            (to) => to.personId === pid && to.type !== "cita_medica" && to.startDate <= date && to.endDate >= date
          );
          const cands = rotationPeople.filter(
            (p) => p.id !== plan.offPerson?.id && !hasTimeOffToday(p.id) && !assigned.has(p.id)
          );
          // Con objetivos: el que mas lejos esta del suyo. Sin ellos: el que menos horas lleva.
          cands.sort(byHours);
          tp = cands[0] || null;
          tSrc = "balance";
        }

        if (tp) {
          day.assignments.push(makeAssignment(date, refShift, tp, 1, tSrc));
          counts.weekday.set(tp.id, (counts.weekday.get(tp.id) || 0) + 1);
        }
      }

      // ─── EVENT REFUERZOS (commercial periods) ────────────
      let refSlot = 2;
      for (const evt of activeEvents) {
        if (evt.weekdaysExtraSlots <= 0) continue;
        let refShift: EngineShiftType | undefined;
        if (evt.weekdayRefuerzo === "mañana" || evt.weekdayRefuerzo === "manana") refShift = refuerzoMorning || refuerzoOfi;
        else if (evt.weekdayRefuerzo === "tarde") refShift = refuerzoAfternoon;
        else refShift = refuerzoOfi || refuerzoMorning;
        if (!refShift) continue;
        const refH = shiftHours(refShift);

        for (let i = 0; i < evt.weekdaysExtraSlots; i++) {
          const assigned = new Set(day.assignments.map((a) => a.personId).filter(Boolean));
          const ov2 = dayOverrides.find((o) => o.shiftTypeCode === refShift!.code && o.slotIndex === refSlot);
          let ep: EnginePerson | null = null; let es: ShiftAssignment["source"] = "event";

          if (ov2) {
            const ovP = ov2.personId ? findPerson(ctx, ov2.personId) || null : null;
            if (ovP && !assigned.has(ovP.id)) { ep = ovP; es = "override"; }
          } else if (evt.assigneeForced && evt.assigneePersonId) {
            const f = findPerson(ctx, evt.assigneePersonId);
            if (f && !assigned.has(f.id) && refuerzoAllowed(f.id, refH)) {
              ep = f; es = "event";
            }
          }
          if (!ep) {
            const avail = rotationPeople.filter(
              (p) => !isBlocked(blockedDates, p.id, date) && !assigned.has(p.id) &&
                refuerzoAllowed(p.id, refH)
            );
            avail.sort(byWeekday);
            ep = avail[0] || null; es = "balance";
          }
          if (ep) {
            day.assignments.push(makeAssignment(date, refShift, ep, refSlot, es));
            counts.weekday.set(ep.id, (counts.weekday.get(ep.id) || 0) + 1);
            refUsed.set(ep.id, (refUsed.get(ep.id) || 0) + refH);
          }
          refSlot++;
        }
      }
    }

    // ═══ FIXED SCHEDULE (managers) ═══
    // Managers never work holidays, not even the ones the shop opens on
    // (those are covered by a single rotation person on the weekend shift).
    if (!closed && !isWe && !holiday) {
      const isFri = dow === 4;
      const fixedShift = isFri ? (officeFridayShift || officeShift) : officeShift;
      if (fixedShift) {
        for (const fp of fixedPeople) {
          if (isBlocked(blockedDates, fp.id, date)) continue;
          // Check if manager has timeoff today (cita_medica is informative, doesn't block)
          const hasTimeOff = day.timeOffs.some(t => t.personId === fp.id && t.type !== "cita_medica");
          if (hasTimeOff) continue;
          day.assignments.push(makeAssignment(date, fixedShift, fp, 0, "rotation"));
          counts.weekday.set(fp.id, (counts.weekday.get(fp.id) || 0) + 1);
        }
      }
    }

    // Pick up any admin overrides at slots that the regular logic didn't consume.
    // This lets the admin add extra people to any shift (e.g. Mario as 2nd morning).
    if (!closed) {
      const assignedKeys = new Set(day.assignments.map(a => `${a.shiftTypeCode}-${a.slotIndex}`));
      for (const ov of dayOverrides) {
        const key = `${ov.shiftTypeCode}-${ov.slotIndex}`;
        if (assignedKeys.has(key)) continue;
        if (!ov.personId) continue; // admin explicitly emptied — skip
        const person = findPerson(ctx, ov.personId);
        const shift = ctx.shiftTypesById.get(ov.shiftTypeId);
        if (!person || !shift) continue;
        day.assignments.push(makeAssignment(date, shift, person, ov.slotIndex, "override"));
        if (shift.category === "weekend") {
          counts.weekend.set(person.id, (counts.weekend.get(person.id) || 0) + 1);
        } else {
          counts.weekday.set(person.id, (counts.weekday.get(person.id) || 0) + 1);
        }
      }
    }

    // ─── GOAL FILL: refuerzos extra para acercar a cada uno a su objetivo ───
    // Solo con `goals`. No toca festivos abiertos (llevan 1 sola persona) ni dias
    // cerrados, respeta los topes de refuerzoPolicy y no encadena mas de maxRun dias.
    if (goals && !closed && !isWH) {
      const refShift = isWe ? weekendShift : (refuerzoMorning || refuerzoOfi);
      if (refShift) {
        const refH = shiftHours(refShift);
        const pol = ctx.settings.refuerzoPolicy;
        let guard = 0;
        for (;;) {
          if (guard++ > rotationPeople.length) break;
          const assigned = new Set(day.assignments.map((a) => a.personId).filter(Boolean));
          const cand = rotationPeople
            .filter((p) => {
              if (assigned.has(p.id)) return false;
              if (isBlocked(blockedDates, p.id, date)) return false;
              if (!fillFits(p.id, refH)) return false;
              if (runIfAdded(p.id, date) > maxRun) return false;
              const wk = `${p.id}|${ws}`, mo = `${p.id}|${date.slice(0, 7)}`;
              if ((refWeek.get(wk) || 0) >= (pol.maxPerWeekPerPerson ?? 4)) return false;
              if ((refMonth.get(mo) || 0) >= (pol.maxPerMonthPerPerson ?? 16)) return false;
              return true;
            })
            .sort(byFillLeft)[0];
          if (!cand) break;
          let slot = isWe ? 1 : 2;
          const taken = new Set(
            day.assignments.filter((a) => a.shiftTypeCode === refShift.code).map((a) => a.slotIndex)
          );
          while (taken.has(slot)) slot++;
          // Ojo: a proposito NO se incrementa `counts`, para que el algoritmo base
          // siga eligiendo igual que sin relleno.
          day.assignments.push(makeAssignment(date, refShift, cand, slot, "balance"));
          fillSpent.set(cand.id, (fillSpent.get(cand.id) || 0) + refH);
          refWeek.set(`${cand.id}|${ws}`, (refWeek.get(`${cand.id}|${ws}`) || 0) + 1);
          refMonth.set(`${cand.id}|${date.slice(0, 7)}`, (refMonth.get(`${cand.id}|${date.slice(0, 7)}`) || 0) + 1);
        }
      }
    }

    // Cierre del dia: registrar lo asignado (para rachas y para el control).
    for (const a of day.assignments) {
      if (!a.personId) continue;
      workedOn.get(a.personId)?.add(date);
    }

    // Compute offPeople (only rotation people — managers are either assigned or on timeoff)
    if (!closed) {
      const assignedIds = new Set(day.assignments.map((a) => a.personId).filter(Boolean));
      const timeOffIds = new Set(day.timeOffs.filter(t => t.type !== "cita_medica").map((t) => t.personId));
      day.offPeople = rotationPeople
        .filter((p) => !assignedIds.has(p.id) && !timeOffIds.has(p.id))
        .map((p) => ({ personId: p.id, personCode: p.code, personName: p.name, personColor: p.color }));
    }

    schedule.push(day);
  }

  return schedule;
}

/**
 * Genera el cuadrante persiguiendo el objetivo anual de cada persona.
 *
 * Dos pasadas:
 *  1. El cuadrante normal, para saber con cuantas horas acaba cada uno.
 *  2. El mismo cuadrante mas refuerzos de relleno por el hueco que le falte.
 *
 * Es exacto porque los refuerzos de relleno no entran en los contadores del
 * algoritmo base: la segunda pasada reparte los turnos base igual que la primera,
 * asi que el total final es el de la primera mas el hueco. El periodo debe ser el
 * ano completo; con un rango menor el objetivo no significa nada.
 */
export function generateScheduleToTarget(
  ctx: EngineContext,
  from: string,
  to: string,
  opts?: { maxConsecutiveDays?: number }
): DaySchedule[] {
  const base = generateSchedule(ctx, from, to);

  const worked = new Map<number, number>();
  for (const p of ctx.people) worked.set(p.id, 0);
  for (const day of base) {
    for (const a of day.assignments) {
      if (a.personId) worked.set(a.personId, (worked.get(a.personId) || 0) + a.hours);
    }
  }

  const fillHours = new Map<number, number>();
  for (const p of ctx.people) {
    if (p.scheduleType === "fixed") continue;           // los responsables no entran
    const extra = ctx.extraHours.filter((e) => e.personId === p.id).reduce((t, e) => t + e.hours, 0);
    const gap = ctx.settings.annualTargetHours - (worked.get(p.id) || 0) - extra;
    if (gap > 0) fillHours.set(p.id, gap);
  }
  if (!fillHours.size) return base;

  return generateSchedule(ctx, from, to, {
    fillHours,
    maxConsecutiveDays: opts?.maxConsecutiveDays,
  });
}
