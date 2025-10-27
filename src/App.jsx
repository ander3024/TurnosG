import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";

import WeekendAuditPanel from "./components/WeekendAuditPanel";

function renderEmptyCell(toType, isClosed){
  if (toType === 'vacaciones') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] bg-emerald-50 text-emerald-700">
        🏖 Vacaciones
      </span>
    );
  }
  if (toType) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] bg-amber-50 text-amber-700">
        {toType}
      </span>
    );
  }
  if (isClosed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] bg-transparent">
        🎌 Festivo
      </span>
    );
  }
  return (<span className="text-[11px] text-slate-400">—</span>);
}

// === Defaults para autoload de usuarios no-admin ===
const PUBLIC_SPACE = { id: "turnos-2025", readToken: "READ-2025" };

// ===================== Config API (proxy Apache → Flask) =====================
const API_BASE = "/api";

// ===================== Helper fetch con/ sin JWT =====================
async function api(path, opts = {}, token = "", extraHeaders = {}) {
  const headers = { ...(opts.headers || {}), ...extraHeaders };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${txt}`);
  }
  return res.json();
}

// ===================== Utilidades fecha/hora =====================
function toDateValue(d) { const pad=(n)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDateValue(v){ const [y,m,d]=v.split('-').map(Number); return new Date(y,m-1,d); }
function addDays(date, days){ const d=new Date(date); d.setDate(d.getDate()+days); return d; }
function startOfWeekMonday(date){ const d=new Date(date); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d; }
function isWeekend(date){ const dow=date.getDay(); return dow===6 || dow===0; }
function minutesFromHHMM(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+(m||0); }
function minutesDiff(a,b){ return minutesFromHHMM(b)-minutesFromHHMM(a); }
function effectiveMinutes(shift){
  const raw = minutesDiff(shift.start, shift.end);
  const lunch = Math.max(0, Number(shift.lunchMinutes||0));
  return Math.max(0, raw - lunch);
}
function formatSpan(a,b){ return `${a}–${b}`; }

// ===================== Catálogos / Festivos 2025 =====================
const HOLIDAYS_2025 = {
  "Madrid": [
    "2025-01-01","2025-01-06","2025-03-20","2025-04-17","2025-05-01","2025-05-02",
    "2025-07-25","2025-08-15","2025-10-12","2025-12-25"
  ],
  "Barcelona": [
    "2025-01-01","2025-01-06","2025-04-17","2025-04-21","2025-05-01","2025-06-24","2025-08-15","2025-09-11","2025-10-12","2025-11-01","2025-12-06","2025-12-08","2025-12-25","2025-12-26"
  ],
};

// ===================== Persistencia local =====================
const STORAGE_KEY = "gestor-turnos-4p-v10";
function usePersistentState(defaultValue){
  const [state,setState]=useState(()=>{ try{ const raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):defaultValue; }catch{ return defaultValue; } });
  useEffect(()=>{ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{} },[state]);
  return [state,setState];
}

// ===================== Helpers varios =====================
function expandRange(s,e){ const S=parseDateValue(s), E=parseDateValue(e); const out=[]; for(let d=new Date(S); d<=E; d=addDays(d,1)) out.push(toDateValue(d)); return out; }
function isHolidayDate(dateStr, province){
  const list = HOLIDAYS_2025[province] || [];
  const y = Number(dateStr.slice(0,4));
  const win = (typeof window!=="undefined") ? window : {};
  const custom = (win.__CUSTOM_HOLIDAYS__ && Array.isArray(win.__CUSTOM_HOLIDAYS__[y])) ? win.__CUSTOM_HOLIDAYS__[y] : [];
  return list.includes(dateStr) || custom.includes(dateStr);
}
// Día cerrado por política (festivo oficial + cierres extra)
function isHolidayDateWithCustom(dateStr, province, customByYear){
  const list = HOLIDAYS_2025[province] || [];
  const y = Number(dateStr.slice(0,4));
  const custom = (customByYear && Array.isArray(customByYear[y])) ? customByYear[y] : [];
  return list.includes(dateStr) || custom.includes(dateStr);
}
function isClosedBusinessDay2(dateStr, province, closeOnHolidays=true, closedExtraDates=[], customByYear={}){
  const extra = Array.isArray(closedExtraDates) ? new Set(closedExtraDates) : new Set();
  if (extra.has(dateStr)) return true;
  if (closeOnHolidays && isHolidayDateWithCustom(dateStr, province, customByYear)) return true;
  return false;
}
function isClosedBusinessDay(dateStr, province, closeOnHolidays=true, closedExtraDates=[]){
  const extra = Array.isArray(closedExtraDates) ? new Set(closedExtraDates) : new Set();
  if (extra.has(dateStr)) return true;
  if (closeOnHolidays && isHolidayDate(dateStr, province)) return true;
  return false;
}

function countVacationDaysConsideringHolidays(s, e, province, consume){
  // Lee posibles festivos personalizados desde window si no nos llega por props
  const win = (typeof window!=="undefined") ? window : {};
  const custom = win.__CUSTOM_HOLIDAYS__ || {};
  const dates = expandRange(s,e);
  let total = 0;
  for(const d of dates){
    const dow = parseDateValue(d).getDay(); // 0=Dom .. 6=Sáb
    if(dow===0 || dow===6) continue; // solo laborables L–V
    const isFest = isHolidayDateWithCustom(d, province, custom);
    if(!consume && isFest) continue; // si no consumimos festivos, saltar
    total += 1;
  }
  return total;
}
function indexTimeOff(timeOffs, opts){
  const map=new Map();
  const province = opts?.province || 'Madrid';
  const consume = !!opts?.consumeVacationOnHoliday;
  const custom = opts?.customHolidaysByYear || {};
  for(const t of timeOffs){
    const effective = (t.type==='libranza') || (t.status==='aprobada');
    if(!effective) continue;
    for(const d of expandRange(t.start,t.end)){
      // Regla: vacaciones solo bloquean L–V; en festivo solo si se consume
      if(t.type==='vacaciones'){ /* bloquea todos los días del rango; el cómputo de días consumidos se hace aparte */ }
      if(!map.has(t.personId)) map.set(t.personId,new Map());
      map.get(t.personId).set(d,{type:t.type,hoursPerDay:t.hoursPerDay||0});
    }
  }
  return map;
}


// --- Helpers fines de semana (consecutivos) ---
function saturdayOfWeekend(d){
  const dt = new Date(d);
  const day = dt.getDay(); // 6=Sat, 0=Sun
  const sat = new Date(dt);
  if(day===6){ /* sábado */ }
  else if(day===0){ sat.setDate(sat.getDate()-1); }
  else{
    const dm = (dt.getDay()+6)%7; // 0..6 (L..D)
    const off = 5 - dm; // 5 = sábado
    sat.setDate(sat.getDate()+off);
  }
  sat.setHours(0,0,0,0);
  return sat;
}
function weekendKeyStr(d){ return toDateValue(saturdayOfWeekend(d)); }
function workedOnWeekend(assignments, satStr, personId){
  const sat = assignments[satStr] || [];
  const sunStr = toDateValue(addDays(parseDateValue(satStr),1));
  const sun = assignments[sunStr] || [];
  return sat.some(a=>a.personId===personId) || sun.some(a=>a.personId===personId);
}
function countPrevConsecutiveWeekends(assignmentsSoFar, date, personId){
  // cuenta hacia atrás (sin contar el fin de semana actual)
  let c=0;
  const thisSat = saturdayOfWeekend(date);
  let sat = new Date(thisSat); sat.setDate(sat.getDate()-7);
  for(let i=0;i<60;i++){
    const satStr = toDateValue(sat);
    if(workedOnWeekend(assignmentsSoFar, satStr, personId)){ c++; sat.setDate(sat.getDate()-7); }
    else break;
  }
  return c;
}

// ===================== Reglas duras convenio =====================
function respectsRules({personId, date, shift, assignmentsSoFar, weeklyMinutes, weeklyDays, rules}){
  if(!rules?.enforce) return true;
  const mins = effectiveMinutes(shift);
  const dateStr = toDateValue(date);

  // Máx por día
  let alreadyToday = 0;
  for(const a of (assignmentsSoFar[dateStr]||[])){
    if(a.personId === personId){
      alreadyToday += effectiveMinutes(a.shift);
    }
  }
  if((alreadyToday + mins) > (rules.maxDailyHours*60)) return false;

  // Máx días/semana
  if(rules?.maxDaysPerWeek){
    const usedDays = (weeklyDays?.get(personId) || 0);
    if(usedDays >= rules.maxDaysPerWeek) return false;
  }

  // Máx por semana
  const usedWeek = weeklyMinutes.get(personId) || 0;
  if((usedWeek + mins) > (rules.maxWeeklyHours*60)) return false;

  // Descanso mínimo respecto al día previo
  const prevStr = toDateValue(addDays(date,-1));
  const prevAssigns = assignmentsSoFar[prevStr] || [];
  let prevEnd=null;
  for(const a of prevAssigns){
    if(a.personId===personId){
      const end=a.shift.end;
      if(!prevEnd || minutesFromHHMM(end)>minutesFromHHMM(prevEnd)) prevEnd=end;
    }
  }
  if(prevEnd){
    const restSame = minutesFromHHMM(shift.start)-minutesFromHHMM(prevEnd);
    const restCross = (minutesFromHHMM(shift.start)+24*60)-minutesFromHHMM(prevEnd);
    const rest = restSame>=0?restSame:restCross;
    if(rest < (rules.minRestHours*60)) return false;
  }
  return true;
}

// ===================== Planificador base =====================
function computeOffPersonId(people, w){ for(const p of people){ if(((w+(p.offset||0))%4)===3) return p.id; } return people[w%people.length].id; }
function pickBestCandidate(pool,{isWeekend,weekdaysLoad,weekendLoad,priorityMap}){
  if(pool.length===0) return null;
  const scored=pool.map(p=>{ const w=weekdaysLoad.get(p.id)||0; const we=weekendLoad.get(p.id)||0; const primary=isWeekend?we:w; const priority=priorityMap?(priorityMap.get(p.id)||0):0; return {id:p.id,primary,total:w+we,priority};});
  scored.sort((a,b)=> a.primary-b.primary || a.total-b.total || b.priority-a.priority || a.id.localeCompare(b.id));
  return scored[0].id;
}

function generateSchedule({ startDate, weeks, people, weekdayShifts, weekendShift, timeOffs, events, refuerzoWeekdayShift, priorityMap, overrides, rules, province, closeOnHolidays, closedExtraDates, customHolidaysByYear, consumeVacationOnHoliday }){
  const assignments={};
  const hoursPerPersonMin=new Map(people.map(p=>[p.id,0]));
  const weekdaysLoad=new Map(people.map(p=>[p.id,0]));
  const weekendLoad=new Map(people.map(p=>[p.id,0]));
  const timeOffIndex = indexTimeOff(timeOffs, { province, consumeVacationOnHoliday, customHolidaysByYear });
  // --- Forzados procedentes de eventos con assigneeForced=true ---
  const forceByDay = new Map(); // ds -> { key -> personId }
  for (const ev of (events||[])) {
    if (!ev.assigneeForced || !ev.assigneeId) continue;
    const days = expandRange(ev.start, ev.end);
    for (const ds of days) {
      const d   = parseDateValue(ds);
      const we  = (d.getDay()===0 || d.getDay()===6);
      const cnt = we ? (ev.weekendExtraSlots||0) : (ev.weekdaysExtraSlots||0);
      const base = we ? weekendShift : refuerzoWeekdayShift;

      const bucket = forceByDay.get(ds) || {};
      for (let j=0; j<cnt; j++){
        // IMPORTANTE: etiqueta EXACTA como la que se usa al crear los slots
        const baseLabel = we ? 'Refuerzo' : (refuerzoWeekdayShift.label || 'Refuerzo');
        const label = `${baseLabel} ${j+1}`;
        const key = `${base.start}-${base.end}-${label}`;
        bucket[key] = ev.assigneeId;
      }
      forceByDay.set(ds, bucket);
    }
  }

  // --- OFF condicionado por vacaciones (configurable) ---
  const OFFP = (typeof window !== "undefined" && window.__OFF_POLICY__) ? window.__OFF_POLICY__ : {};
  const VAC = (timeOffs||[]).filter(t=> t.type==='vacaciones' && t.status!=='denegada');
  function weekRange(startDate, w){
    const ws = addDays(startDate, w*7);
    const we = addDays(ws, 6);
    return { ws, we };
  }
  function weekOverlapsVac(w){
    const { ws, we } = weekRange(startDate, w);
    return VAC.some(t => !(parseDateValue(t.end) < ws || parseDateValue(t.start) > we));
  }
for(let w=0; w<weeks; w++){
    const weekStart=addDays(startDate,w*7);
    const offId=computeOffPersonId(people,w);

    // ¿Aplicar limitación de OFF esta semana?
    const limitDays = (OFFP.limitOffDays && OFFP.limitOffDays.length) ? OFFP.limitOffDays : [3,4,5];
    const hasVac = OFFP.enableLimitOffOnVacationWeek ? weekOverlapsVac(w) : false;
    let adjVac = false;
    if (OFFP.enableBlockFullOffAdjacentWeeks){
      const win = Math.max(1, OFFP.adjacencyWindow || 1);
      for (let k=1; k<=win; k++){
        if (w-k>=0 && weekOverlapsVac(w-k)) { adjVac = true; break; }
        if (w+k<weeks && weekOverlapsVac(w+k)) { adjVac = true; break; }
      }
    }
    const offLimitedThisWeek = !!(hasVac || adjVac);
const nextOff=computeOffPersonId(people,w+1);
    const weeklyMinutes = new Map(people.map(p=>[p.id,0]));
    const weeklyDays = new Map(people.map(p=>[p.id,0]));
    // Set con quienes trabajaron el finde anterior (para evitar consecutivos)
    const prevWeekendWorkers = new Set();
    if (w > 0 && (rules?.maxConsecutiveWeekends ?? 1) > 0){
      const prevStart = addDays(startDate,(w-1)*7);
      // Sábado
      const satStr = toDateValue(addDays(prevStart,5));
      for(const a of (assignments[satStr]||[])){ if(a.personId) prevWeekendWorkers.add(a.personId); }
      // Domingo
      const sunStr = toDateValue(addDays(prevStart,6));
      for(const a of (assignments[sunStr]||[])){ if(a.personId) prevWeekendWorkers.add(a.personId); }
    }

    for(let d=0; d<7; d++){
      const date=addDays(weekStart,d); const dateStr=toDateValue(date); const isWE=isWeekend(date);
      // Día cerrado por festivo/cierre extra → no se programan turnos
      if (isClosedBusinessDay2(dateStr, province, closeOnHolidays, closedExtraDates, customHolidaysByYear)) {
        assignments[dateStr] = [];
        continue;
      }
      
      // decide si el offId puede librar HOY:
      const dayIdx = date.getDay(); // 0=Dom..6=Sáb
      const offAllowedToday = offLimitedThisWeek ? limitDays.includes(dayIdx) : true;
      const working = people.filter(p => p.id !== offId || !offAllowedToday);
      const mustWorkOffToday = !offAllowedToday;
let required = isWE? [{...weekendShift}] : [...weekdayShifts];

      // Refuerzos en calendario de eventos
      const active=events.filter(ev=> parseDateValue(ev.start)<=date && date<=parseDateValue(ev.end));
      if(active.length){
        const extraW = active.reduce((a,ev)=> a + (ev.weekdaysExtraSlots||0), 0);
        // Para fines de semana, NO contar weekendExtraSlots de eventos de conciliación
        const extraWE = active.reduce((a,ev)=> a + ((ev.meta && ev.meta.source==='conciliacion') ? 0 : (ev.weekendExtraSlots||0)), 0);
        if(isWE && extraWE>0){ for(let i=0;i<extraWE;i++) required.push({...weekendShift,label:`Refuerzo ${i+1}`}); }
        if(!isWE && extraW>0){
          const baseLabel = refuerzoWeekdayShift.label || 'Refuerzo';
          for(let i=0;i<extraW;i++){
            required.push({...refuerzoWeekdayShift, label: `${baseLabel} ${i+1}`});
          }
        }
      }
      const dayAssignments=[]; const assigned=new Set();
      assignments[dateStr] = assignments[dateStr] || [];

      // Fijar titular finde (S+D) priorizando quien tendrá OFF la semana sig.
      let weekendFixedId=null;
      if(isWE){
        if(date.getDay()===6){ // sábado
          const pref=working.find(p=>p.id===nextOff);
          const ok=pref && !timeOffIndex.get(pref.id)?.has(dateStr) && !timeOffIndex.get(pref.id)?.has(toDateValue(addDays(date,1)));
          if(ok) weekendFixedId=pref.id; else{
            const cands=working.filter(p=> !timeOffIndex.get(p.id)?.has(dateStr) && !timeOffIndex.get(p.id)?.has(toDateValue(addDays(date,1))));
            weekendFixedId=pickBestCandidate(cands,{isWeekend:true,weekdaysLoad,weekendLoad,priorityMap});
          }
          generateSchedule._carry={ sunday: toDateValue(addDays(date,1)), personId: weekendFixedId };
        } else { // domingo
          const carry=generateSchedule._carry; if(carry && carry.sunday===dateStr){ const p=people.find(pp=>pp.id===carry.personId); if(p && !timeOffIndex.get(p.id)?.has(dateStr)) weekendFixedId=p.id; }
        }
      }

      for(let s=0; s<required.length; s++){
        const shift=required[s]; const key=`${shift.start}-${shift.end}-${shift.label||`T${s+1}`}`;

        // Candidatos básicos
        let pool=working
          .filter(p=>!assigned.has(p.id))
          .filter(p=> !(timeOffIndex.get(p.id)?.has(dateStr)));

        // Reglas duras
        // Evitar findes consecutivos si hay alternativas
        if (isWE && (rules?.maxConsecutiveWeekends ?? 1) > 0) {
          const alt = pool.filter(px => !prevWeekendWorkers.has(px.id));
          if (alt.length > 0) pool = alt;
        }

        pool = pool.filter(p => respectsRules({ personId:p.id, date, shift, assignmentsSoFar: assignments, weeklyMinutes, weeklyDays, rules }));

        // Overrides y preferencia finde
        let chosen = null;
        let forced = overrides?.[dateStr]?.[key];

        if (!forced) {
          const fb = forceByDay.get(dateStr);
          if (fb?.[key]) forced = fb[key];
        }
          if (forced) {
            // si ya está asignado hoy, ignora este forced (evita duplicar a la misma persona)
            if (assigned.has(forced)) {
              // sigue el flujo normal sin aplicar el forced duplicado
            } else {
              chosen = forced;
            }
          } else {
          if (!chosen && mustWorkOffToday && pool.some(p => p.id === offId)) chosen = offId;
          else if (isWE && s === 0 && weekendFixedId && pool.some(p => p.id === weekendFixedId)) chosen = weekendFixedId;
          else if (isWE && s === 0 && !weekendFixedId) {
            const prefer = pool.find(p => p.id === nextOff);
            chosen = prefer?.id || pickBestCandidate(pool, { isWeekend: isWE, weekdaysLoad, weekendLoad, priorityMap });
          } else {
            chosen = pickBestCandidate(pool, { isWeekend: isWE, weekdaysLoad, weekendLoad, priorityMap });
          }
        }

        // Salvaguarda
        if (chosen && timeOffIndex.get(chosen)?.has(dateStr)) {
          chosen = null;
        }
      
        if(chosen){
          assigned.add(chosen);
          const mins = effectiveMinutes(shift);
          weeklyMinutes.set(chosen,(weeklyMinutes.get(chosen)||0)+mins);
          weeklyDays.set(chosen,(weeklyDays.get(chosen)||0)+1);
          hoursPerPersonMin.set(chosen,(hoursPerPersonMin.get(chosen)||0)+mins);
          if(isWE) weekendLoad.set(chosen,(weekendLoad.get(chosen)||0)+1); else weekdaysLoad.set(chosen,(weekdaysLoad.get(chosen)||0)+1);
          dayAssignments.push({shift, personId:chosen, conflict:false});
        } else {
          dayAssignments.push({shift, personId:null, conflict:true});
        }
      }

      // Créditos por viaje
      for(const p of working){ const entry=timeOffIndex.get(p.id)?.get(dateStr); if(entry?.type==='viaje'){ hoursPerPersonMin.set(p.id,(hoursPerPersonMin.get(p.id)||0)+(entry.hoursPerDay||0)*60); } }

      assignments[dateStr] = dayAssignments;
    }
  }
  return { assignments, hoursPerPersonMin };
}

// ===================== Conciliación (soft) + Picos + Propuestas =====================

// ¿Trabaja la persona en esa fecha?
function dayWorks(assignments, dateStr, personId){
  const cell = assignments[dateStr] || [];
  return cell.some(a => a.personId === personId);
}

// Fallback de pesos por si vienen vacíos desde localStorage/nube
function safeConciliacion(c){
  const def = { penalizaDiaIslaTrabajo:3, penalizaDiaIslaLibre:2, penalizaCortesSemana:1, penalizaFinDeSemanaExtra:1, penalizaFinesConsecutivos:2 };
  return c ? { ...def, ...c } : def;
}

// Score de conciliación

function scoreConciliacion({assignments, people, startDate, weeks, conciliacion}){
  conciliacion = safeConciliacion(conciliacion);
  let score = 0;

  // cortes e islas
  for (const p of people){
    for (let w=0; w<weeks; w++){
      const weekDays = [...Array(7)].map((_,i)=> toDateValue(addDays(startDate, w*7+i)));
      const works = weekDays.map(ds => dayWorks(assignments, ds, p.id) ? 1 : 0);

      for (let i=1;i<7;i++){
        if (works[i] !== works[i-1]) score += conciliacion.penalizaCortesSemana;
      }
      for (let i=1;i<6;i++){
        if (works[i-1]===0 && works[i]===1 && works[i+1]===0) score += conciliacion.penalizaDiaIslaTrabajo;
        if (works[i-1]===1 && works[i]===0 && works[i+1]===1) score += conciliacion.penalizaDiaIslaLibre;
      }
    }
  }

  // penalización soft por fines de semana (extra y consecutivos)
  if (conciliacion.penalizaFinDeSemanaExtra || conciliacion.penalizaFinesConsecutivos){
    for (const p of people){
      let totalWE = 0;
      let consec = 0;
      for (let w=0; w<weeks; w++){
        const sat = toDateValue(addDays(startDate, w*7+5));
        const sun = toDateValue(addDays(startDate, w*7+6));
        const workedWE = dayWorks(assignments, sat, p.id) || dayWorks(assignments, sun, p.id);
        if (workedWE){ totalWE++; consec++; } else { consec=0; }
        if (consec >= 3) score += (conciliacion.penalizaFinesConsecutivos||0);
      }
      if (totalWE > 3) score += (totalWE - 3) * (conciliacion.penalizaFinDeSemanaExtra||0);
    }
  }

  return score;
}

// Desglose por semana del score de conciliación (cortes/islas)
function scoreConciliacionBreakdown({assignments, people, startDate, weeks, conciliacion}){
  conciliacion = safeConciliacion(conciliacion);
  let total = 0;
  const byWeek = [];

  for (let w=0; w<weeks; w++){
    let cortes = 0, islasTrabajo = 0, islasLibre = 0;

    for (const p of people){
      const weekDays = [...Array(7)].map((_,i)=> toDateValue(addDays(startDate, w*7+i)));
      const works = weekDays.map(ds => dayWorks(assignments, ds, p.id) ? 1 : 0);

      // +1 por cada corte trabajo<->libre dentro de la semana
      for (let i=1; i<7; i++){
        if (works[i] !== works[i-1]) cortes++;
      }
      // día isla trabajo = 0-1-0 ; día isla libre = 1-0-1
      for (let i=1; i<6; i++){
        if (works[i-1]===0 && works[i]===1 && works[i+1]===0) islasTrabajo++;
        if (works[i-1]===1 && works[i]===0 && works[i+1]===1) islasLibre++;
      }
    }

    const score = cortes*conciliacion.penalizaCortesSemana
                + islasTrabajo*conciliacion.penalizaDiaIslaTrabajo
                + islasLibre*conciliacion.penalizaDiaIslaLibre;

    total += score;
    byWeek.push({ week: w+1, cortes, islasTrabajo, islasLibre, score });
  }

  return { total, byWeek };
}

// Mejoras locales (micro-swaps en el mismo día)
function improveConciliation({
  assignments, people, startDate, weeks, overrides, conciliacion,
  timeOffs = [], province="Madrid", consumeVacationOnHoliday=false, customHolidaysByYear={},
  events = [], weekendShift = {start:'10:00',end:'22:00'}, refuerzoWeekdayShift = {start:'12:00',end:'20:00', label:'Refuerzo'}
}){
  conciliacion = safeConciliacion(conciliacion);

  // --- CLAVES FORZADAS DESDE EVENTOS (assigneeForced=true) ---
  const forcedKeysByDay = new Map(); // ds -> Set(keys)
  for (const ev of (events||[])) {
    if (!ev.assigneeForced || !ev.assigneeId) continue;
    const days = expandRange(ev.start, ev.end);
    for (const ds of days) {
      const d = parseDateValue(ds);
      const we = (d.getDay()===0 || d.getDay()===6);
      const cnt = we ? (ev.weekendExtraSlots||0) : (ev.weekdaysExtraSlots||0);
      const base = we ? weekendShift : refuerzoWeekdayShift;
      const set = forcedKeysByDay.get(ds) || new Set();
      for (let j=0; j<cnt; j++){
        const baseLabel = we ? 'Refuerzo' : (refuerzoWeekdayShift.label || 'Refuerzo');
        const label = `${baseLabel} ${j+1}`;
        set.add(`${base.start}-${base.end}-${label}`);
      }
      forcedKeysByDay.set(ds, set);
    }
  }

  const best = JSON.parse(JSON.stringify(assignments));
  const indexTO = indexTimeOff(timeOffs, { province, consumeVacationOnHoliday, customHolidaysByYear });
  let bestScore = scoreConciliacion({assignments:best, people, startDate, weeks, conciliacion});

  for (let w=0; w<weeks; w++){
    for (let d=0; d<7; d++){
      const dateStr = toDateValue(addDays(startDate, w*7+d));
      const cell = best[dateStr] || [];
      for (let i=0;i<cell.length;i++){
        const A = cell[i];
        if (!A.personId) continue;

        const key = `${A.shift.start}-${A.shift.end}-${A.shift.label||`T${i+1}`}`;
        // Respeta tanto overrides manuales como forzados por evento
        if (overrides?.[dateStr]?.[key]) continue;
        if (forcedKeysByDay.get(dateStr)?.has(key)) continue;

        const usedToday = new Set((best[dateStr]||[]).filter(x=>!!x.personId).map(x=>x.personId));

        for (const p2 of people){
          if (p2.id === A.personId) continue;
          if (indexTO.get(p2.id)?.has(dateStr)) continue;
          if (usedToday.has(p2.id)) continue;
          const oldPid = A.personId;
          A.personId = p2.id;
          const newScore = scoreConciliacion({assignments:best, people, startDate, weeks, conciliacion});
          if (newScore < bestScore){ bestScore = newScore; } else { A.personId = oldPid; }
        }
      }
    }
  }
  return best;
}

// Picos
function thanksgivingDate(year){ let d = new Date(year,10,1); while(d.getDay()!==4) d.setDate(d.getDate()+1); d.setDate(d.getDate()+21); return d; }
function blackFridayDate(year){ const t = thanksgivingDate(year); const bf = new Date(t); bf.setDate(bf.getDate()+1); return bf; }
function dstr(d){ return toDateValue(d); }
function generarPicosParaAnio(year){
  const eventos = [];
  const bf = blackFridayDate(year); const bfSat = addDays(bf,1), bfSun = addDays(bf,2);
  eventos.push({ label:`Black Friday ${year}`, start: dstr(bf), end: dstr(bf), weekdaysExtraSlots: 2, weekendExtraSlots: 0 });
  eventos.push({ label:`BF Weekend ${year}`, start: dstr(bfSat), end: dstr(bfSun), weekdaysExtraSlots: 0, weekendExtraSlots: 1 });
  const d15 = new Date(year,11,15), d31 = new Date(year,11,31);
  eventos.push({ label:`Navidad ${year}`, start: dstr(d15), end: dstr(d31), weekdaysExtraSlots: 1, weekendExtraSlots: 1 });
  const ene2 = new Date(year+1,0,2), ene6 = new Date(year+1,0,6);
  eventos.push({ label:`Reyes ${year+1}`, start: dstr(ene2), end: dstr(ene6), weekdaysExtraSlots: 1, weekendExtraSlots: 1 });
  const rebEneIni = new Date(year+1,0,7), rebEneFin = new Date(year+1,0,20);
  eventos.push({ label:`Rebajas Invierno ${year+1}`, start: dstr(rebEneIni), end: dstr(rebEneFin), weekdaysExtraSlots: 1, weekendExtraSlots: 1 });
  const rebJulIni = new Date(year,6,1), rebJulFin = new Date(year,6,15);
  eventos.push({ label:`Rebajas Verano ${year}`, start: dstr(rebJulIni), end: dstr(rebJulFin), weekdaysExtraSlots: 1, weekendExtraSlots: 1 });
  return eventos;
}

// Propuestas para cerrar horas con conciliación
function horasPeriodoPorPersona(assignments, people){
  const map = new Map(people.map(p=>[p.id,0]));
  for (const ds of Object.keys(assignments)){
    for (const a of (assignments[ds]||[])){
      if (!a.personId) continue;
      map.set(a.personId, map.get(a.personId) + effectiveMinutes(a.shift));
    }
  }
  return map;
}

// --- Helpers de capacidad diaria ---

function weekIndexFromDate(startDate, dateStr){
  const d0 = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const d  = parseDateValue(dateStr);
  const diff = Math.floor((d - d0) / (24*3600*1000));
  return Math.floor(diff / 7);
}

function countExtrasForDate(events, dateStr, isWE){
  // suma extras que aplican ese día
  let wExtra = 0, weExtra = 0;
  for (const ev of (events||[])){
    if (parseDateValue(ev.start) <= parseDateValue(dateStr) && parseDateValue(dateStr) <= parseDateValue(ev.end)){
      wExtra  += (ev.weekdaysExtraSlots||0);
      weExtra += (ev.weekendExtraSlots||0);
    }
  }
  return isWE ? weExtra : wExtra;
}

function peopleAvailableThatDay({people, startDate, dateStr, timeOffs}){
  // Excluye persona OFF esa semana y quien tenga time off ese día
  const w = weekIndexFromDate(startDate, dateStr);
  const offId = computeOffPersonId(people, w);
  const set = new Set(people.map(p=>p.id));
  set.delete(offId);

  const indexTO = indexTimeOff(timeOffs); // { personId -> {dateStr -> ...} }
  for (const p of people){
    if (indexTO.get(p.id)?.has(dateStr)) set.delete(p.id);
  }
  return set.size;
}

// Propuesta para cerrar horas CON CAPACIDAD (no generará días "pendientes")
function proponerCierreHoras({
  assignments, people, startDate, weeks, annualTarget,
  baseShift={start:'12:00',end:'20:00'},
  weekdayShifts = [{start:'10:00',end:'18:00'}], // por si no pasas, usa 1 turno por defecto
  weekendShift = {start:'10:00',end:'22:00'},
  events = [],
  timeOffs = [], policy = { allowedMonths:[], includeSaturdays:false, maxPerWeekPerPerson:1, maxPerMonthPerPerson:4 }}){
  // helpers inyectados para límites por semana/mes
  const weekKey = (ds, pid) => {
    const d = parseDateValue(ds);
    const y = d.getFullYear();
    const jan4 = new Date(y,0,4);
    const week1Mon = new Date(jan4.getFullYear(),0,4 - ((jan4.getDay()+6)%7));
    const wk = Math.floor((d - week1Mon)/(7*24*3600*1000)) + 1;
    return pid+'|'+y+'-'+wk;
  };
  const monthKey = (ds, pid) => {
    const d = parseDateValue(ds);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    return pid+'|'+y+'-'+m;
  };
  // minutos ya trabajados en el periodo
  const minPorPersona = horasPeriodoPorPersona(assignments, people);
  // ordena por quien más necesita
  const faltantes = people.map(p => ({
      id:p.id,
      need: Math.max(0, annualTarget*60 - (minPorPersona.get(p.id)||0))
    }))
    .sort((a,b)=> b.need - a.need);

  // capacidad por día (para no pasarnos)
  const propuestas = [];
  const weekCount = new Map();  // pid|YYYY-WW -> count
  const monthCount = new Map(); // pid|YYYY-MM -> count
  const proposedPerDay = new Map(); // ds -> count propuestos
  // pre-cálculo: nº de slots base por día (sin extras)
  function baseSlotsForDate(ds){
    const isWE = isWeekend(parseDateValue(ds));
    return isWE ? 1 : (weekdayShifts?.length || 1);
  }
  // asignados ahora mismo (ASS/assignments) ese día
  function currentSlotsCount(ds){
    const cell = assignments[ds] || [];
    return cell.length;
  }

  // recorrido por necesidad
  for (const fp of faltantes){
    let need = fp.need; if (need <= 0) continue;

    for (let w=0; w<weeks && need>0; w++){
      for (let d=0; d<5 && need>0; d++){ // L–V (sin fines de semana)
        const ds = toDateValue(addDays(startDate, w*7+d));
        const isWE = isWeekend(parseDateValue(ds));

        // si la persona ya trabaja ese día, no proponer (evitamos islas)
        const yaTrabaja = (assignments[ds]||[]).some(c=>c.personId===fp.id);
        if (yaTrabaja) continue;

        // capacidad del día:
        const personasDisponibles = peopleAvailableThatDay({people, startDate, dateStr: ds, timeOffs});
        const extrasExistentes    = countExtrasForDate(events, ds, isWE); // extras ya en calendario
        const baseSlots           = baseSlotsForDate(ds);
        const yaAsignados         = currentSlotsCount(ds);
        const yaPropuestos        = proposedPerDay.get(ds) || 0;

        // Máximo que podría soportar el día SIN dejar "pendiente":
        // disponibles >= (slots_base + extras_existentes + ya_propuestos + NUEVO)
        
        // Capacidad real: personas libres menos (ya asignados + ya propuestos)
        const capacidadLibre = personasDisponibles - (yaAsignados + yaPropuestos);
        if (capacidadLibre <= 0) continue; // no cabe ni uno más

        // Política: meses permitidos
        {
          const month = parseDateValue(ds).getMonth()+1;
          const allowed = Array.isArray(policy.allowedMonths) && policy.allowedMonths.length>0 ? policy.allowedMonths : null;
          if (allowed && !allowed.includes(month)) continue;
        }
        // Política: incluir sábados
        {
          const weekday = parseDateValue(ds).getDay(); // 0=Dom .. 6=Sáb
          if (!policy.includeSaturdays && weekday===6) continue;
        }
        // Topes por semana/mes por persona
        {
          const wkK = weekKey(ds, fp.id);
          const moK = monthKey(ds, fp.id);
          const wCnt = weekCount.get(wkK)||0;
          const mCnt = monthCount.get(moK)||0;
          const wCap = Math.max(0, Number(policy.maxPerWeekPerPerson||0));
          const mCap = Math.max(0, Number(policy.maxPerMonthPerPerson||0));
          if (wCap && wCnt >= wCap) continue;
          if (mCap && mCnt >= mCap) continue;
        }
        // ok, proponemos 1 refuerzo ese día para esta persona
        propuestas.push({ dateStr: ds, personId: fp.id, shift: baseShift, label: 'Refuerzo conciliación' });
        weekCount.set(weekKey(ds, fp.id), (weekCount.get(weekKey(ds, fp.id))||0)+1);
        monthCount.set(monthKey(ds, fp.id), (monthCount.get(monthKey(ds, fp.id))||0)+1);
        proposedPerDay.set(ds, yaPropuestos + 1);

        need -= minutesDiff(baseShift.start, baseShift.end);
      }
    }
  }

  // Convertimos propuestas en eventos por día: count propuestos -> weekdaysExtraSlots
  const eventosByDay = new Map(); // ds -> count
  for (const p of propuestas){
    const c = eventosByDay.get(p.dateStr) || 0;
    eventosByDay.set(p.dateStr, c+1);
  }
  const eventosSugeridos = [...eventosByDay.entries()].map(([ds,count]) => ({
    label: 'Refuerzo conciliación',
    start: ds,
    end: ds,
    weekdaysExtraSlots: count,
    weekendExtraSlots: 0
  }));

  return { propuestas, eventosSugeridos };
}

// ===================== App (UI completa con login + nube) =====================
export default function App(){
  // ---------- Auth (JWT) ----------
  const [auth, setAuth] = useState(() => {
    try { const saved = localStorage.getItem("turnos_auth"); return saved ? JSON.parse(saved) : { token:"", user:null }; }
    catch { return { token:"", user:null }; }
  });
  useEffect(()=>{ try{ localStorage.setItem("turnos_auth", JSON.stringify(auth)); }catch{} },[auth]);

  const [loginForm, setLoginForm] = useState({ email:"", password:"" });
  async function doLogin(e){ e?.preventDefault();
    const data = await api("/auth/login",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(loginForm) });
    setAuth({ token:data.token, user:data.user });
  }
  function doLogout(){
  try{ localStorage.removeItem("turnos_auth"); }catch(e){}
  setAuth({ token:"", user:null });
  // Evita renders intermedios inconsistentes tras logout
  setTimeout(()=>{ window.location.reload(); }, 0);
}
  
  // --- ui feedback (banner + toast) ---
  const [ui, setUI] = useState({ sync:null, toast:null });
  
  
  // Modal día (compartido)
  const [modalDay, setModalDay] = useState(null);
function showToast(msg){ setUI(prev=>({...prev, toast:msg})); setTimeout(()=>setUI(prev=>({...prev, toast:null})), 2000); }




  // --- permisos UI ---
  const isAdmin = auth.user?.role === 'admin';

  // ---------- Estado principal ----------
  const defaultStart = startOfWeekMonday(new Date());
  const [state,setState]=usePersistentState({
    people:[{id:"P1",name:"Persona A",color:"#1d4ed8",offset:0},{id:"P2",name:"Persona B",color:"#059669",offset:1},{id:"P3",name:"Persona C",color:"#d97706",offset:2},{id:"P4",name:"Persona D",color:"#dc2626",offset:3}],
    startDate: toDateValue(defaultStart), weeks: 8,
    annualTargetHours: 1560, vacationDaysNatural: 25, travelDefaultHours: 8,
    weekdayShifts:[{start:"10:00",end:"18:00",label:"Mañana",lunchMinutes:60},{start:"14:00",end:"22:00",label:"Tarde",lunchMinutes:0}],
    weekendShift:{start:"10:00",end:"22:00",label:"Finde"},
    refuerzoWeekdayShift:{start:"12:00",end:"20:00",label:"Refuerzo",lunchMinutes:60},
    events: [], timeOffs: [],
    security:{ adminPin:"1234", personPins:{P1:"1111",P2:"2222",P3:"3333",P4:"4444"} },
    rebalance:false,
    province:"Madrid", consumeVacationOnHoliday:false,
    closeOnHolidays: true,
    closedExtraDates: [],
    customHolidaysByYear: {},
    overrides:{},
    swaps: [], showArchivedSwaps:false,
    rules: { enforce:true, maxDailyHours:9, maxWeeklyHours:40, minRestHours:12, maxDaysPerWeek:5, maxConsecutiveWeekends:1 },
    applyConciliation: true,
    conciliacion: { penalizaDiaIslaTrabajo:3, penalizaDiaIslaLibre:2, penalizaCortesSemana:1, penalizaFinDeSemanaExtra:1, penalizaFinesConsecutivos:2 },
  
    offPolicy: {
      enableLimitOffOnVacationWeek: true,
      limitOffDays: [3,4,5], // X(3), J(4), V(5) -> getDay(): 0=Dom..6=Sáb
      enableBlockFullOffAdjacentWeeks: true,
      adjacencyWindow: 1
    },
    vacationPolicy: { mode:'allow', months:[7,8] },
    refuerzoPolicy:{ allowedMonths:[1,2,3,4,5,9,10,11,12], includeSaturdays:false,
      maxPerWeekPerPerson:1, maxPerMonthPerPerson:4, horizonDefault:'fin',
      goalFill:true, skipPast:true, maxEscalation:3, weekBoost:1, monthBoost:2 },
    managed:{ lastConciliationBatchId:null }
});

  function forceAssign(dateStr, assignmentIndex, personId){
  const a = ASS[dateStr]?.[assignmentIndex];
  if(!a) return;
  const key = `${a.shift.start}-${a.shift.end}-${a.shift.label||`T${assignmentIndex+1}`}`;
  const next = structuredClone(state.overrides || {});
  next[dateStr] = next[dateStr] || {};
  next[dateStr][key] = personId || null; // si pasas '', quita override
  up(['overrides'], next);
  up(['audit'], [ ...(state.audit||[]), { ts:new Date().toISOString(), actor:(auth.user?.email||'unknown'), action:'override', dateStr, assignmentIndex, personId } ]);
}

  // Sincroniza offPolicy con window para que generateSchedule lea la política activa
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__OFF_POLICY__ = state.offPolicy || {};
      window.__CUSTOM_HOLIDAYS__ = state.customHolidaysByYear || {};
    }
  }, [state.offPolicy, state.customHolidaysByYear]);

  // ---------- Cloud (SQLite) ----------
  const [cloud, setCloud] = useState({ spaceId:"turnos-2025", readToken:"READ-2025", writeToken:"WRT-1234", apiKey:"" });
  async function cloudLoad() { setUI(prev=>({...prev, sync:"loading"}));
    // (no-admin) intentamos cargar aunque no haya readToken; el backend decidirá
// // No cortamos a no-admin por falta de readToken; el backend decidirá.
// if (!isAdmin && !cloud.readToken) { showToast("Falta ReadToken"); setUI(prev=>({...prev, sync:"error"})); return; }
    try{
      const extra={}; if(cloud.apiKey) extra["X-API-Key"]=cloud.apiKey; if(cloud.readToken) extra["X-Read-Token"]=cloud.readToken;
      const data = await api(`/state/${encodeURIComponent(cloud.spaceId)}`, { method:"GET" }, auth.token, extra);
      if(!data.payload){ alert("No hay datos guardados para ese Space ID"); return; }
      const payload = { ...data.payload };
      payload.conciliacion = safeConciliacion(payload.conciliacion || {});
if (!payload.conciliacion) payload.conciliacion = safeConciliacion();
      if (typeof payload.applyConciliation === 'undefined') payload.applyConciliation = true;
      // Defaults de offPolicy si no existen en la nube
      if (!payload.offPolicy) {
        payload.offPolicy = {
          enableLimitOffOnVacationWeek: true,
          limitOffDays: [3,4,5], // X-J-V
          enableBlockFullOffAdjacentWeeks: true,
          adjacencyWindow: 1
        };
      }
      if (typeof window !== "undefined") window.__OFF_POLICY__ = payload.offPolicy || {};
      setState(prev=>({ ...prev, ...payload }));
      setUI(prev=>({...prev, sync:"ok"})); showToast("Cargado de nube");
    }catch(e){ setUI(prev=>({...prev, sync:"error"})); showToast((String(e.message||"")).startsWith("403")?"403: ReadToken inválido o sin permisos":"Error al cargar: "+e.message); }
  }
  async function cloudSave() { setUI(prev=>({...prev, sync:"loading"}));
    try{
      const headers={ "Content-Type":"application/json", "X-Write-Token": cloud.writeToken };
      if(cloud.apiKey) headers["X-API-Key"]=cloud.apiKey;
      const payload = state; // si quieres excluir PINs: const { security, ...payload } = state;
      const out = await api(`/state/${encodeURIComponent(cloud.spaceId)}`, { method:"PUT", headers, body: JSON.stringify({ payload, read_token: cloud.readToken || null }) }, auth.token);
      setUI(prev=>({...prev, sync:"ok"})); showToast("Guardado en nube");
    }catch(e){ setUI(prev=>({...prev, sync:"error"})); showToast((String(e.message||"")).startsWith("403")?"403: ReadToken inválido o sin permisos":"Error al cargar: "+e.message); }
  }

  // ---------- Utilidades de estado ----------
  // deep-set seguro (crea objetos intermedios)
  function up(path,value){
    setState(prev=>{
      const next = structuredClone(prev);
      let o = next;
      for (let i=0;i<path.length-1;i++){
        const k = path[i];
        if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
        o = o[k];
      }
      o[path[path.length-1]] = value; return next;
    });
  }
  function upPerson(id,patch){ setState(prev=>({...prev, people: prev.people.map(p=> p.id===id? {...p,...patch}:p)})); }

  // ---------- Generación de cuadrante ----------
  const startDate=useMemo(()=>parseDateValue(state.startDate),[state.startDate]);
  const base=useMemo(()=> generateSchedule({ startDate, weeks:state.weeks, people:state.people, weekdayShifts:state.weekdayShifts, weekendShift:state.weekendShift, timeOffs:state.timeOffs, events:state.events, refuerzoWeekdayShift:state.refuerzoWeekdayShift, overrides: state.overrides, rules: state.rules, province: state.province, closeOnHolidays: state.closeOnHolidays, closedExtraDates: state.closedExtraDates, customHolidaysByYear: state.customHolidaysByYear }), [state, startDate]);

  const baseControls=useMemo(()=> buildControls({
      assignments:base.assignments, people:state.people,
      weekdayShifts:state.weekdayShifts, weekendShift:state.weekendShift,
      hoursPerPersonMin:base.hoursPerPersonMin, annualTargetHours:state.annualTargetHours,
      startDate, weeks:state.weeks, vacationDaysNatural:state.vacationDaysNatural,
      timeOffs:state.timeOffs, province:state.province, consumeVacationOnHoliday:state.consumeVacationOnHoliday,
      events: state.events, refuerzoWeekdayShift: state.refuerzoWeekdayShift
    }), [base, state.people, state.weekdayShifts, state.weekendShift, state.annualTargetHours, startDate, state.weeks, state.vacationDaysNatural, state.timeOffs, state.province, state.consumeVacationOnHoliday]);

  const priorityMap=useMemo(()=>{ const m=new Map(); baseControls.rows.forEach(r=> m.set(r.id, Math.max(0,r.remaining))); return m; },[baseControls]);

  const { assignments } = useMemo(()=> state.rebalance
    ? generateSchedule({ startDate, weeks:state.weeks, people:state.people, weekdayShifts:state.weekdayShifts, weekendShift:state.weekendShift, timeOffs:state.timeOffs, events:state.events, refuerzoWeekdayShift:state.refuerzoWeekdayShift, priorityMap, overrides: state.overrides, rules: state.rules, province: state.province, closeOnHolidays: state.closeOnHolidays, closedExtraDates: state.closedExtraDates, customHolidaysByYear: state.customHolidaysByYear, consumeVacationOnHoliday: state.consumeVacationOnHoliday })
    : base, [state, startDate, base, priorityMap]);

  // Aplica mejorador de conciliación (evita días-isla y reduce cortes)
const assignmentsImproved = useMemo(()=> improveConciliation({
  assignments: JSON.parse(JSON.stringify(assignments)),
  people: state.people,
  startDate,
  weeks: state.weeks,
  overrides: state.overrides,
  conciliacion: safeConciliacion(state.conciliacion),
  timeOffs: state.timeOffs,
  province: state.province,
  consumeVacationOnHoliday: state.consumeVacationOnHoliday,
  customHolidaysByYear: state.customHolidaysByYear,
  events: state.events,
  weekendShift: state.weekendShift,
  refuerzoWeekdayShift: state.refuerzoWeekdayShift
}), [assignments, state.people, startDate, state.weeks, state.overrides, state.conciliacion,
    state.timeOffs, state.province, state.consumeVacationOnHoliday, state.customHolidaysByYear,
    state.events, state.weekendShift, state.refuerzoWeekdayShift]);

  // Usar ASS para pintar/expotar
  const ASS = state.applyConciliation ? assignmentsImproved : assignments;

  // Recalcular controles con ASS (para que refleje la vista final)
  const controls=useMemo(()=> buildControls({
      assignments:ASS, people:state.people,
      weekdayShifts:state.weekdayShifts, weekendShift:state.weekendShift,
      hoursPerPersonMin:new Map(), // no lo necesitamos aquí
      annualTargetHours:state.annualTargetHours,
      startDate, weeks:state.weeks, vacationDaysNatural:state.vacationDaysNatural,
      timeOffs:state.timeOffs, province:state.province, consumeVacationOnHoliday:state.consumeVacationOnHoliday
    }), [ASS, state.people, state.weekdayShifts, state.weekendShift, state.annualTargetHours, startDate, state.weeks, state.vacationDaysNatural, state.timeOffs, state.province, state.consumeVacationOnHoliday]);

  // ---------- Hooks que deben ejecutarse SIEMPRE ----------
  const [payroll,setPayroll]=useState({ from: state.startDate, to: toDateValue(addDays(startDate, state.weeks*7-1)) });
  const [weekIndex,setWeekIndex]=useState(0);
  const [userWeeks, setUserWeeks] = useState(1);
function goToday(){
    const t = startOfWeekMonday(new Date());
    const idx = Math.max(0, Math.min(state.weeks-1, Math.floor((t - startDate)/(7*24*3600*1000))));
    setWeekIndex(idx);
  }
  const weeklyStart=useMemo(()=> addDays(startDate, weekIndex*7), [startDate, weekIndex]);
  const canPrev=weekIndex>0, canNext=weekIndex<state.weeks-1, canNextRange=weekIndex<state.weeks-userWeeks;

  // ---------- Auth-only: login screen ----------
  

if (!auth.user || !auth.token) {
  // Renderiza el header una vez existen state/isAdmin/ui y handlers
  // Header como componente (recibe todo lo que necesita vía props)
  // Header como componente robusto: usa props y mapea state desde props
  function HeaderBar(props){
    const state = props?.state;
    const {
      setState, isAdmin, ui, cloud, setCloud,
      showToast, doLogout, exportCSV, exportJSON,
      importJSON, cloudLoad, cloudSave
    } = props || {};
    if (!state) return null;
    return (
<header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="w-full max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Gestor de Turnos · Usuarios + SQLite</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-slate-100 border">
              {auth.user?.name || auth.user?.email || "Usuario"} · {auth.user?.role || ""}
            </span>
            {isAdmin && (<button onClick={()=>setState(prev=>({...prev, rebalance:!prev.rebalance}))}
              className={`px-3 py-1.5 rounded-lg border ${state.rebalance?'bg-emerald-50 border-emerald-300':'border-slate-300 hover:bg-slate-100'}`}>
              {state.rebalance? 'Reequilibrio ON':'Reequilibrar'}
            </button>)}

            {/* Export/Import local */}{/* Controles Nube */}{isAdmin && (
<>
<>
            <button onClick={props.exportCSV} className="px-3 py-1.5 rounded-lg border">CSV</button>
            <button onClick={props.exportJSON} className="px-3 py-1.5 rounded-lg border">Export JSON</button>
            <label className="px-3 py-1.5 rounded-lg border cursor-pointer">Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files && props.importJSON(e.target.files[0])}/>
            </label>

            
</>
<input className="border rounded px-2 py-1 w-32" placeholder="Space ID"
              value={cloud.spaceId} onChange={e=>setCloud({...cloud,spaceId:e.target.value})}/>
            <input className="border rounded px-2 py-1 w-28" placeholder="ReadToken"
              value={cloud.readToken} onChange={e=>setCloud({...cloud,readToken:e.target.value})}/>
            <input className="border rounded px-2 py-1 w-28" placeholder="WriteToken"
              value={cloud.writeToken} onChange={e=>setCloud({...cloud,writeToken:e.target.value})}/>
            <button onClick={props.cloudLoad} className="px-3 py-1.5 rounded-lg border">Cargar nube</button>
            <button onClick={props.cloudSave} className="px-3 py-1.5 rounded-lg border">Guardar nube</button>
  </>
)}
{ui.sync==="loading" && <span className="px-2 py-1 rounded bg-amber-100 border border-amber-300">Sincronizando…</span>}
            {ui.sync==="ok" && <span className="px-2 py-1 rounded bg-emerald-100 border border-emerald-300">¡Listo!</span>}
            {ui.sync==="error" && <span className="px-2 py-1 rounded bg-rose-100 border border-rose-300">Error</span>}
            {ui.toast && (<div className="fixed right-4 bottom-4 z-50 bg-black text-white px-3 py-2 rounded-lg shadow">{ui.toast}</div>)}
            <button onClick={()=>props.setAuth({ token:"", user:null })} className="px-2 py-1 rounded border">Salir</button>
          </div>
        </div>
      </header>
    );
  }



    return (
      <div className="min-h-screen grid place-items-center bg-transparent text-slate-900">
        <div className="bg-white rounded-2xl shadow p-6 w-full max-w-sm border border-slate-200">
          <h1 className="text-lg font-semibold mb-4">Acceso · Gestor de Turnos</h1>
          <form className="space-y-3 max-h-72 overflow-auto" onSubmit={doLogin}>
            <div>
              <label className="text-xs">Email</label>
              <input type="email" required value={loginForm.email}
                onChange={e=>setLoginForm({...loginForm,email:e.target.value})}
                className="w-full px-3 py-2 rounded border" placeholder="tú@empresa.com" />
            </div>
            <div>
              <label className="text-xs">Contraseña</label>
              <input type="password" required value={loginForm.password}
                onChange={e=>setLoginForm({...loginForm,password:e.target.value})}
                className="w-full px-3 py-2 rounded border" placeholder="••••••••" />
            </div>
            <button className="w-full px-3 py-2 rounded-lg border hover:bg-slate-100">Entrar</button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            * Crea el admin con <code>POST /api/auth/init-admin</code> (ver backend).
          </p>
        </div>
      </div>
    );
  }

  // ---------- Exportaciones (CSV/ICS/Nómina) ----------
  function exportCSV(){
    const rows = buildCSV(ASS, state.people);
    const blob = new Blob([rows.join("\\n")], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `turnos_${state.startDate}_${state.weeks}w.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function exportJSON(){
    const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `turnos_backup_${state.startDate}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function importJSON(file){
    const r = new FileReader();
    r.onload = ()=>{ try{ setState(JSON.parse(r.result)); }catch{ alert('JSON inválido'); } };
    r.readAsText(file);
  }
  function exportICS(personId){
    const ics = buildICS({ assignments: ASS, people: state.people, personId, startDate, weeks: state.weeks });
    const blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `turnos_${personId}.ics`; a.click();
  }
  function exportPayroll(){
    const header=['persona','desde','hasta','horas_lv','horas_sd','horas_refuerzo','horas_totales'];
    const rows=[header.join(',')];
    const from = parseDateValue(payroll.from), to = parseDateValue(payroll.to);
    const days=[]; for(let d=new Date(from); d<=to; d=addDays(d,1)) days.push(toDateValue(d));
    const byPerson=new Map(state.people.map(p=>[p.id,{lv:0,sd:0,ref:0}]));
    for(const dateStr of days){
      const cell=ASS[dateStr]||[];
      for(const a of cell){
        if(!a.personId) continue;
        const dur = effectiveMinutes(a.shift)/60;
        const rec = byPerson.get(a.personId);
        const isWE = isWeekend(parseDateValue(dateStr));
        const isRef = (a.shift.label||'').toLowerCase().includes('refuerzo');
        if(isRef) rec.ref += dur; else if(isWE) rec.sd += dur; else rec.lv += dur;
      }
    }
    for(const p of state.people){
      const r=byPerson.get(p.id);
      const total=(r.lv+r.sd+r.ref).toFixed(1);
      rows.push([p.name,payroll.from,payroll.to,r.lv.toFixed(1),r.sd.toFixed(1),r.ref.toFixed(1),total].join(','));
    }
    const blob=new Blob([rows.join("\\n")],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`nomina_${payroll.from}_${payroll.to}.csv`;
    a.click();
  }

return (
  <AuthenticatedApp
  auth={auth}
  setAuth={setAuth}
  ui={ui}
  setUI={setUI}
  showToast={showToast}
  
  modalDay={modalDay}
  setModalDay={setModalDay}
state={state}
  setState={setState}
  cloud={cloud}
  setCloud={setCloud}
  cloudLoad={cloudLoad}
  cloudSave={cloudSave}
  startDate={startDate}
  weeklyStart={weeklyStart}
  userWeeks={userWeeks}
  setUserWeeks={setUserWeeks}
  weekIndex={weekIndex}
  setWeekIndex={setWeekIndex}
  canPrev={canPrev}
  canNext={canNext}
  canNextRange={canNextRange}
  payroll={payroll}
  setPayroll={setPayroll}
  ASS={ASS}
  controls={controls}
  exportCSV={exportCSV}
  exportJSON={exportJSON}
  importJSON={importJSON}
  exportICS={exportICS}
  exportPayroll={exportPayroll}
  up={up}
  upPerson={upPerson}
  forceAssign={forceAssign}
/>
);
}

// ===================== UI base =====================
function Card({title,children}){ return (<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">{title && <h2 className="text-base font-semibold mb-3">{title}</h2>}{children}</div>); }

// ===== Config Panels =====
function ConfigBasica({ state, up }){
  return (
    <Card title="Configuración básica">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm">Fecha de inicio (lunes recomendado)</label>
        <input type="date" value={state.startDate} onChange={(e)=>up(['startDate'],e.target.value)} className="col-span-2 px-3 py-2 rounded-lg border"/>
        <div><label className="text-sm">Semanas a mostrar</label><input type="number" min={1} max={52} value={state.weeks} onChange={(e)=>up(['weeks'],Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border"/></div>
        <div className="col-span-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg border"
            title="Calcular semanas hasta el 31/12"
            onClick={() => { const s = parseDateValue(state.startDate); const end = new Date(s.getFullYear(), 11, 31); const days = Math.max(1, Math.floor((end - s)/(24*3600*1000)) + 1); const w = Math.ceil(days/7); up(['weeks'], w); }}
          >Hasta fin de año</button>
        </div>
        <div><label className="text-sm">Horas objetivo/año</label><input type="number" min={1400} max={2200} value={state.annualTargetHours} onChange={(e)=>up(['annualTargetHours'],Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border"/></div>
        <div><label className="text-sm">Vacaciones (días laborables)</label><input type="number" min={0} max={60} value={state.vacationDaysNatural} onChange={(e)=>up(['vacationDaysNatural'],Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border"/></div>
        <div><label className="text-sm">Horas por día de VIAJE</label><input type="number" min={0} max={12} value={state.travelDefaultHours} onChange={(e)=>up(['travelDefaultHours'],Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border"/></div>
        <div className="col-span-2 flex items-center gap-2">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.applyConciliation}
              onChange={e=>up(['applyConciliation'], e.target.checked)}
            />
            Aplicar mejorador de conciliación
          </label>
        </div>
      </div>
    </Card>
  );
}

function ConciliacionPanel({ state, up }){
  // valores actuales (con fallback por si el payload era antiguo)
  const c = state.conciliacion || { penalizaDiaIslaTrabajo:3, penalizaDiaIslaLibre:2, penalizaCortesSemana:1 };

  function setNum(path, val){
    const n = Number(val);
    if (Number.isNaN(n)) return;
    up(['conciliacion', path], Math.max(0, Math.min(20, n))); // clamp 0..20
  }

  function resetDefaults(){
    up(['conciliacion'], { penalizaDiaIslaTrabajo:3, penalizaDiaIslaLibre:2, penalizaCortesSemana:1 });
  }

  return (
    <Card title="Conciliación (pesos de penalización)">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 text-xs text-slate-600">
          Ajusta cuánto penalizamos cada patrón al mejorar el cuadrante. Activa/Desactiva el mejorador en <b>Configuración básica</b>.
        </div>

        <div className="col-span-12 sm:col-span-6">
          <label className="text-xs block mb-1">Día isla de trabajo <span className="text-slate-400">(0–20)</span></label>
          <input
            type="number" min={0} max={20}
            value={c.penalizaDiaIslaTrabajo}
            onChange={e=>setNum('penalizaDiaIslaTrabajo', e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
          <div className="text-[11px] text-slate-500 mt-1">Patrón 0–1–0 (trabaja solo entre libres).</div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <label className="text-xs block mb-1">Día isla libre <span className="text-slate-400">(0–20)</span></label>
          <input
            type="number" min={0} max={20}
            value={c.penalizaDiaIslaLibre}
            onChange={e=>setNum('penalizaDiaIslaLibre', e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
          <div className="text-[11px] text-slate-500 mt-1">Patrón 1–0–1 (libra un único día entre trabajo).</div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <label className="text-xs block mb-1">Cortes W↔L por semana <span className="text-slate-400">(0–20)</span></label>
          <input
            type="number" min={0} max={20}
            value={c.penalizaCortesSemana}
            onChange={e=>setNum('penalizaCortesSemana', e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
          <div className="text-[11px] text-slate-500 mt-1">Transiciones Trabajo↔Libre dentro de la semana.</div>
        </div>

        <div className="col-span-12 flex gap-2">
          <button onClick={resetDefaults} className="px-3 py-1.5 rounded-lg border">Restaurar valores por defecto</button>
        </div>

        <div className="col-span-12 text-[11px] text-slate-500">
          Sugerencia: empieza con 3 / 2 / 1. Sube la penalización si aún ves “días isla”.
        </div>
      </div>
    </Card>
  );
}



function ReglasPanel({ state, up }){
  return (
    <Card title="Reglas duras del convenio">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 flex items-center gap-2">
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!state.rules.enforce}
              onChange={(e)=>up(['rules','enforce'], e.target.checked)}
            />
            Enforzar reglas
          </label>
        </div>

        <div className="col-span-3">
          <label className="text-xs">Máx horas/día</label>
          <input
            type="number" min={1} max={12}
            value={state.rules.maxDailyHours}
            onChange={(e)=>up(['rules','maxDailyHours'], Number(e.target.value))}
            className="w-full px-2 py-1 rounded border"
          />
        </div>

        <div className="col-span-3">
          <label className="text-xs">Máx horas/semana</label>
          <input
            type="number" min={5} max={60}
            value={state.rules.maxWeeklyHours}
            onChange={(e)=>up(['rules','maxWeeklyHours'], Number(e.target.value))}
            className="w-full px-2 py-1 rounded border"
          />
        </div>

        <div className="col-span-3">
          <label className="text-xs">Descanso mínimo (h)</label>
          <input
            type="number" min={0} max={24}
            value={state.rules.minRestHours}
            onChange={(e)=>up(['rules','minRestHours'], Number(e.target.value))}
            className="w-full px-2 py-1 rounded border"
          />
        </div>

        <div className="col-span-3">
          <label className="text-xs">Fines consecutivos (máx)</label>
          <input
            type="number" min={0} max={6}
            value={state.rules.maxConsecutiveWeekends ?? 1}
            onChange={(e)=>up(['rules','maxConsecutiveWeekends'], Math.max(0, Number(e.target.value)||0))}
            className="w-full px-2 py-1 rounded border"
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Si no hay turnos encadenados, el descanso mínimo se ignora.
      </p>
    </Card>
  );
}
function PersonasPanel({ state, upPerson }){
  return (
    <Card title="Personas (offset = semana OFF)">
      <div className="space-y-3 max-h-72 overflow-auto">
        {state.people.map(p=> (
          <div key={p.id} className="grid grid-cols-12 items-center gap-2 p-2 rounded-lg border">
            <div className="col-span-5 flex items-center gap-2"><span className="h-4 w-4 rounded" style={{background:p.color}}/><input value={p.name} onChange={(e)=>upPerson(p.id,{name:e.target.value})} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-4 flex items-center gap-2"><label className="text-sm">Offset</label><input type="number" min={0} max={3} value={p.offset} onChange={(e)=>upPerson(p.id,{offset:Number(e.target.value)})} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-3"><input type="color" value={p.color} onChange={(e)=>upPerson(p.id,{color:e.target.value})} className="w-full h-8"/></div>
          </div>
        ))}
        <p className="text-xs text-slate-500">Offsets 0,1,2,3 → cada semana 1 persona OFF.</p>
      </div>
    </Card>
  );
}
function TurnosPanel({ state, up }){
  return (
    <Card title="Turnos (Admin)">
      <div className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-2">Entre semana (2 turnos)</div>
          {state.weekdayShifts.map((s,idx)=> (
            <div key={idx} className="grid grid-cols-12 items-end gap-2 mb-2">
              <div className="col-span-4"><label className="text-xs">Inicio</label><input type="time" value={s.start} onChange={(e)=>up(['weekdayShifts',idx,'start'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
              <div className="col-span-4"><label className="text-xs">Fin</label><input type="time" value={s.end} onChange={(e)=>up(['weekdayShifts',idx,'end'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
              <div className="col-span-4"><label className="text-xs">Etiqueta</label><input value={s.label||''} onChange={(e)=>up(['weekdayShifts',idx,'label'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
              <div className="col-span-4"><label className="text-xs">Comida (min)</label><input type="number" min={0} max={180} value={s.lunchMinutes||0} onChange={(e)=>up(['weekdayShifts',idx,'lunchMinutes'], Number(e.target.value)||0)} className="px-2 py-1 rounded border w-full"/></div>
              <div className="col-span-12 text-[11px] text-slate-500">Horas: {(minutesDiff(s.start,s.end)/60).toFixed(1)}h brutas · {(effectiveMinutes(s)/60).toFixed(1)}h netas{(s.lunchMinutes||0) ? (" (comida "+(s.lunchMinutes)+"m)") : ""}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-sm font-medium mb-2">Fin de semana (1 turno base)</div>
          <div className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-4"><label className="text-xs">Inicio</label><input type="time" value={state.weekendShift.start} onChange={(e)=>up(['weekendShift','start'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-4"><label className="text-xs">Fin</label><input type="time" value={state.weekendShift.end} onChange={(e)=>up(['weekendShift','end'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-4"><label className="text-xs">Etiqueta</label><input value={state.weekendShift.label||''} onChange={(e)=>up(['weekendShift','label'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium mb-2">Turno de Refuerzo (L–V)</div>
          <div className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-4"><label className="text-xs">Inicio</label><input type="time" value={state.refuerzoWeekdayShift.start} onChange={(e)=>up(['refuerzoWeekdayShift','start'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-4"><label className="text-xs">Fin</label><input type="time" value={state.refuerzoWeekdayShift.end} onChange={(e)=>up(['refuerzoWeekdayShift','end'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-4"><label className="text-xs">Etiqueta</label><input value={state.refuerzoWeekdayShift.label||''} onChange={(e)=>up(['refuerzoWeekdayShift','label'],e.target.value)} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-4"><label className="text-xs">Comida (min)</label><input type="number" min={0} max={180} value={state.refuerzoWeekdayShift.lunchMinutes||0} onChange={(e)=>up(['refuerzoWeekdayShift','lunchMinutes'], Number(e.target.value)||0)} className="px-2 py-1 rounded border w-full"/></div>
            <div className="col-span-12 text-[11px] text-slate-500">Horas: {(minutesDiff(state.refuerzoWeekdayShift.start,state.refuerzoWeekdayShift.end)/60).toFixed(1)}h brutas · {(effectiveMinutes(state.refuerzoWeekdayShift)/60).toFixed(1)}h netas{(state.refuerzoWeekdayShift.lunchMinutes||0) ? (" (comida "+(state.refuerzoWeekdayShift.lunchMinutes)+"m)") : ""}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}
function FestivosPanel({ state, up }){
  return (
    <Card title="Festivos (2025)">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-7"><label className="text-xs">Provincia</label><select value={state.province} onChange={(e)=>up(['province'],e.target.value)} className="w-full px-2 py-1 rounded border">{Object.keys(HOLIDAYS_2025).map(p=> <option key={p} value={p}>{p}</option>)}</select></div>
        <div className="col-span-5 flex flex-col justify-end gap-2">
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={state.consumeVacationOnHoliday} onChange={(e)=>up(['consumeVacationOnHoliday'],e.target.checked)} />
            Consumir vacaciones en festivos
          </label>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={state.closeOnHolidays} onChange={(e)=>up(['closeOnHolidays'], e.target.checked)} />
            Cerrar tienda en festivos oficiales
          </label>
        </div>
        <div className="col-span-12 text-xs bg-transparent border rounded p-2">{(HOLIDAYS_2025[state.province]||[]).join(', ') || 'Sin datos'}</div>
      </div>
    </Card>
  );
}

// ===== Calendarios =====

function CustomHolidaysPanel({ state, up }){
  const years = (()=>{ const y = new Date().getFullYear(); return [y-1, y, y+1, y+2]; })();
  const [year,setYear] = React.useState(new Date().getFullYear());
  const dates = (state.customHolidaysByYear && state.customHolidaysByYear[year]) ? state.customHolidaysByYear[year] : [];
  const [newDate, setNewDate] = React.useState(String(year) + "-12-25");

  function save(list){
    const next = structuredClone(state.customHolidaysByYear || {});
    next[year] = list;
    up(['customHolidaysByYear'], next);
  }
  function add(){
    if(!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    if(!String(newDate).startsWith(String(year))) { alert('La fecha debe pertenecer al año seleccionado.'); return; }
    if(dates.includes(newDate)) return;
    const list = [...dates, newDate].sort();
    save(list);
  }
  function remove(idx){
    const list = dates.filter((_,i)=> i!==idx);
    save(list);
  }
  function copyProvinceDefaults(){
    const prov = state.province || 'Madrid';
    if (year !== 2025) { alert('Sólo hay plantilla oficial incrustada para 2025. Añade manualmente para otros años.'); return; }
    const base = (HOLIDAYS_2025[prov] || []);
    save(base.slice().sort());
  }
  function clearAll(){ if (confirm('¿Vaciar festivos personalizados del año ' + year + '?')) save([]); }

  return (
    <Card title="Festivos personalizados (por año)">
      <div className="grid grid-cols-12 gap-2 text-sm">
        <div className="col-span-6">
          <label className="text-xs">Año</label>
          <select className="w-full border rounded px-2 py-1" value={year} onChange={(e)=>setYear(Number(e.target.value))}>
            {years.map(y=> <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="col-span-6 flex items-end gap-2">
          <button onClick={copyProvinceDefaults} className="px-3 py-1.5 rounded-lg border w-full">Copiar oficiales {state.province} (2025)</button>
        </div>

        <div className="col-span-8">
          <label className="text-xs">Añadir fecha</label>
          <input type="date" className="w-full border rounded px-2 py-1" value={newDate} onChange={(e)=>setNewDate(e.target.value)} />
        </div>
        <div className="col-span-4 flex items-end">
          <button onClick={add} className="px-3 py-1.5 rounded-lg border w-full">Añadir</button>
        </div>

        <div className="col-span-12">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-slate-600">Fechas marcadas como festivo para {year} (se combinan con las oficiales si el cierre en festivos está activado):</div>
            <button onClick={clearAll} className="text-rose-700 text-xs underline">Vaciar año</button>
          </div>
          <div className="border rounded-lg p-2 bg-white max-h-40 overflow-auto">
            {dates.length===0 && <div className="text-sm text-slate-500">No has añadido festivos personalizados para {year}.</div>}
            {dates.map((d,idx)=>(
              <div key={d} className="flex items-center justify-between text-sm py-1">
                <div>{d}</div>
                <button onClick={()=>remove(idx)} className="text-rose-700 underline text-xs">Eliminar</button>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            * Requiere tener marcada la opción “Cerrar tienda en festivos oficiales”.<br/>
            * Los festivos personalizados aplican solo al año seleccionado.
          </div>
        </div>
      </div>
    </Card>
  );
}


function CalendarView({ startDate, weeks, assignments, people, onOpenDay, isAdmin, onQuickAssign, province, closeOnHolidays, closedExtraDates, customHolidaysByYear }){ const todayStr = toDateValue(new Date());
  const days=[]; for(let w=0;w<weeks;w++) for(let d=0;d<7;d++) days.push(addDays(startDate, w*7+d));
  const personMap=new Map(people.map(p=>[p.id,p]));
  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-7 gap-4 w-full">
        {days.map(date=>{
          const dateStr=toDateValue(date); const wd=date.toLocaleDateString(undefined,{weekday:'short'}); const day=date.getDate(); const isWE=isWeekend(date); const cell=assignments[dateStr]||[]; const hasConflict=cell.some(c=>c.conflict);
          const sorted=[...cell].sort((a,b)=> minutesFromHHMM(a.shift.start)-minutesFromHHMM(b.shift.start));
          const isClosed = isClosedBusinessDay2(dateStr, province, closeOnHolidays, closedExtraDates, customHolidaysByYear);
          return (
            <div key={dateStr} className={`rounded-2xl border p-2 ${isWE? 'bg-transparent':'bg-transparent'} ${hasConflict? 'border-red-400':'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold leading-none">{day}</span>
                  <span className="text-[11px] uppercase tracking-wide text-slate-500">{wd}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[10px] text-slate-500">{dateStr}</div>
                  <button className="h-6 w-6 grid place-items-center rounded-full border hover:bg-slate-100 text-xs" title="Ampliar día" aria-label="Ampliar día" onClick={()=>onOpenDay(dateStr)}>🔍</button>
                </div>
              </div>
              <div className="space-y-1.5">
                {isClosed && (
                  <div className="rounded-xl px-2 py-1.5 border text-sm flex items-center justify-between bg-transparent">
                    <div className="truncate">
                      <span className="text-[11px] mr-1 rounded px-1 py-0.5 border bg-amber-50">🎌 Cerrado (festivo)</span>
                      <span className="text-slate-700">No se programan turnos</span>
                    </div>
                  </div>
                )}
                {(isClosed? [] : sorted).map((c,i)=>{ const p=c.personId?personMap.get(c.personId):null; const span=formatSpan(c.shift.start,c.shift.end); const dur = effectiveMinutes(c.shift)/60; const lbl=(c.shift.label|| (isWE?'Finde':`T${i+1}`)); const emblem = /mañana/i.test(lbl)? '☀️' : /tarde/i.test(lbl)? '🌙' : isWE? '🗓️' : '➕'; return (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2 min-h-[52px] border text-[13px] leading-tight flex flex-col gap-1 ${c.conflict? 'border-red-300 bg-red-50':'border-slate-200'}`}
                    title={`${lbl} · ${span} (${dur}h)`}
                  >
                    <div className="whitespace-normal break-words">
                      <span className="text-[12px] mr-1 rounded px-1 py-0.5 border bg-transparent">{emblem} {lbl}</span>
                      <span className="text-slate-700">{span}</span>
                      <span className="text-[12px] ml-1 text-slate-600">({dur}h{c.shift.lunchMinutes ? " · comida "+(c.shift.lunchMinutes)+"m" : ""})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {p
                        ? (<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg" style={{background:`${p.color}20`, border:`1px solid ${p.color}55`}}>
                            <span className="h-2.5 w-2.5 rounded" style={{background:p.color}}/>
                            <span className="text-xs">{p.name}</span>
                          </span>)
                        : (<span className="text-red-600 text-sm">⚠ Falta asignar</span>)
                      }
                    </div>
                  </div>
                );})}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function PrettyAssignment({ a, h, p, i }){
  const span = `${a.shift.start}–${a.shift.end}`;
  const dur  = (effectiveMinutes(a.shift)/60);
  const lbl  = a.shift.label || `T${i+1}`;
  const d    = parseDateValue(h.dateStr);
  const isWE = (d.getDay()===0 || d.getDay()===6);
  const emblem =
    /mañana/i.test(lbl)   ? '☀️' :
    /tarde/i.test(lbl)    ? '🌙' :
    /refuerzo/i.test(lbl) ? '➕' :
    isWE ? '🗓️' : '⌚️';

  const color = (p && p.color) ? p.color : '#475569';

  return (
<div
  className={`rounded-xl px-3 py-2 min-h-[52px] border text-[13px] leading-tight mb-1 ${a.conflict ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-transparent'}`}
  style={a.conflict ? {} : { background:`${color}20`, border:`1px solid ${color}55` }}
  title={`${lbl} · ${span} (${dur}h)`}
>
  <div className="flex flex-col gap-1">
    <div className="whitespace-normal break-words">
      <span className="text-[12px] mr-1 rounded px-1 py-0.5 border bg-transparent">
        {emblem} {lbl}
      </span>
      <span className="">{span}</span>
      <span className="text-[12px] ml-1 text-slate-600">
        ({dur}h{a.shift.lunchMinutes ? ` · comida ${a.shift.lunchMinutes}m` : ''})
      </span>
    </div>
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg self-start"
      style={{background:`${color}20`, border:`1px solid ${color}55`}}
    >
      <span className="h-2.5 w-2.5 rounded" style={{background:color}}/>
      <span className="text-xs">{p?.name||''}</span>
    </span>
  </div>
</div>

  );
}
function WeeklyView({ startDate, weeks, assignments, people, timeOffs, province, closeOnHolidays, closedExtraDates, customHolidaysByYear, consumeVacationOnHoliday }){
  const header=[]; for(let d=0; d<7*weeks; d++){ const date=addDays(startDate,d); header.push({ dateStr:toDateValue(date), label: date.toLocaleDateString(undefined,{weekday:'short'})+' '+date.getDate() }); }
  // Helpers: TO aprobadas
  const isClosedDay = (dateStr) => isClosedBusinessDay2(dateStr, province, closeOnHolidays, closedExtraDates, customHolidaysByYear);
  const hasApprovedTO = (dateStr, personId) => {
    const d = parseDateValue(dateStr);
    const dow = d.getDay();
    const hit = (timeOffs||[]).find(to => to.personId===personId && to.status==="aprobada" && parseDateValue(to.start) <= d && d <= parseDateValue(to.end));
    if(!hit) return false;
    if(hit.type==='vacaciones'){ return true; }
    return true;
  };
  const getTOType = (dateStr, personId) => {
  const d_ = parseDateValue(dateStr);
  const hit = (timeOffs||[]).find(to => (
    to.personId === personId &&
    to.status === "aprobada" &&
    parseDateValue(to.start) <= d_ && d_ <= parseDateValue(to.end)
  ));
  return hit ? hit.type : null;
};
  return (
    <div className="overflow-x-auto print-only:block">
      <table className="w-full text-sm border-collapse table-fixed">
        <thead>
          <tr>
            <th className="text-left p-1 border-b">Persona</th>
            {(header || []).map(h=> <th key={h.dateStr} className="text-left p-1 border-b">{h.label}</th>)}
          </tr>
        </thead>
<tbody>
  {(people || []).map(p => (
    <tr key={p.id}>
      {/* Columna Persona (nombre + color) */}
      <td className="p-1 align-top">
        <div className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded" style={{ background: p.color }} />
          <span className="font-medium">{p.name}</span>
        </div>
      </td>
      {/* Celdas por día */}
      {(header || []).map((h, idx) => {
        // Turnos del día para esta persona
        const cell = (assignments[h.dateStr] || [])
          .filter(c => c.personId === p.id)
          .sort((a, b) => minutesFromHHMM(a.shift.start) - minutesFromHHMM(b.shift.start));

        // Tipo de “Time Off” y festivo para celda vacía
        const toType = (typeof getTOType === 'function') ? getTOType(h.dateStr, p.id) : null;
        const isFest = (typeof isClosedDay === 'function') ? isClosedDay(h.dateStr) : false;
        return (
        <td key={h.dateStr || idx} className="p-1 align-top">
          {cell.length===0 ? (
            <div className="rounded border bg-transparent px-1 py-0.5 inline-block">
              {renderEmptyCell(toType, isFest)}
            </div>
          ) : (
            cell.map((a,i)=>(<PrettyAssignment a={a} h={h} p={p} i={i} />))
          )}
        </td>
        );
      })}
    </tr>
  ))}
</tbody>

      </table>
    </div>
  );
}

// ===== Vacaciones / Libranzas / Viajes =====
function TimeOffPanel({ state, setState, controls, isAdmin, currentUser }){
  const [newTO,setNewTO]=useState({ personId: state.people[0]?.id||"P1", start: state.startDate, end: state.startDate, type:'vacaciones', note:'', hoursPerDay: state.travelDefaultHours, status: 'pendiente' });

  function addTimeOff(){
    const rec={...newTO};
    if(rec.type==='vacaciones' && rec.status==='aprobada'){
      const adding=countVacationDaysConsideringHolidays(rec.start,rec.end,state.province,state.consumeVacationOnHoliday);
      const used=controls.vacationUsedNaturalByPerson.get(rec.personId)||0; const allowed=state.vacationDaysNatural;
      if(used+adding>allowed){ alert(`No se puede añadir: excede las vacaciones (${used}+${adding} > ${allowed}).`); return; }
    }
    setState(prev=>({...prev, timeOffs:[...prev.timeOffs, rec]}));
    setNewTO({...newTO, note:''});
  }
  function removeTimeOff(idx){ setState(prev=>({...prev, timeOffs: prev.timeOffs.filter((_,i)=>i!==idx)})); }
  function setTOStatus(idx,status){
    if (!isAdmin) return;
    setState(prev=>({...prev, timeOffs: prev.timeOffs.map((t,i)=> i===idx? {...t,status}:t)}));
    setState(prev=> ({...prev, audit:[...(prev.audit||[]), {
      ts:new Date().toISOString(), actor:(currentUser?.email||'unknown'), action:'vacaciones:'+status,
      personId: (prev.timeOffs[idx]? prev.timeOffs[idx].personId : null)
    }]}));
  }

  return (
    <Card title="Vacaciones / Libranzas / Viajes">
      <div className="grid grid-cols-12 gap-2 mb-3">
        <div className="col-span-4"><label className="text-xs">Persona</label>
          <select value={newTO.personId} onChange={(e)=>setNewTO({...newTO,personId:e.target.value})} className="w-full px-2 py-1 rounded border">
            {state.people.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="col-span-4"><label className="text-xs">Desde</label><input type="date" value={newTO.start} onChange={(e)=>setNewTO({...newTO,start:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
        <div className="col-span-4"><label className="text-xs">Hasta</label><input type="date" value={newTO.end} onChange={(e)=>setNewTO({...newTO,end:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
        <div className="col-span-4"><label className="text-xs">Tipo</label>
          <select value={newTO.type} onChange={(e)=>setNewTO({...newTO,type:e.target.value})} className="w-full px-2 py-1 rounded border">
            <option value="vacaciones">Vacaciones</option>
            <option value="libranza">Libranza</option>
            <option value="viaje">Viaje (día entero)</option>
          </select>
        </div>
        {newTO.type==='viaje' && (
          <div className="col-span-4"><label className="text-xs">Horas por día</label><input type="number" min={0} max={12} value={newTO.hoursPerDay} onChange={(e)=>setNewTO({...newTO,hoursPerDay:Number(e.target.value)})} className="w-full px-2 py-1 rounded border"/></div>
        )}
        <div className="col-span-8"><label className="text-xs">Nota</label><input value={newTO.note} onChange={(e)=>setNewTO({...newTO,note:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
        <div className="col-span-12"><button onClick={addTimeOff} className="px-3 py-1.5 rounded-lg border w-full">Añadir / Solicitar</button></div>
      </div>

      <div className="text-xs bg-slate-100 border p-2 rounded-lg mb-2">
        <div><b>Vacaciones usadas (laborables):</b> {controls.vacationsUsedNatural} / {state.vacationDaysNatural} días (festivos: {state.consumeVacationOnHoliday? 'consumen':'no consumen'})</div>
        <div className="mt-1">Por persona:
          <ul className="list-disc ml-4">{state.people.map(p=> (<li key={p.id}>{p.name}: {controls.vacationUsedNaturalByPerson.get(p.id)||0} días</li>))}</ul>
        </div>
      </div>

      <div className="border rounded-lg divide-y">
        {state.timeOffs.length===0 && <div className="p-3 text-sm text-slate-500">Sin registros todavía.</div>}
        {state.timeOffs.map((t,idx)=> (
          <div key={idx} className="flex items-center justify-between p-2 text-sm">
            <div className="flex-1"><b>{state.people.find(p=>p.id===t.personId)?.name}</b> · {t.type} · {t.start} → {t.end}
              {t.type==='viaje' && (<span className="ml-1 text-slate-500">({t.hoursPerDay} h/día)</span>)}
              {t.note? <span className="text-slate-500"> · {t.note}</span>:null}
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${t.status==='aprobada'?'bg-emerald-50 border-emerald-300 text-emerald-700':t.status==='pendiente'?'bg-amber-50 border-amber-300 text-amber-700':'bg-rose-50 border-rose-300 text-rose-700'}`}>{t.status||'pendiente'}</span>
            </div>
            <div className="flex items-center gap-2">
              {t.status!=='aprobada' && <button onClick={()=>setTOStatus(idx,'aprobada')} className="text-emerald-700 hover:underline">Aprobar</button>}
              {t.status!=='denegada' && <button onClick={()=>setTOStatus(idx,'denegada')} className="text-rose-700 hover:underline">Denegar</button>}
              <button onClick={()=>removeTimeOff(idx)} className="text-red-600 hover:underline">Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ===== Swaps =====
function SwapsPanel({ state, setState, assignments, isAdmin, currentUser }){
  const [swapDraft,setSwapDraft]=useState({ dateA: state.startDate, shiftIndexA:0, dateB: state.startDate, shiftIndexB:0 });

  function proposeSwap(){ const req={...swapDraft, requestedBy: "user", status:'pendiente'}; setState(prev=>({...prev, swaps:[...prev.swaps, req]})); }
  function approveSwap(i){
    if (!isAdmin) return;
    const sw=state.swaps[i];
    const A=assignments[sw.dateA]?.[sw.shiftIndexA]; const B=assignments[sw.dateB]?.[sw.shiftIndexB];
    if(!A||!B||!A.personId||!B.personId){ alert('No encuentro asignaciones válidas'); return; }
    const keyA=`${A.shift.start}-${A.shift.end}-${A.shift.label||`T${sw.shiftIndexA+1}`}`;
    const keyB=`${B.shift.start}-${B.shift.end}-${B.shift.label||`T${sw.shiftIndexB+1}`}`;
    const overrides=structuredClone(state.overrides||{});
    overrides[sw.dateA]=overrides[sw.dateA]||{}; overrides[sw.dateB]=overrides[sw.dateB]||{};
    overrides[sw.dateA][keyA]=B.personId; overrides[sw.dateB][keyB]=A.personId;
    const swaps = state.swaps.map((r,idx)=> idx===i ? {...r, status:'aprobada', approvedBy:(currentUser?.name||currentUser?.id||"admin"), approvedAt:new Date().toISOString()} : r);
    setState(prev=>({...prev, overrides, swaps }));
  }
  function denySwap(i){ if (!isAdmin) return;  setState(prev=>({...prev, swaps: prev.swaps.map((r,idx)=> idx===i? {...r,status:'denegada'}:r)})); }
    if (!isAdmin) return;
  function archiveSwap(i){ if (!isAdmin) return;  setState(prev=>({...prev, swaps: prev.swaps.map((r,idx)=> idx===i? {...r,status:'archivada'}:r)})); }
    if (!isAdmin) return;
  function deleteSwap(i){ if (!isAdmin) return;  setState(prev=>({...prev, swaps: prev.swaps.filter((_,idx)=> idx!==i)})); }

  return (
    <Card title="Swaps (intercambios)">
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-6"><label className="text-xs">Fecha A</label><input type="date" value={swapDraft.dateA} onChange={(e)=>setSwapDraft({...swapDraft,dateA:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
          <div className="col-span-6"><label className="text-xs">Shift # A</label><input type="number" min={0} value={swapDraft.shiftIndexA} onChange={(e)=>setSwapDraft({...swapDraft,shiftIndexA:Number(e.target.value)})} className="w-full px-2 py-1 rounded border"/></div>
          <div className="col-span-6"><label className="text-xs">Fecha B</label><input type="date" value={swapDraft.dateB} onChange={(e)=>setSwapDraft({...swapDraft,dateB:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
          <div className="col-span-6"><label className="text-xs">Shift # B</label><input type="number" min={0} value={swapDraft.shiftIndexB} onChange={(e)=>setSwapDraft({...swapDraft,shiftIndexB:Number(e.target.value)})} className="w-full px-2 py-1 rounded border"/></div>
          <div className="col-span-12"><button onClick={proposeSwap} className="px-3 py-1.5 rounded-lg border w-full">Proponer swap</button></div>
        </div>
        <div className="flex items-center justify-between text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={state.showArchivedSwaps} onChange={(e)=>setState(prev=>({...prev, showArchivedSwaps:e.target.checked}))} /> Mostrar archivados</label></div>
        <div className="border rounded-lg divide-y">
          {state.swaps.filter(sw=> state.showArchivedSwaps || sw.status!=='archivada').length===0 && <div className="p-3 text-sm text-slate-500">Sin swaps.</div>}
          {state.swaps.map((sw,idx)=> (
            (state.showArchivedSwaps || sw.status!=='archivada') && (
              <div key={idx} className="flex items-center justify-between p-2 text-sm">
                <div>Swap #{idx+1}: {sw.dateA} [#{sw.shiftIndexA}] ⇄ {sw.dateB} [#{sw.shiftIndexB}] · Estado: <b>{sw.status}</b>{sw.status==='aprobada' && (<span> · Aprobado por <b>{sw.approvedBy||'admin'}</b>{sw.approvedAt?` el ${new Date(sw.approvedAt).toLocaleString()}`:""}</span>)}</div>
                <div className="flex items-center gap-3">
                  {sw.status!=='aprobada' && <button className="text-emerald-700 hover:underline" onClick={()=>approveSwap(idx)}>Aprobar</button>}
                  {sw.status!=='denegada' && <button className="text-rose-700 hover:underline" onClick={()=>denySwap(idx)}>Denegar</button>}
                  {sw.status!=='archivada' && <button className="text-slate-600 hover:underline" onClick={()=>archiveSwap(idx)}>Archivar</button>}
                  <button className="text-red-600 hover:underline" onClick={()=>deleteSwap(idx)}>Eliminar</button>
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </Card>
  );
}

// ===== Refuerzos =====
function RefuerzosPanel({ state, up }){
  const [ev,setEv]=useState({ label:'Black Friday', start: state.startDate, end: state.startDate, weekdaysExtraSlots:1, weekendExtraSlots:1 });

  function add(){ up(['events'], [...state.events, {...ev}]); }
  function del(i){ up(['events'], state.events.filter((_,idx)=> idx!==i)); }
  function setField(i, field, value){
    const next = state.events.map((e,idx)=> idx===i? {...e, [field]: value}: e);
    up(['events'], next);
  }

  return (
    <Card title="Eventos de Refuerzo (Admin)">
      {/* Alta rápida */}
      <div className="grid grid-cols-12 gap-2 mb-3">
        <div className="col-span-4"><label className="text-xs">Etiqueta</label><input value={ev.label} onChange={(e)=>setEv({...ev,label:e.target.value})} className="w-full border rounded px-2 py-1"/></div>
        <div className="col-span-2"><label className="text-xs">Desde</label><input type="date" value={ev.start} onChange={(e)=>setEv({...ev,start:e.target.value})} className="w-full border rounded px-2 py-1"/></div>
        <div className="col-span-2"><label className="text-xs">Hasta</label><input type="date" value={ev.end} onChange={(e)=>setEv({...ev,end:e.target.value})} className="w-full border rounded px-2 py-1"/></div>
        <div className="col-span-2"><label className="text-xs">L–V +</label><input type="number" min={0} max={9} value={ev.weekdaysExtraSlots} onChange={(e)=>setEv({...ev,weekdaysExtraSlots:Number(e.target.value)})} className="w-full border rounded px-2 py-1"/></div>
        <div className="col-span-2"><label className="text-xs">S–D +</label><input type="number" min={0} max={9} value={ev.weekendExtraSlots} onChange={(e)=>setEv({...ev,weekendExtraSlots:Number(e.target.value)})} className="w-full border rounded px-2 py-1"/></div>
        <div className="col-span-12"><button onClick={add} className="px-3 py-1.5 rounded-lg border w-full">Añadir evento</button></div>
      </div>

      {/* Lista editable */}
      <div className="border rounded-lg divide-y">
        {state.events.length===0 && <div className="p-3 text-sm text-slate-500">Sin eventos.</div>}
        {state.events.map((e,idx)=> (
          <div key={idx} className="p-2 grid grid-cols-12 gap-2 items-end">
            <input className="col-span-3 border rounded px-2 py-1" value={e.label||''} onChange={(ev)=>setField(idx,'label',ev.target.value)} />
            <input className="col-span-2 border rounded px-2 py-1" type="date" value={e.start} onChange={(ev)=>setField(idx,'start',ev.target.value)} />
            <input className="col-span-2 border rounded px-2 py-1" type="date" value={e.end} onChange={(ev)=>setField(idx,'end',ev.target.value)} />
            <input className="col-span-2 border rounded px-2 py-1" type="number" min={0} max={9} value={e.weekdaysExtraSlots||0} onChange={(ev)=>setField(idx,'weekdaysExtraSlots',Number(ev.target.value))} />
            <input className="col-span-2 border rounded px-2 py-1" type="number" min={0} max={9} value={e.weekendExtraSlots||0} onChange={(ev)=>setField(idx,'weekendExtraSlots',Number(ev.target.value))} />
            <button onClick={()=>del(idx)} className="col-span-1 text-red-600 hover:underline text-sm">Eliminar</button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GeneradorPicos({ state, up }){
  const [anio,setAnio] = useState(new Date().getFullYear());
  function generar(){
    const nuevos = generarPicosParaAnio(Number(anio));
    up(['events'], [...state.events, ...nuevos]);
    alert(`Añadidos ${nuevos.length} eventos de picos para ${anio}`);
  }
  return (
    <Card title="Generar picos (Black Friday, Navidad, Rebajas)">
      <div className="flex items-center gap-2">
        <input type="number" className="border rounded px-2 py-1 w-24" value={anio} onChange={e=>setAnio(e.target.value)} />
        <button onClick={generar} className="px-3 py-1.5 rounded-lg border">Generar</button>
      </div>
      <p className="text-xs text-slate-500 mt-2">Fechas genéricas; puedes ajustar los rangos después desde “Eventos de Refuerzo”.</p>
    </Card>
  );
}
function PropuestaCierre({ state, startDate, weeks, people, assignments, onApply, annualTarget }){
  const [sugs,setSugs] = useState(null);
  const [mode,setMode] = useState('replace'); // 'replace' | 'append'
  const [horizon,setHorizon] = useState(state.refuerzoPolicy?.horizonDefault || 'fin'); // 'visible' | 'fin'

  function calcular(){
    let weeksH = weeks;
    if (horizon==='fin'){
      const last = new Date(startDate.getTime() + (weeks*7-1)*24*3600*1000);
      const end  = new Date(last.getFullYear(), 11, 31);
      const days = Math.max(1, Math.floor((end - startDate)/(24*3600*1000)) + 1);
      weeksH = Math.ceil(days/7);
    }
    const { propuestas, eventosSugeridos } = proponerCierreHoras({
      assignments, people, startDate, weeks: weeksH, annualTarget,
      baseShift: state.refuerzoWeekdayShift,
      weekdayShifts: state.weekdayShifts,
      weekendShift: state.weekendShift,
      events: state.events,
      timeOffs: state.timeOffs,
      policy: state.refuerzoPolicy
    });
    setSugs({ propuestas, eventosSugeridos });
  }

  function aplicar(){
    if (!sugs) return;
    const batchId = new Date().toISOString();
    onApply(sugs.eventosSugeridos, mode, batchId);
    alert(`${sugs.eventosSugeridos.length} refuerzos aplicados (${mode==='replace'?'reemplazando los anteriores':'añadiendo'}).`);
    setSugs(null);
  }

  function eliminar(){
    onApply([], 'replace', null);
    alert('Refuerzos de conciliación eliminados.');
  }

  return (
    <Card title="Refuerzo de conciliación (gestionado)">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <label className="text-sm ml-2 flex items-center gap-2">
          Horizonte:
          <select value={horizon} onChange={e=>setHorizon(e.target.value)} className="border rounded px-2 py-1">
            <option value="fin">Hasta fin de año</option>
            <option value="visible">Semanas visibles</option>
          </select>
        </label>
        <label className="text-sm ml-2 flex items-center gap-2">
          Modo:
          <select value={mode} onChange={e=>setMode(e.target.value)} className="border rounded px-2 py-1">
            <option value="replace">Reemplazar anterior</option>
            <option value="append">Añadir a lo existente</option>
          </select>
        </label>
        <button onClick={calcular} className="px-3 py-1.5 rounded-lg border">Calcular propuesta</button>
        <button onClick={aplicar} disabled={!sugs} className={`px-3 py-1.5 rounded-lg border ${sugs?'':'opacity-50 cursor-not-allowed'}`}>Aplicar</button>
        <button onClick={eliminar} className="px-3 py-1.5 rounded-lg border text-rose-700">Eliminar refuerzos</button>
      </div>

      {!sugs && <div className="text-sm text-slate-500">Pulsa “Calcular propuesta” para ver sugerencias.</div>}
      {sugs && (
        <div className="text-sm">
          <div className="mb-2">Se propondrán {sugs.eventosSugeridos.length} días de refuerzo (L–V) para personas con déficit de horas.</div>
          <div className="max-h-40 overflow-auto border rounded p-2 text-xs bg-white">
            {sugs.propuestas.map((p,i)=> (
              <div key={i}>{p.dateStr} · {people.find(x=>x.id===p.personId)?.name} · {p.shift.start}–{p.shift.end}</div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function ScoreDebugPanel({ assignments, people, startDate, weeks, conciliacion, applyConciliation, onToggleApply }){
  const breakdown = useMemo(()=> scoreConciliacionBreakdown({
    assignments, people, startDate, weeks, conciliacion
  }), [assignments, people, startDate, weeks, conciliacion]);

  return (
    <Card title="Score de conciliación (debug)">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-600">
          Penalizaciones · Día-isla trabajo: <b>{safeConciliacion(conciliacion).penalizaDiaIslaTrabajo}</b> ·
          Día-isla libre: <b>{safeConciliacion(conciliacion).penalizaDiaIslaLibre}</b> ·
          Cortes/semana: <b>{safeConciliacion(conciliacion).penalizaCortesSemana}</b>
        </div>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={!!applyConciliation} onChange={e=>onToggleApply(e.target.checked)} />
          Aplicar mejorador
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse table-fixed">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Semana</th>
              <th className="text-left p-2">Cortes W↔L</th>
              <th className="text-left p-2">Islas trabajo</th>
              <th className="text-left p-2">Islas libre</th>
              <th className="text-left p-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.byWeek.map(w=>(
              <tr key={w.week} className="border-b">
                <td className="p-2">#{w.week}</td>
                <td className="p-2">{w.cortes}</td>
                <td className="p-2">{w.islasTrabajo}</td>
                <td className="p-2">{w.islasLibre}</td>
                <td className="p-2">{w.score}</td>
              </tr>
            ))}
            <tr>
              <td className="p-2 font-medium" colSpan={4}>Total</td>
              <td className="p-2 font-medium">{breakdown.total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        * Cuanto más bajo el score, mejor conciliación (menos cortes y menos días-isla).
      </p>
    </Card>
  );
}

// ===== Resumen y Modal Día =====
function buildControls({
  assignments, people, weekdayShifts, weekendShift,
  hoursPerPersonMin, // ya no lo necesitamos, pero lo dejo en la firma por compatibilidad
  annualTargetHours, startDate, weeks, vacationDaysNatural,
  timeOffs, province, consumeVacationOnHoliday
}){
  // Inicializa resumen
  const summary = people.map(p=>({
    id:p.id, name:p.name, color:p.color,
    weekdays:0, weekends:0, minutes:0
  }));
  const index = new Map(summary.map(s=>[s.id,s]));

  // Recorre todo el periodo y acumula días y minutos
  const dates = Object.keys(assignments).length
    ? Object.keys(assignments)
    : [...Array(weeks*7)].map((_,i)=> toDateValue(addDays(startDate, i)));

  for (const ds of dates){
    const cell = assignments[ds] || [];
    const isWE = isWeekend(parseDateValue(ds));
    for (const c of cell){
      if (!c.personId) continue;
      const s = index.get(c.personId);
      if (!s) continue;
      if (isWE) s.weekends += 1; else s.weekdays += 1;
      s.minutes += effectiveMinutes(c.shift);
    }
  }

  // Vacaciones usadas (laborables)
  const vacByPerson = new Map();
  for (const to of timeOffs){
    if (to.type==='vacaciones' && to.status==='aprobada'){
      const days = countVacationDaysConsideringHolidays(to.start,to.end,province,consumeVacationOnHoliday);
      vacByPerson.set(to.personId,(vacByPerson.get(to.personId)||0)+days);
    }
  }
  const vacationsUsedNatural = Array.from(vacByPerson.values()).reduce((a,b)=>a+b,0);

  // Derivados
  for (const s of summary){
    s.hours = s.minutes/60;
    s.annualProjection = s.hours * (52/weeks);
    s.delta = s.annualProjection - annualTargetHours;
    s.remaining = annualTargetHours - s.annualProjection;
  }

  // Conflictos (por si en el futuro los marcas)
  const totalConflicts = dates.reduce((acc,ds)=> acc + (assignments[ds]||[]).filter(a=>a.conflict).length, 0);

  // Etiqueta de periodo visible en resumen
  const periodStart = startDate;
  const periodEnd   = addDays(startDate, weeks*7 - 1);
  const fmt = d => d.toLocaleDateString(undefined,{ day:"2-digit", month:"short", year:"numeric"});
  const periodLabel = `${fmt(periodStart)} – ${fmt(periodEnd)} · ${weeks} sem`;

  return { rows:summary, totalConflicts, vacationsUsedNatural, vacationUsedNaturalByPerson: vacByPerson, periodLabel };
}
function ResumenPanel({ controls, annualTarget, onExportICS }){
  return (
    <Card title="Resumen de horas vs objetivo y proyección anual">
      <div className="text-xs text-slate-600 mb-2">
        Periodo mostrado: {controls.periodLabel}. Proyección = horas del periodo × (52 / semanas mostradas).
      </div>
      <table className="w-full text-sm border-separate border-spacing-y-1">
        <thead><tr className="text-left text-slate-600"><th className="py-1">Persona</th><th className="py-1">Jornadas L–V</th><th className="py-1">Jornadas S–D</th><th className="py-1">Horas (periodo)</th><th className="py-1">Proyección anual</th><th className="py-1">Δ vs {annualTarget}h</th><th className="py-1">Horas pendientes/sobrantes</th><th className="py-1">ICS</th></tr></thead>
        <tbody>
          {controls.rows.map(r=> (
            <tr key={r.id} className="bg-white">
              <td className="py-1 px-2"><span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded" style={{background:r.color}}/><span>{r.name}</span></span></td>
              <td className="py-1 px-2">{r.weekdays}</td>
              <td className="py-1 px-2">{r.weekends}</td>
              <td className="py-1 px-2">{r.hours.toFixed(1)}</td>
              <td className="py-1 px-2">{r.annualProjection.toFixed(0)}</td>
              <td className={`py-1 px-2 ${r.delta>0?'text-amber-700': r.delta<0?'text-blue-700':''}`}>{r.delta.toFixed(0)}</td>
              <td className={`py-1 px-2 ${r.remaining>0?'text-blue-700': r.remaining<0?'text-amber-700':''}`}>
                <div className="text-right">{r.remaining.toFixed(0)}</div>
                <div className="h-1.5 w-full bg-slate-100 rounded mt-1">
                  <div className="h-1.5 rounded" style={{
                    width: `${Math.min(100, Math.max(0, (r.annualProjection/annualTarget)*100))}%`,
                    background: r.annualProjection>=annualTarget ? '#f59e0b55' : '#3b82f655'
                  }}/>
                </div>
              </td>
              <td className="py-1 px-2"><button className="px-2 py-0.5 rounded border" onClick={()=>onExportICS(r.id)}>Descargar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-sm flex items-center justify-between"><div>Conflictos en periodo: {controls.totalConflicts>0? (<span className="text-red-600 font-medium">{controls.totalConflicts}</span>):(<span className="text-emerald-700 font-medium">0</span>)}</div><div className="text-xs text-slate-500">* Proyección estimada por semanas mostradas.</div></div>
    </Card>
  );
}
// ===== Modal Día =====
function DayModal({ dateStr, date, assignments, people, onOverride, onClose, isAdmin }){
  const pmap=new Map(people.map(p=>[p.id,p]));
  const sorted=assignments.map(x=>x); // ya vienen ordenados por ASS
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">{dateStr}</div>
            <div className="text-lg font-semibold">Detalle del día</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border hover:bg-slate-100">Cerrar</button>
        </div>
        <div className="p-4 space-y-3">
          {sorted.length===0 && <div className="text-sm text-slate-500">No hay turnos este día.</div>}
          {sorted.map((c,i)=>{ const p=c.personId?pmap.get(c.personId):null; const span=formatSpan(c.shift.start,c.shift.end); const dur = effectiveMinutes(c.shift)/60;
            return (
              <div key={i} className={`rounded-xl border p-3 ${c.conflict? 'border-red-300 bg-red-50':'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium">{c.shift.label||`Turno ${i+1}`} · {span} <span className="text-slate-500 font-normal">({dur}h{c.shift.lunchMinutes ? " · comida " + (c.shift.lunchMinutes) + "m" : ""})</span></div>
                    <div className="text-xs text-slate-500">{c.conflict? '⚠ Falta asignar':'Asignado'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={c.personId || ''}
                      onChange={e=> (isAdmin && onOverride(dateStr, i, e.target.value || null))}
                      disabled={!isAdmin}
                    >
                      <option value="">— Sin override —</option>
                      {(people || []).map(pp=> <option key={pp.id} value={pp.id}>{pp.name}</option>)}
                    </select>
                    {p && <span className="inline-flex items-center gap-1 text-sm">
                      <span className="h-3 w-3 rounded" style={{background:p.color}}/> {p.name}
                    </span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== CSV / ICS =====
function buildCSV(assignments, people){ const header=["fecha","turno","inicio","fin","persona","tipo","conflicto"]; const rows=[header.join(',')]; const pmap=new Map(people.map(p=>[p.id,p.name])); const dates=Object.keys(assignments).sort(); for(const d of dates){ for(const a of assignments[d]){ rows.push([d,a.shift.label||"",a.shift.start,a.shift.end,a.personId?pmap.get(a.personId):"", isWeekend(parseDateValue(d))?"fin_de_semana":"laborable", a.conflict?"SI":"NO"].join(',')); } } return rows; }
function buildICS({ assignments, people, personId, startDate, weeks }){ const prod='-//Gestor Turnos 4P//ES'; let ics=`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:${prod}\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n`; const person=people.find(p=>p.id===personId); const fmt=(d)=> d.getFullYear().toString().padStart(4,'0')+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'00'; for(let w=0;w<weeks;w++){ for(let d=0;d<7;d++){ const date=addDays(startDate,w*7+d); const ds=toDateValue(date); const cell=assignments[ds]||[]; for(const c of cell){ if(c.personId!==personId) continue; const [sh,sm]=c.shift.start.split(':').map(Number); const [eh,em]=c.shift.end.split(':').map(Number); const s=new Date(date.getFullYear(),date.getMonth(),date.getDate(),sh,sm||0,0); const e=new Date(date.getFullYear(),date.getMonth(),date.getDate(),eh,em||0,0); const uid=`${personId}-${ds}-${c.shift.start.replace(':','')}`; const summary=`${c.shift.label||'Turno'} · ${person?.name||personId}`; ics+=`BEGIN:VEVENT\nUID:${uid}@turnos4p\nDTSTAMP:${fmt(new Date())}\nDTSTART:${fmt(s)}\nDTEND:${fmt(e)}\nSUMMARY:${summary}\nDESCRIPTION:${isWeekend(date)?'Fin de semana':'Laborable'}\nEND:VEVENT\n`; } } } ics+='END:VCALENDAR\n'; return ics; }


function AdminUsersAndPerms({ auth }) {
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState({ email:'', name:'', role:'user', password:'' });
  const [space, setSpace] = useState({ id:'turnos-2025', ownerEmail:'', readToken:'', writeToken:'' });
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await api('/admin/users', { method: 'GET' }, auth.token);
      setUsers(data.users || []);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createUser(e) {
    e?.preventDefault();
    try {
      setLoading(true);
      await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creating)
      }, auth.token);
      alert('Usuario creado');
      setCreating({ email:'', name:'', role:'user', password:'' });
      loadUsers();
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(email) {
    const pwd = prompt(`Nueva contraseña para ${email}:`);
    if (!pwd) return;
    try {
      setLoading(true);
      await api('/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, password: pwd })
      }, auth.token);
      alert('Contraseña actualizada');
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function transferOwnership() {
    if (!space.id || !space.ownerEmail) { alert('Indica Space ID y nuevo propietario'); return; }
    try {
      setLoading(true);
      await api(`/state/${encodeURIComponent(space.id)}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ owner_email: space.ownerEmail })
      }, auth.token);
      alert('Propiedad transferida');
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateTokens() {
    if (!space.id) { alert('Indica Space ID'); return; }
    try {
      setLoading(true);
      await api(`/state/${encodeURIComponent(space.id)}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ read_token: space.readToken || null, write_token: space.writeToken || null })
      }, auth.token);
      alert('Tokens actualizados');
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ loadUsers(); },[]);

  return (
    <Card title="Administración · Usuarios y Permisos">
      <div className="grid grid-cols-12 gap-4">
        {/* Crear usuario */}
        <div className="col-span-12 lg:col-span-4">
          <div className="text-sm font-medium mb-2">Crear usuario</div>
          <form className="space-y-2" onSubmit={createUser}>
            <div><label className="text-xs">Email</label>
              <input className="w-full border rounded px-2 py-1" type="email" required
                     value={creating.email} onChange={e=>setCreating({...creating,email:e.target.value})}/>
            </div>
            <div><label className="text-xs">Nombre</label>
              <input className="w-full border rounded px-2 py-1" required
                     value={creating.name} onChange={e=>setCreating({...creating,name:e.target.value})}/>
            </div>
            <div><label className="text-xs">Rol</label>
              <select className="w-full border rounded px-2 py-1"
                      value={creating.role} onChange={e=>setCreating({...creating,role:e.target.value})}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div><label className="text-xs">Contraseña</label>
              <input className="w-full border rounded px-2 py-1" type="password" required
                     value={creating.password} onChange={e=>setCreating({...creating,password:e.target.value})}/>
            </div>
            <button className="w-full px-3 py-1.5 rounded-lg border" disabled={loading}>
              {loading? 'Creando...':'Crear usuario'}
            </button>
          </form>
        </div>

        {/* Lista de usuarios */}
        <div className="col-span-12 lg:col-span-8">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Usuarios</div>
            <button onClick={loadUsers} className="px-2 py-1 rounded border">Refrescar</button>
          </div>
          <div className="border rounded-lg divide-y">
            {users.length===0 && <div className="p-3 text-sm text-slate-500">Sin usuarios.</div>}
            {users.map(u=>(
              <div key={u.id} className="p-2 text-sm flex items-center justify-between">
                <div>
                  <b>{u.name}</b> · {u.email} · <span className="uppercase">{u.role}</span>
                  <span className="ml-2 text-xs text-slate-500">id:{u.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>resetPassword(u.email)} className="text-slate-700 hover:underline">Reset pass</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Permisos por Space */}
        <div className="col-span-12">
          <div className="text-sm font-medium mb-2 mt-4">Permisos por Space</div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3">
              <label className="text-xs">Space ID</label>
              <input className="w-full border rounded px-2 py-1"
                     value={space.id} onChange={e=>setSpace({...space,id:e.target.value})}/>
            </div>
            <div className="col-span-4">
              <label className="text-xs">Nuevo propietario (email)</label>
              <input className="w-full border rounded px-2 py-1"
                     value={space.ownerEmail} onChange={e=>setSpace({...space,ownerEmail:e.target.value})}/>
            </div>
            <div className="col-span-2">
              <label className="text-xs">read_token</label>
              <input className="w-full border rounded px-2 py-1"
                     value={space.readToken} onChange={e=>setSpace({...space,readToken:e.target.value})}/>
            </div>
            <div className="col-span-2">
              <label className="text-xs">write_token</label>
              <input className="w-full border rounded px-2 py-1"
                     value={space.writeToken} onChange={e=>setSpace({...space,writeToken:e.target.value})}/>
            </div>
            <div className="col-span-12 flex gap-2">
              <button onClick={transferOwnership} className="px-3 py-1.5 rounded-lg border" disabled={loading}>Transferir propietario</button>
              <button onClick={updateTokens}    className="px-3 py-1.5 rounded-lg border" disabled={loading}>Actualizar tokens</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            * Un usuario **admin** puede leer/escribir cualquier Space.<br/>
            * Un usuario **owner** puede operar su Space sin `write_token`.<br/>
            * Un **user** sin propiedad necesita `write_token` para guardar, y `read_token` si lo exigiste para leer.
          </p>
        </div>
      </div>
    </Card>
  );
}

export { }


function OffPolicyPanel({ state, up }){
  const p = state.offPolicy || {};
  const days = [
    {k:1, lbl:'L'}, {k:2,lbl:'M'}, {k:3,lbl:'X'}, {k:4,lbl:'J'}, {k:5,lbl:'V'}, {k:6,lbl:'S'}, {k:0,lbl:'D'}
  ];
  function toggleDay(k){
    const set = new Set(p.limitOffDays || []);
    if (set.has(k)) set.delete(k); else set.add(k);
    // Reemplazo defensivo del objeto completo
    const curr = state.offPolicy || { enableLimitOffOnVacationWeek:true, limitOffDays:[3,4,5], enableBlockFullOffAdjacentWeeks:true, adjacencyWindow:1 };
    up(['offPolicy'], { ...curr, limitOffDays: Array.from(set).sort() });
  }
  return (
    <Card title="Semana OFF condicionada por vacaciones">
      <div className="grid grid-cols-12 gap-3 text-sm">
        <label className="col-span-12 flex items-center gap-2">
          <input type="checkbox"
                 checked={!!p.enableLimitOffOnVacationWeek}
                 onChange={e=>{
                   const curr = state.offPolicy || { enableLimitOffOnVacationWeek:true, limitOffDays:[3,4,5], enableBlockFullOffAdjacentWeeks:true, adjacencyWindow:1 };
                   up(['offPolicy'], { ...curr, enableLimitOffOnVacationWeek: e.target.checked });
                 }} />
          Si hay <b>vacaciones</b> en la semana, el OFF solo se respeta en los días seleccionados.
        </label>
        <div className="col-span-12">
          <div className="text-xs mb-1">Días OFF permitidos (por defecto X-J-V):</div>
          <div className="flex flex-wrap gap-2">
            {days.map(d=>(
              <label key={d.k} className={`px-2 py-1 rounded border cursor-pointer ${ (p.limitOffDays||[3,4,5]).includes(d.k) ? 'bg-slate-100' : ''}`}>
                <input type="checkbox" className="mr-1"
                       checked={(p.limitOffDays||[3,4,5]).includes(d.k)}
                       onChange={()=>toggleDay(d.k)} />
                {d.lbl}
              </label>
            ))}
          </div>
        </div>
        <label className="col-span-12 flex items-center gap-2">
          <input type="checkbox"
                 checked={!!p.enableBlockFullOffAdjacentWeeks}
                 onChange={e=>{
                   const curr = state.offPolicy || { enableLimitOffOnVacationWeek:true, limitOffDays:[3,4,5], enableBlockFullOffAdjacentWeeks:true, adjacencyWindow:1 };
                   up(['offPolicy'], { ...curr, enableBlockFullOffAdjacentWeeks: e.target.checked });
                 }} />
          Limitar también si hay vacaciones en la <b>semana anterior o posterior</b>.
        </label>
        <div className="col-span-6">
          <label className="text-xs block mb-1">Ventana adyacente (semanas)</label>
          <input
            type="number" min={1} max={4}
            value={p.adjacencyWindow||1}
            onChange={e=>{
              const v = Number(e.target.value);
              const curr = state.offPolicy || { enableLimitOffOnVacationWeek:true, limitOffDays:[3,4,5], enableBlockFullOffAdjacentWeeks:true, adjacencyWindow:1 };
              up(['offPolicy'], { ...curr, adjacencyWindow: isNaN(v) ? 1 : Math.max(1, Math.min(4, v)) });
            }}
            className="w-full border rounded px-2 py-1"
          />
        </div>
      </div>
    </Card>
  );
}

function RefuerzoPolicyPanel({ state, up }){
  const pol = state.refuerzoPolicy || { allowedMonths:[], includeSaturdays:false, maxPerWeekPerPerson:1, maxPerMonthPerPerson:4, horizonDefault:'fin' };
  const months = [
    {k:1,'lbl':'Ene'},{k:2,'lbl':'Feb'},{k:3,'lbl':'Mar'},{k:4,'lbl':'Abr'},
    {k:5,'lbl':'May'},{k:6,'lbl':'Jun'},{k:7,'lbl':'Jul'},{k:8,'lbl':'Ago'},
    {k:9,'lbl':'Sep'},{k:10,'lbl':'Oct'},{k:11,'lbl':'Nov'},{k:12,'lbl':'Dic'}
  ];
  function toggleMonth(m){
    const set = new Set(pol.allowedMonths||[]);
    if (set.has(m)) set.delete(m); else set.add(m);
    up(['refuerzoPolicy'], { ...pol, allowedMonths: Array.from(set).sort((a,b)=>a-b) });
  }
  return (
    <Card title="Política de refuerzos (conciliación)">
      <div className="grid grid-cols-12 gap-3 text-sm">
        <div className="col-span-12">
          <div className="text-xs mb-1">Meses donde SÍ proponer refuerzos:</div>
          <div className="flex flex-wrap gap-2">
            {months.map(m=>(
              <label key={m.k} className={`px-2 py-1 rounded border cursor-pointer ${(pol.allowedMonths||[]).includes(m.k)?'bg-slate-100':''}`}>
                <input type="checkbox" className="mr-1"
                  checked={(pol.allowedMonths||[]).includes(m.k)}
                  onChange={()=>toggleMonth(m.k)} />
                {m.lbl}
              </label>
            ))}
          </div>
        </div>

        <div className="col-span-6">
          <label className="text-xs block mb-1">Máx refuerzos/semana/persona</label>
          <input type="number" min={0} max={14}
            value={pol.maxPerWeekPerPerson||0}
            onChange={e=>up(['refuerzoPolicy'], { ...pol, maxPerWeekPerPerson: Math.max(0, Number(e.target.value)||0) })}
            className="w-full border rounded px-2 py-1" />
        </div>
        <div className="col-span-6">
          <label className="text-xs block mb-1">Máx refuerzos/mes/persona</label>
          <input type="number" min={0} max={31}
            value={pol.maxPerMonthPerPerson||0}
            onChange={e=>up(['refuerzoPolicy'], { ...pol, maxPerMonthPerPerson: Math.max(0, Number(e.target.value)||0) })}
            className="w-full border rounded px-2 py-1" />
        </div>

        <label className="col-span-12 flex items-center gap-2">
          <input type="checkbox"
            checked={!!pol.includeSaturdays}
            onChange={e=>up(['refuerzoPolicy'], { ...pol, includeSaturdays: e.target.checked })} />
          Incluir sábados (si no, sólo L–V)
        </label>
      </div>
    </Card>
  );
}

function VacationPolicyPanel({ state, up }){
  const vp = state.vacationPolicy || { mode:'allow', months:[] };
  const months = [
    {k:1,'lbl':'Ene'},{k:2,'lbl':'Feb'},{k:3,'lbl':'Mar'},{k:4,'lbl':'Abr'},
    {k:5,'lbl':'May'},{k:6,'lbl':'Jun'},{k:7,'lbl':'Jul'},{k:8,'lbl':'Ago'},
    {k:9,'lbl':'Sep'},{k:10,'lbl':'Oct'},{k:11,'lbl':'Nov'},{k:12,'lbl':'Dic'}
  ];
  function setMode(mode){ up(['vacationPolicy'], { ...vp, mode }); }
  function toggleMonth(m){
    const set = new Set(vp.months || []);
    if (set.has(m)) set.delete(m); else set.add(m);
    up(['vacationPolicy'], { ...vp, months: Array.from(set).sort((a,b)=>a-b) });
  }
  return (
    <Card title="Política de Vacaciones (meses)">
      <div className="grid grid-cols-12 gap-3 text-sm">
        <div className="col-span-12 flex items-center gap-4">
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="vp-mode" checked={(vp.mode||'allow')==='allow'} onChange={()=>setMode('allow')} />
            Permitir SOLO en los meses seleccionados
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="vp-mode" checked={vp.mode==='block'} onChange={()=>setMode('block')} />
            Bloquear los meses seleccionados
          </label>
        </div>
        <div className="col-span-12">
          <div className="flex flex-wrap gap-2">
            {months.map(m=>(
              <label key={m.k} className={`px-2 py-1 rounded border cursor-pointer ${ (vp.months||[]).includes(m.k) ? 'bg-slate-100' : ''}`}>
                <input type="checkbox" className="mr-1"
                  checked={(vp.months||[]).includes(m.k)}
                  onChange={()=>toggleMonth(m.k)} />
                {m.lbl}
              </label>
            ))}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            * Modo <b>Permitir</b>: sólo se aceptan vacaciones en esos meses. <b>Bloquear</b>: se impiden en esos meses.
          </div>
        </div>
      </div>
    </Card>
  );
}


function AuthenticatedApp(props){
  const { auth, setAuth, ui, setUI, showToast,
          state, setState,
          cloud, setCloud, cloudLoad, cloudSave,
          startDate, weeklyStart,
          userWeeks, setUserWeeks, weekIndex, setWeekIndex,
          canPrev, canNext, canNextRange,
          payroll, setPayroll,
          ASS, controls,
          exportCSV, exportJSON, importJSON, exportICS, exportPayroll,
          up, upPerson, forceAssign } = props;

  // --- scope admin (robusto tras refactor) ---
  // Aliases seguros para modal del día (local o via props)
  const modalDayProp = (typeof modalDay !== 'undefined') ? modalDay : (props.modalDay ?? null);
  const setModalDayProp = (typeof setModalDay !== 'undefined') ? setModalDay : props.setModalDay;

  const __ap_props = (typeof arguments !== "undefined" && arguments.length ? arguments[0] : {});
  const __ap_auth = (typeof auth !== "undefined" && auth) ? auth : (__ap_props && (__ap_props.auth || __ap_props.Auth || null));
  const isAdmin = !!(__ap_auth && __ap_auth.user && __ap_auth.user.role === "admin");

  // ---------- Exportaciones (CSV/ICS/Nómina) ----------
  
  
  
  

  

  
  // Auto-cargar nube una única vez para usuarios no-admin
  const [autoCloudLoaded, setAutoCloudLoaded] = useState(false);
  useEffect(() => {
    // Si el usuario NO es admin y le falta spaceId/readToken, rellenamos con los públicos
    if (auth.user && !isAdmin && (!cloud?.spaceId || !cloud?.readToken)) {
      setCloud(prev => ({ ...prev, spaceId: PUBLIC_SPACE.id, readToken: PUBLIC_SPACE.readToken }));
    }
  }, [auth.user, isAdmin]);

  useEffect(() => {
    if (auth.user && !isAdmin && !autoCloudLoaded) {
      (async () => {
        try { await cloudLoad(); } catch(e) {}
        finally { setAutoCloudLoaded(true); }
      })();
    }
  }, [auth.user, isAdmin, autoCloudLoaded]);

// ---------- Render principal ----------
  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <style>{`
        :root { color-scheme: light !important; }
        html, body { background: #f8fafc; color: #0f172a; }
        input, select, textarea, button { background:#fff!important; color:#0f172a!important; border-color: rgba(15,23,42,0.15)!important; }
        ::placeholder { color:#94a3b8; }
        .chip { background-color: rgba(15,23,42,0.04); border:1px solid rgba(15,23,42,0.15); }
      `}</style>

      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="w-full max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Gestor de Turnos · Usuarios + SQLite</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-slate-100 border">
              {auth.user?.name || auth.user?.email || "Usuario"} · {auth.user?.role || ""}
            </span>
            {isAdmin && (<button onClick={()=>setState(prev=>({...prev, rebalance:!prev.rebalance}))}
              className={`px-3 py-1.5 rounded-lg border ${state.rebalance?'bg-emerald-50 border-emerald-300':'border-slate-300 hover:bg-slate-100'}`}>
              {state.rebalance? 'Reequilibrio ON':'Reequilibrar'}
            </button>)}

            {/* Export/Import local */}{/* Controles Nube */}{isAdmin && (
<>
<>
            <button onClick={props.exportCSV} className="px-3 py-1.5 rounded-lg border">CSV</button>
            <button onClick={props.exportJSON} className="px-3 py-1.5 rounded-lg border">Export JSON</button>
            <label className="px-3 py-1.5 rounded-lg border cursor-pointer">Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files && props.importJSON(e.target.files[0])}/>
            </label>

            
</>
<input className="border rounded px-2 py-1 w-32" placeholder="Space ID"
              value={cloud.spaceId} onChange={e=>setCloud({...cloud,spaceId:e.target.value})}/>
            <input className="border rounded px-2 py-1 w-28" placeholder="ReadToken"
              value={cloud.readToken} onChange={e=>setCloud({...cloud,readToken:e.target.value})}/>
            <input className="border rounded px-2 py-1 w-28" placeholder="WriteToken"
              value={cloud.writeToken} onChange={e=>setCloud({...cloud,writeToken:e.target.value})}/>
            <button onClick={props.cloudLoad} className="px-3 py-1.5 rounded-lg border">Cargar nube</button>
            <button onClick={props.cloudSave} className="px-3 py-1.5 rounded-lg border">Guardar nube</button>
  </>
)}
{ui.sync==="loading" && <span className="px-2 py-1 rounded bg-amber-100 border border-amber-300">Sincronizando…</span>}
            {ui.sync==="ok" && <span className="px-2 py-1 rounded bg-emerald-100 border border-emerald-300">¡Listo!</span>}
            {ui.sync==="error" && <span className="px-2 py-1 rounded bg-rose-100 border border-rose-300">Error</span>}
            {ui.toast && (<div className="fixed right-4 bottom-4 z-50 bg-black text-white px-3 py-2 rounded-lg shadow">{ui.toast}</div>)}
            <button onClick={()=>props.setAuth({ token:"", user:null })} className="px-2 py-1 rounded border">Salir</button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1800px] mx-auto px-6 py-6 grid lg:grid-cols-3 gap-6">
        {/* Configuración */}
        <section className="lg:col-span-1 space-y-6">
          {isAdmin && (<><ConfigBasica state={state} up={up} />
          <ReglasPanel state={state} up={up} isAdmin={isAdmin} />
          
          <OffPolicyPanel state={state} up={up} />
          <VacationPolicyPanel state={state} up={up} />
          <RefuerzoPolicyPanel state={state} up={up} />
<ConciliacionPanel state={state} up={up} />
          <Card title="Debug">
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!(state?.debug?.score)}
                  onChange={e=>up(['debug','score'], e.target.checked)}
                />
                Mostrar ScoreDebugPanel
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!(state?.debug?.weekendAudit)}
                  onChange={e=>up(['debug','weekendAudit'], e.target.checked)}
                />
                Mostrar WeekendAuditPanel
              </label>

              {state?.debug?.weekendAudit === true && (
                <div className="mt-3">
                  <Card title="Weekend audit (Admin)">
                    <WeekendAuditPanel
                      assignments={ASS}
                      people={state.people}
                      startDate={startDate}
                      weeks={state.weeks}
                    />
                  </Card>
                </div>
              )}
            </div>
          </Card>
          <PersonasPanel state={state} upPerson={upPerson} />
          <TurnosPanel state={state} up={up} />
          <FestivosPanel state={state} up={up} />
          <CustomHolidaysPanel state={state} up={up} /></>)}
        </section>

        {/* Calendarios y reportes */}
        <section className="lg:col-span-2 space-y-6">
          <Card title="Vista semanal por persona (principal)">
  <div className="flex items-center justify-between mb-2">
    <div className="text-sm">
      {(() => { 
         const s = weeklyStart; 
         const e = addDays(weeklyStart, userWeeks*7 - 1);
         const fmt = d => d.toLocaleDateString(undefined,{ day:"2-digit", month:"short", year:"numeric"});
         return s ? `${fmt(s)} – ${fmt(e)}` : "";
      })()}
    </div>
    <div className="flex items-center gap-2">
      <button disabled={!canPrev} onClick={()=>setWeekIndex(w=>Math.max(0,w-1))}
        className={`px-2 py-1 rounded border ${canPrev? "hover:bg-slate-100":"opacity-50 cursor-not-allowed"}`}>◀︎</button>
      <button onClick={()=>{ const t=startOfWeekMonday(new Date()); const idx=Math.max(0, Math.min(state.weeks-1, Math.floor((t - startDate)/(7*24*3600*1000)))); setWeekIndex(idx); }}
        className="px-2 py-1 rounded border">Hoy</button>
      <button disabled={!canNextRange} onClick={()=>setWeekIndex(w=> Math.min(state.weeks-userWeeks, w+1))}
        className={`px-2 py-1 rounded border ${canNextRange? "hover:bg-slate-100":"opacity-50 cursor-not-allowed"}`}>▶︎</button>
      <select value={userWeeks} onChange={e=>setUserWeeks(Number(e.target.value))}
        className="ml-2 border rounded px-2 py-1 text-sm">
        <option value={1}>1 semana</option>
        <option value={2}>2 semanas</option>
        <option value={4}>4 semanas</option>
        <option value={8}>8 semanas</option>
      </select>
    </div>
  </div>
  
  {/* Leyenda (visible para todos) */}
  <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">➕ Refuerzo</span>
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">🎌 Festivo</span>
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">🗓️ Finde</span>
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">🍽️ Comida restada</span>
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">🏖️ Vacaciones</span>
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">🛌 Libranza</span>
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-transparent">✈️ Viaje</span>
  </div>
<WeeklyView
    startDate={weeklyStart}
    weeks={userWeeks}
    assignments={ASS}
    people={state.people}
    timeOffs={state.timeOffs}
    province={state.province}
    closeOnHolidays={state.closeOnHolidays}
    closedExtraDates={state.closedExtraDates}
    customHolidaysByYear={state.customHolidaysByYear}
    consumeVacationOnHoliday={state.consumeVacationOnHoliday}
  />
</Card>

          {isAdmin && (<Card title="Vista semanal por persona">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm">Semana {weekIndex+1} / {state.weeks} · {(() => { const s=weeklyStart; const e=addDays(weeklyStart,6); const fmt=d=>d.toLocaleDateString(undefined,{ day:"2-digit", month:"short", year:"numeric"}); return s ? `${fmt(s)} – ${fmt(e)}` : ""; })()}</div>
              <div className="flex items-center gap-2">
                <button disabled={!canPrev} onClick={()=>setWeekIndex(w=>Math.max(0,w-1))} className={`px-2 py-1 rounded border ${canPrev? 'hover:bg-slate-100':'opacity-50 cursor-not-allowed'}`}>◀︎</button>
                <button disabled={!canNext} onClick={()=>setWeekIndex(w=>Math.min(state.weeks-1,w+1))} className={`px-2 py-1 rounded border ${canNext? 'hover:bg-slate-100':'opacity-50 cursor-not-allowed'}`}>▶︎</button>
                <button onClick={()=>window.print()} className="px-3 py-1.5 rounded-lg border">Imprimir / PDF</button>
              </div>
            </div>
            <WeeklyView startDate={weeklyStart} weeks={1} assignments={ASS} people={state.people} timeOffs={state.timeOffs} province={state.province} closeOnHolidays={state.closeOnHolidays} closedExtraDates={state.closedExtraDates} customHolidaysByYear={state.customHolidaysByYear} consumeVacationOnHoliday={state.consumeVacationOnHoliday} />
          </Card>)}

          <TimeOffPanel state={state} setState={setState} controls={controls} isAdmin={isAdmin} currentUser={auth.user} />
          <SwapsPanel state={state} setState={setState} assignments={ASS}  isAdmin={isAdmin} currentUser={auth.user} />
          {isAdmin && <RefuerzosPanelLite state={state} up={up} assignments={ASS} />}
          {isAdmin && <GeneradorPicos state={state} up={up} />}{isAdmin && (
                    <PropuestaCierre
            state={state}
            startDate={startDate}
            weeks={state.weeks}
            people={state.people}
            assignments={ASS}
            onApply={(evs, mode='append', batchId=null) => {
              const tag = (e)=> ({...e, meta:{ ...(e.meta||{}), source:'conciliacion', batchId }});
              const tagged = (evs||[]).map(tag);
              const base = mode==='replace'
                ? (state.events||[]).filter(e=> !(e?.meta?.source==='conciliacion'))
                : (state.events||[]);
              const next = [...base, ...tagged];
              up(['events'], next);
              if (batchId) up(['managed','lastConciliationBatchId'], batchId);
            }
            }annualTarget={state.annualTargetHours}
          />
            )}
            {(isAdmin && (state?.debug?.weekendAudit===true)) && (
              <Card title="Weekend audit (Admin)">
                <WeekendAuditPanel
                  assignments={ASS}
                  people={state.people}
                  startDate={startDate}
                  weeks={state.weeks}
                />
              </Card>
            )}

            {(isAdmin && (state?.debug?.score===true)) && (<ScoreDebugPanel
            assignments={ASS}
            people={state.people}
            startDate={startDate}
            weeks={state.weeks}
            conciliacion={state.conciliacion}
            applyConciliation={state.applyConciliation}
            onToggleApply={(v)=>up(['applyConciliation'], v)}
          />

          )}{isAdmin && (<Card title="Nómina (CSV por rango)">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6"><label className="text-xs">Desde</label><input type="date" value={payroll.from} onChange={(e)=>setPayroll({...payroll,from:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
              <div className="col-span-6"><label className="text-xs">Hasta</label><input type="date" value={payroll.to} onChange={(e)=>setPayroll({...payroll,to:e.target.value})} className="w-full px-2 py-1 rounded border"/></div>
              <div className="col-span-12"><button onClick={props.exportPayroll} className="px-3 py-1.5 rounded-lg border w-full">Exportar Nómina (CSV)</button></div>
            </div>
          </Card>

          )}{isAdmin && (<ResumenPanel controls={controls} annualTarget={state.annualTargetHours} onExportICS={exportICS} />
        )}</section>

        {auth.user.role === 'admin' && (
          <section className="lg:col-span-3 space-y-6">
            <AdminUsersAndPerms auth={auth} />
          </section>
        )}
      </main>

      <footer className="w-full max-w-[1800px] mx-auto px-6 pb-10 text-xs text-slate-500">Persistencia local + Nube SQLite. </footer>

       {modalDayProp && (
        <DayModal
          dateStr={modalDayProp}
          date={parseDateValue(modalDayProp)}
          assignments={ASS[modalDayProp]||[]}
          people={state.people}
          onOverride={forceAssign}
          isAdmin={isAdmin}
          onClose={()=>setModalDayProp(null)}
        />
      )}
    </div>
  );
}
function RefuerzosPanelLite({ state, up, assignments }){
  const [ev,setEv] = useState({
    label:'Black Friday',
    start: state.startDate,
    end: state.startDate,
    weekdaysExtraSlots:1,
    weekendExtraSlots:1
  });

  // alta rápida
  const add = ()=> up(['events'], [...(state.events||[]), {...ev}]);
  const delAtIndex = (absIdx)=> up(['events'], (state.events||[]).filter((_,i)=> i!==absIdx));
  const setFieldAt = (absIdx, field, value)=> up(['events'], (state.events||[]).map((e,i)=> i===absIdx? {...e, [field]: value}: e));

  // tabla + filtros
  const events = state.events || [];
  const [q,setQ]       = useState('');
  const [from,setFrom] = useState('');
  const [to,setTo]     = useState('');
  const [sort,setSort] = useState({ key:'start', dir:'asc' });
  const [page,setPage] = useState(0);
  const [pageSize,setPageSize] = useState(25);

  const inRange = (e)=> (!from || e.start>=from) && (!to || e.end<=to);
  const matches = (e)=> !q || (e.label||'').toLowerCase().includes(q.toLowerCase());
  const toggleSort = (k)=> setSort(prev=> prev.key===k ? {key:k,dir:(prev.dir==='asc'?'desc':'asc')} : {key:k,dir:'asc'});
  const compare = (a,b)=> {
    const av = (a?.[sort.key] ?? ''), bv = (b?.[sort.key] ?? '');
    if (av<bv) return sort.dir==='asc'?-1:1;
    if (av>bv) return sort.dir==='asc'? 1:-1;
    return 0;
  };

  const filtered = useMemo(()=> events.filter(inRange).filter(matches).sort(compare), [events,q,from,to,sort]);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total/(pageSize||25)));
  const pageClamped = Math.min(page, pages-1);
  const startIdx = pageClamped*(pageSize||25);
  const rows = filtered.slice(startIdx, startIdx + (pageSize||25));
  const goto = (p)=> setPage(Math.max(0, Math.min(pages-1,p)));

  // ==== Asignación manual: helpers en scope de componente ====
  const dateRange = (from,to) => {
    const out=[]; if(!from||!to) return out;
    let d = parseDateValue(from), end = parseDateValue(to);
    while(d<=end){ out.push(toDateValue(d)); d=addDays(d,1); }
    return out;
  };
  const availabilityFor = (e, personId) => {
    if(!personId) return {free:0,total:0};
    const days = dateRange(e.start,e.end);
    let free=0;
    for(const ds of days){
      const day = (assignments?.[ds]||[]);
      const busy = day.some(a=>a?.personId===personId);
      if(!busy) free++;
    }
    return {free,total:days.length};
  };
  const setAssignee = (absIdx, personId) => {
    const next = (state.events||[]).map((ev,i)=> i===absIdx ? {...ev, assigneeId: personId} : ev);
    up(['events'], next);                // ← Asegúrate de que va ENTRE COMILLAS
  };

  const toggleForceAssignee = (absIdx, v) => {
    const next = (state.events||[]).map((ev,i)=> i===absIdx ? {...ev, assigneeForced: !!v} : ev);
    up(['events'], next);                // ← También con COMILLAS
  };
  return (
    <Card title="Eventos de Refuerzo (Admin)">
      {/* Alta rápida */}
      <div className="grid grid-cols-12 gap-2 mb-3">
        <div className="col-span-4">
          <label className="text-xs">Etiqueta</label>
          <input value={ev.label} onChange={e=>setEv({...ev,label:e.target.value})} className="w-full border rounded px-2 py-1"/>
        </div>
        <div className="col-span-2">
          <label className="text-xs">Desde</label>
          <input type="date" value={ev.start} onChange={e=>setEv({...ev,start:e.target.value})} className="w-full border rounded px-2 py-1"/>
        </div>
        <div className="col-span-2">
          <label className="text-xs">Hasta</label>
          <input type="date" value={ev.end} onChange={e=>setEv({...ev,end:e.target.value})} className="w-full border rounded px-2 py-1"/>
        </div>
        <div className="col-span-2">
          <label className="text-xs">L–V +</label>
          <input type="number" min={0} max={9} value={ev.weekdaysExtraSlots}
                 onChange={e=>setEv({...ev,weekdaysExtraSlots:Number(e.target.value)||0})}
                 className="w-full border rounded px-2 py-1"/>
        </div>
        <div className="col-span-2">
          <label className="text-xs">S–D +</label>
          <input type="number" min={0} max={9} value={ev.weekendExtraSlots}
                 onChange={e=>setEv({...ev,weekendExtraSlots:Number(e.target.value)||0})}
                 className="w-full border rounded px-2 py-1"/>
        </div>
        <div className="col-span-12"><button onClick={add} className="px-3 py-1.5 rounded-lg border w-full">Añadir evento</button></div>
      </div>

      {/* Filtros / orden / tamaño de página */}
      <div className="border rounded-lg p-2 mb-2 grid grid-cols-12 gap-2 text-sm bg-white">
        <div className="col-span-4">
          <label className="text-xs">Buscar etiqueta</label>
          <input className="w-full border rounded px-2 py-1" placeholder="buscar…"
                 value={q} onChange={e=>{ setQ(e.target.value); setPage(0); }}/>
        </div>
        <div className="col-span-3">
          <label className="text-xs">Desde</label>
          <input type="date" className="w-full border rounded px-2 py-1"
                 value={from} onChange={e=>{ setFrom(e.target.value); setPage(0); }}/>
        </div>
        <div className="col-span-3">
          <label className="text-xs">Hasta</label>
          <input type="date" className="w-full border rounded px-2 py-1"
                 value={to} onChange={e=>{ setTo(e.target.value); setPage(0); }}/>
        </div>
        <div className="col-span-2">
          <label className="text-xs">Items/página</label>
          <select className="w-full border rounded px-2 py-1" value={pageSize}
                  onChange={e=>{ setPageSize(Number(e.target.value)||25); setPage(0); }}>
            <option>10</option><option>25</option><option>50</option><option>100</option>
          </select>
        </div>
      </div>

      {/* Tabla paginada */}
      <div className="border rounded-lg overflow-x-auto">
        {total===0 && <div className="p-3 text-sm text-slate-500">Sin eventos.</div>}
        {total>0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 cursor-pointer" onClick={()=>toggleSort('label')}>Etiqueta</th>
                <th className="text-left p-2 cursor-pointer" onClick={()=>toggleSort('start')}>Desde</th>
                <th className="text-left p-2 cursor-pointer" onClick={()=>toggleSort('end')}>Hasta</th>
                <th className="text-right p-2">L–V +</th>
                <th className="text-right p-2">S–D +</th>
                <th className="text-right p-2">Asignación</th>
                <th className="text-right p-2">Acciones</th>
              </tr>
            </thead>
  <tbody>
     {(filtered.slice(startIdx, startIdx + (pageSize||25))).map((e,i)=>{
      const absIdx = (state.events||[]).findIndex(ev => ev===e);
      const pid = e.assigneeId || ""
      const ppl = (state.people || [])
      const avail = availabilityFor(e, pid)
      return (
        <tr key={`${e.start}-${e.end}-${i}`} className="border-b">
          <td className="p-2">
            <input className="border rounded px-2 py-1 w-full" value={e.label||''}
                   onChange={ev=>setFieldAt(absIdx,'label',ev.target.value)} />
          </td>
          <td className="p-2">
            <input type="date" className="border rounded px-2 py-1 w-full" value={e.start}
                   onChange={ev=>setFieldAt(absIdx,'start',ev.target.value)} />
          </td>
          <td className="p-2">
            <input type="date" className="border rounded px-2 py-1 w-full" value={e.end}
                   onChange={ev=>setFieldAt(absIdx,'end',ev.target.value)} />
          </td>
          <td className="p-2 text-right">
            <input type="number" min={0} max={9} className="border rounded px-2 py-1 w-20 text-right"
                   value={e.weekdaysExtraSlots||0}
                   onChange={ev=>setFieldAt(absIdx,'weekdaysExtraSlots',Number(ev.target.value)||0)} />
          </td>
          <td className="p-2 text-right">
            <input type="number" min={0} max={9} className="border rounded px-2 py-1 w-20 text-right"
                   value={e.weekendExtraSlots||0}
                   onChange={ev=>setFieldAt(absIdx,'weekendExtraSlots',Number(ev.target.value)||0)} />
          </td>
          <td className="p-2 text-right">
            {(() => {
              const absIdx = (state.events || []).findIndex(ev => ev === e); // índice absoluto
              const pid    = e.assigneeId || "";
              const ppl    = state.people || [];
              const avail  = availabilityFor(e, pid);

              return (
                <div className="flex items-center gap-2 justify-end">
                  <select
                    className="border rounded px-2 py-1"
                    value={pid}
                    onChange={ev => setAssignee(absIdx, ev.target.value)}
                  >
                    <option value="">—</option>
                    {ppl.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>

                  <label className="text-xs inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={!!e.assigneeForced}
                      onChange={ev => toggleForceAssignee(absIdx, ev.target.checked)}
                    />
                    Forzar
                  </label>

                  {pid && (
                    <span
                      className={(avail.free===avail.total ? "text-emerald-600" : "text-amber-600") + " text-xs"}
                      title="días libres/total"
                    >
                      libre {avail.free}/{avail.total}
                    </span>
                  )}
                </div>
              );
            })()}
          </td>
          <td className="p-2 text-right">
            <button onClick={()=>delAtIndex(absIdx)} className="text-red-600 hover:underline">Eliminar</button>
          </td>
        </tr>
      );
    })}
  </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {total>0 && (
        <div className="flex items-center justify-between mt-2 text-xs">
          <div>{startIdx+1}-{Math.min(total, startIdx+rows.length)} de {total}</div>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded border" disabled={pageClamped===0}
                    onClick={()=>goto(pageClamped-1)}>Prev</button>
            <span>Página {pageClamped+1}/{pages}</span>
            <button className="px-2 py-1 rounded border" disabled={pageClamped>=pages-1}
                    onClick={()=>goto(pageClamped+1)}>Next</button>
          </div>
        </div>
      )}
    </Card>
  );
}

