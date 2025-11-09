/* eslint-disable no-restricted-globals */
function parseDateValue(v){
  const [y,m,d] = v.split('-').map(Number);
  return new Date(y, m-1, d);
}
function toDateValue(d){
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function addDays(date, days){
  const d=new Date(date);
  d.setDate(d.getDate()+days);
  return d;
}
function startOfWeekMonday(date){
  const d=new Date(date);
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
}
function isWeekend(date){
  const dow=date.getDay();
  return dow===0 || dow===6;
}
function effectiveMinutes(shift){
  if (!shift) return 0;
  const parse=(hhmm)=>{
    if (typeof hhmm!== 'string' || !hhmm.includes(':')) return 0;
    const [h,m]=hhmm.split(':').map(Number);
    return (isFinite(h)?h:0)*60 + (isFinite(m)?m:0);
  };
  const raw = parse(shift.end) - parse(shift.start);
  const lunch = Number(shift.lunchMinutes||0);
  return Math.max(0, raw - (isFinite(lunch)?lunch:0));
}
function cloneAssignments(assignments){
  const out={};
  for (const k of Object.keys(assignments||{})){
    out[k]=(assignments[k]||[]).map(a=>({ ...a }));
  }
  return out;
}
function buildTimeOffIndex(timeOffDates){
  const index=new Map();
  if (!timeOffDates) return index;
  for (const [pid, dates] of Object.entries(timeOffDates)){
    index.set(pid, new Set(dates));
  }
  return index;
}
function buildClosedSet(closedDates){
  const set=new Set();
  if (Array.isArray(closedDates)){
    for (const d of closedDates) set.add(d);
  }
  return set;
}
function buildWorkingHolidaySet(arr){
  return new Set(Array.isArray(arr)?arr:[]);
}
function weekKey(dateStr){
  const d=parseDateValue(dateStr);
  return toDateValue(startOfWeekMonday(d));
}
function saturdayOfWeekend(date){
  const dt=parseDateValue(date);
  const dow=dt.getDay();
  const sat=new Date(dt);
  if (dow===0){
    sat.setDate(sat.getDate()-1);
  } else if (dow!==6){
    sat.setDate(sat.getDate()+(6-dow));
  }
  sat.setHours(0,0,0,0);
  return toDateValue(sat);
}
function computeStats(assignments, ctx){
  const stats=new Map();
  for (const pid of ctx.peopleIds){
    stats.set(pid, {
      totalMinutes:0,
      weeklyMinutes:new Map(),
      weeklyDays:new Map(),
      weekendKeys:new Set(),
      assignmentsByDate:new Map()
    });
  }
  for (const [dateStr, arr] of Object.entries(assignments)){
    for (const slot of arr){
      if (!slot || !slot.personId) continue;
      const s=stats.get(slot.personId);
      if (!s) continue;
      const mins=effectiveMinutes(slot.shift);
      s.totalMinutes+=mins;
      const wk=weekKey(dateStr);
      s.weeklyMinutes.set(wk,(s.weeklyMinutes.get(wk)||0)+mins);
      s.weeklyDays.set(wk,(s.weeklyDays.get(wk)||0)+1);
      s.assignmentsByDate.set(dateStr,(s.assignmentsByDate.get(dateStr)||0)+1);
      if (isWeekend(parseDateValue(dateStr)) || ctx.workingHolidaySet.has(dateStr)){
        s.weekendKeys.add(saturdayOfWeekend(dateStr));
      }
    }
  }
  return stats;
}
function maxConsecutiveWeekends(set){
  if (!set || !set.size) return 0;
  const arr=[...set].sort();
  let best=1, cur=1;
  for (let i=1;i<arr.length;i++){
    const prev=parseDateValue(arr[i-1]);
    const curDate=parseDateValue(arr[i]);
    const diff=(curDate-prev)/(7*24*3600*1000);
    if (Math.abs(diff-1)<1e-6){
      cur+=1;
      if (cur>best) best=cur;
    } else {
      cur=1;
    }
  }
  return best;
}
function personWeekViolates(stats, pid, week, minsDelta, dayDelta, rules){
  const st=stats.get(pid);
  if (!st) return false;
  const minutes=(st.weeklyMinutes.get(week)||0)+minsDelta;
  if (rules.maxWeeklyHours && minutes > rules.maxWeeklyHours*60) return true;
  const days=(st.weeklyDays.get(week)||0)+dayDelta;
  if (rules.maxDaysPerWeek && days > rules.maxDaysPerWeek) return true;
  return false;
}
function wouldBreakWeekendLimit(stats, pid, dateStr, rules, ctx){
  if (!rules.maxConsecutiveWeekends) return false;
  const st=stats.get(pid);
  if (!st) return false;
  const isWeekendDay = isWeekend(parseDateValue(dateStr)) || ctx.workingHolidaySet.has(dateStr);
  if (!isWeekendDay) return false;
  const wk=saturdayOfWeekend(dateStr);
  if (st.weekendKeys.has(wk)) return false;
  const set=new Set(st.weekendKeys);
  set.add(wk);
  return maxConsecutiveWeekends(set) > rules.maxConsecutiveWeekends;
}
function canAssign(ctx, stats, pid, dateStr, shift){
  if (!pid) return false;
  const timeOffSet=ctx.timeOffIndex.get(pid);
  if (timeOffSet && timeOffSet.has(dateStr)) return false;
  if (ctx.closedDates.has(dateStr) && !ctx.workingHolidaySet.has(dateStr)) return false;
  const st=stats.get(pid);
  if (st && st.assignmentsByDate.get(dateStr)) return false;
  const mins=effectiveMinutes(shift);
  if (ctx.rules.maxDailyHours && mins > ctx.rules.maxDailyHours*60) return false;
  const wk=weekKey(dateStr);
  if (personWeekViolates(stats, pid, wk, mins, 1, ctx.rules)) return false;
  if (wouldBreakWeekendLimit(stats, pid, dateStr, ctx.rules, ctx)) return false;
  return true;
}
function applyChange(assignments, stats, change, ctx){
  const { dateStr, slotIndex, fromPerson, toPerson, shift } = change;
  const arr=assignments[dateStr];
  if (!arr) return false;
  const slot = arr[slotIndex];
  if (!slot) return false;
  arr[slotIndex]={ ...slot, personId: toPerson };
  const mins=effectiveMinutes(shift);
  const wk=weekKey(dateStr);
  const fromStats=stats.get(fromPerson);
  if (fromStats){
    fromStats.totalMinutes-=mins;
    fromStats.weeklyMinutes.set(wk, Math.max(0,(fromStats.weeklyMinutes.get(wk)||0)-mins));
    const curDays=Math.max(0,(fromStats.weeklyDays.get(wk)||0)-1);
    fromStats.weeklyDays.set(wk, curDays);
    const dCount=(fromStats.assignmentsByDate.get(dateStr)||1)-1;
    if (dCount<=0) fromStats.assignmentsByDate.delete(dateStr);
    else fromStats.assignmentsByDate.set(dateStr,dCount);
    if (isWeekend(parseDateValue(dateStr)) || ctx.workingHolidaySet.has(dateStr)){
      let still=false;
      for (const [d,count] of fromStats.assignmentsByDate.entries()){
        if (count && (isWeekend(parseDateValue(d)) || ctx.workingHolidaySet.has(d)) && saturdayOfWeekend(d)===saturdayOfWeekend(dateStr)){
          still=true; break;
        }
      }
      if (!still) fromStats.weekendKeys.delete(saturdayOfWeekend(dateStr));
    }
  }
  const toStats=stats.get(toPerson);
  if (toStats){
    toStats.totalMinutes+=mins;
    toStats.weeklyMinutes.set(wk,(toStats.weeklyMinutes.get(wk)||0)+mins);
    toStats.weeklyDays.set(wk,(toStats.weeklyDays.get(wk)||0)+1);
    toStats.assignmentsByDate.set(dateStr,(toStats.assignmentsByDate.get(dateStr)||0)+1);
    if (isWeekend(parseDateValue(dateStr)) || ctx.workingHolidaySet.has(dateStr)){
      toStats.weekendKeys.add(saturdayOfWeekend(dateStr));
    }
  }
  return true;
}
function computeMetrics(stats, realStats){
  const perPerson=[];
  for (const [pid, st] of stats.entries()){
    const real = realStats?.get(pid);
    const realMinutes = real ? real.totalMinutes : 0;
    perPerson.push({
      personId: pid,
      totalMinutes: st.totalMinutes,
      diffMinutes: st.totalMinutes - realMinutes,
      weekendCount: st.weekendKeys.size
    });
  }
  const mean = perPerson.reduce((acc,it)=>acc+it.totalMinutes,0)/(perPerson.length||1);
  const variance = perPerson.reduce((acc,it)=>acc+Math.pow(it.totalMinutes-mean,2),0)/(perPerson.length||1);
  const stdDev = Math.sqrt(variance);
  return { perPerson, meanMinutes: mean, stdDev };
}
function optimizeLayer(payload){
  const { layer, context, objectives } = payload;
  const assignments = cloneAssignments(layer.assignments || {});
  const ctx = {
    rules: context.rules || {},
    timeOffIndex: buildTimeOffIndex(context.timeOffDates || {}),
    closedDates: buildClosedSet(context.closedDates || []),
    workingHolidaySet: buildWorkingHolidaySet(context.workingHolidays || []),
    peopleIds: context.peopleIds || []
  };
  const stats = computeStats(assignments, ctx);
  const realStats = computeStats(context.realAssignments || {}, ctx);
  const fairnessWeight = Number(objectives?.fairness||0);
  const maxIterations = 200;
  const changes=[];
  if (fairnessWeight > 0){
    for (let iter=0; iter<maxIterations; iter++){
      const sorted = Array.from(stats.entries()).map(([pid,st])=>({ pid, st }))
        .sort((a,b)=>b.st.totalMinutes - a.st.totalMinutes);
      const high=sorted[0];
      const low=sorted[sorted.length-1];
      if (!high || !low) break;
      if ((high.st.totalMinutes - low.st.totalMinutes) < 60) break;
      let moved=false;
      const candidateDates=[...high.st.assignmentsByDate.keys()].sort();
      for (const dateStr of candidateDates){
        const slots=assignments[dateStr];
        if (!slots) continue;
        for (let i=0;i<slots.length;i++){
          const slot=slots[i];
          if (!slot || slot.personId !== high.pid) continue;
          if (!canAssign(ctx, stats, low.pid, dateStr, slot.shift)) continue;
          const change={ dateStr, slotIndex:i, fromPerson: high.pid, toPerson: low.pid, shift: slot.shift };
          applyChange(assignments, stats, change, ctx);
          changes.push(change);
          moved=true;
          break;
        }
        if (moved) break;
      }
      if (!moved) break;
    }
  }
  const metrics = computeMetrics(stats, realStats);
  return { assignments, metrics, changes };
}
self.onmessage = (event) => {
  const { data } = event;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'run') {
    try {
      const result = optimizeLayer(data.payload);
      self.postMessage({ type:'result', jobId: data.jobId, layerId: data.layerId, result });
    } catch (err) {
      self.postMessage({ type:'error', jobId: data.jobId, layerId: data.layerId, error: err?.message || String(err) });
    }
  }
};
