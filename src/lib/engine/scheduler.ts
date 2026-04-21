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
  const offP = getOffPerson(weekNum, ctx.people);
  const weP = getWeekendWorker(weekNum, ctx.people);

  // Real hours for balancing (weekday*8 + weekend*12)
  const realH = (pid: number) =>
    (counts.weekday.get(pid) || 0) * 8 + (counts.weekend.get(pid) || 0) * 12;

  // Available = everyone except OFF, and not blocked for the week
  let available = ctx.people.filter(
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

export function generateSchedule(ctx: EngineContext, from: string, to: string): DaySchedule[] {
  const dates = iterateDates(from, to);
  const schedule: DaySchedule[] = [];
  const blockedDates = buildBlockedDates(ctx);
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

  // Refuerzo budget
  const BUFFER_HOURS = 40;
  const refUsed = new Map<number, number>();
  for (const p of ctx.people) refUsed.set(p.id, 0);
  // Rough budget per person: target - estimated base - extra - buffer
  const refBudget = new Map<number, number>();
  for (const p of ctx.people) {
    const extra = ctx.extraHours.filter((e) => e.personId === p.id).reduce((s, e) => s + e.hours, 0);
    // ~200 weekday shifts * 8h + ~26 weekends * 12h ≈ 1912h base (will cap with budget)
    refBudget.set(p.id, Math.max(0, ctx.settings.annualTargetHours - 1400 - extra - BUFFER_HOURS));
  }

  // Cache week plans
  const weekPlans = new Map<number, WeekPlan>();
  let saturdayPerson: EnginePerson | null = null;

  for (const date of dates) {
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
        return { personId: to.personId, personCode: p?.code || "?", personName: p?.name || "?", personColor: p?.color || "#9ca3af", type: to.type };
      })
      .filter((to) => {
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
        person = plan.weekendPerson;
        if (person && isBlocked(blockedDates, person.id, date)) {
          const avail = ctx.people.filter((p) => !isBlocked(blockedDates, p.id, date) && p.id !== plan.offPerson?.id);
          avail.sort((a, b) => (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0));
          person = avail[0] || null; source = "balance";
        }
        if (!isWH) saturdayPerson = person;
      } else {
        person = saturdayPerson || plan.weekendPerson;
        if (person && isBlocked(blockedDates, person.id, date)) {
          const avail = ctx.people.filter((p) => !isBlocked(blockedDates, p.id, date));
          avail.sort((a, b) => (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0));
          person = avail[0] || null; source = "balance";
        }
      }

      if (person) {
        day.assignments.push(makeAssignment(date, weekendShift, person, 0, source));
        counts.weekend.set(person.id, (counts.weekend.get(person.id) || 0) + 1);
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
            const avail = ctx.people.filter((p) => !isBlocked(blockedDates, p.id, date) && !assigned.has(p.id));
            avail.sort((a, b) => (counts.weekend.get(a.id) || 0) - (counts.weekend.get(b.id) || 0));
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

      const todayPool = ctx.people.filter(
        (p) => p.id !== plan.offPerson?.id && !isBlocked(blockedDates, p.id, date)
      );

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
            (to) => to.personId === pid && to.startDate <= date && to.endDate >= date
          );
          const cands = ctx.people.filter(
            (p) => p.id !== plan.offPerson?.id && !hasTimeOffToday(p.id) && !assigned.has(p.id)
          );
          // Sort by real accumulated hours (lowest first = gets the refuerzo)
          cands.sort((a, b) => {
            const ha = (counts.weekday.get(a.id) || 0) * 8 + (counts.weekend.get(a.id) || 0) * 12;
            const hb = (counts.weekday.get(b.id) || 0) * 8 + (counts.weekend.get(b.id) || 0) * 12;
            return ha - hb;
          });
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
            if (f && !assigned.has(f.id) && (refUsed.get(f.id) || 0) + refH <= (refBudget.get(f.id) || 0)) {
              ep = f; es = "event";
            }
          }
          if (!ep) {
            const avail = ctx.people.filter(
              (p) => !isBlocked(blockedDates, p.id, date) && !assigned.has(p.id) &&
                (refUsed.get(p.id) || 0) + refH <= (refBudget.get(p.id) || 0)
            );
            avail.sort((a, b) => (counts.weekday.get(a.id) || 0) - (counts.weekday.get(b.id) || 0));
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

    // Compute offPeople
    if (!closed) {
      const assignedIds = new Set(day.assignments.map((a) => a.personId).filter(Boolean));
      const timeOffIds = new Set(day.timeOffs.map((t) => t.personId));
      day.offPeople = ctx.people
        .filter((p) => !assignedIds.has(p.id) && !timeOffIds.has(p.id))
        .map((p) => ({ personId: p.id, personCode: p.code, personName: p.name, personColor: p.color }));
    }

    schedule.push(day);
  }

  return schedule;
}
