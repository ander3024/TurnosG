import React, { useMemo } from "react";

/**
 * props:
 *  - assignments: { [dateStr: string]: Array<{ personId: string, shift: {start:string,end:string,label?:string}, ... }> }
 *  - people: Array<{ id:string, name:string, color?:string }>
 *  - startDate: Date
 *  - weeks: number
 */
export default function WeekendAuditPanel({ assignments = {}, people = [], startDate, weeks }) {
  const data = useMemo(() => {
    const byId = new Map(people.map(p => [p.id, { id: p.id, name: p.name, color: p.color, weekends: 0, total: 0, maxStreak: 0 }]));
    let weDays = 0, weSlots = 0, weUnassigned = 0, totSlots = 0;

    const keys = Object.keys(assignments).sort();
    const from = startDate instanceof Date ? startDate : (startDate ? new Date(startDate) : null);
    const to   = startDate instanceof Date && Number.isFinite(+weeks)
      ? new Date(+startDate + (weeks*7-1)*24*3600*1000)
      : null;

    const inRange = (ds) => {
      if (!from || !to) return true;
      const d = new Date(ds);
      return d >= from && d <= to;
    };
    const isWE = (ds) => {
      const d = new Date(ds);
      const dow = d.getDay();
      return dow === 0 || dow === 6;
    };

    // simple “racha” por persona: contamos días WE consecutivos
    const streaks = new Map(); // id -> { lastWasWE:boolean, run:number }
    for (const id of byId.keys()) streaks.set(id, { lastWasWE:false, run:0 });

    for (const ds of keys) {
      if (!inRange(ds)) continue;
      const arr = Array.isArray(assignments[ds]) ? assignments[ds] : [];
      const weekend = isWE(ds);
      tot_slots: for (const a of arr) {
        // total de slots
        totSlots++;
        if (weekend) weSlots++;

        const pid = a?.personId;
        if (!pid) { if (weekend) weUnslide: weUnassigned++; continue tot_slots; }

        const rec = byId.get(pid);
        if (!rec) continue;
        rec.total++;

        if (weekend) {
          weDays += 0; // contamos por día aparte; ya contamos weSlots arriba
          const st = streaks.get(pid) || { lastWasWE:false, run:0 };
          st.run = st.lastWasWE ? (st.run + 1) : 1;
          st.lastWasWe = true;
          streaks.set(pid, st);
          if (st.run > rec.maxStreak) rec.maxStreak = st.run;
          rec.weekends++;
        } else {
          const st = streaks.get(pid);
          if (st) { st.lastWasWe = false; st.run = 0; streaks.set(pid, st); }
        }
      }
    }

    const rows = Array.from(byId.values()).map(r => ({
      ...r,
      ratio: r.total ? r.total === 0 ? 0 : r.weekends / r.total : 0
    })).sort((a,b) => b.weekends - a.weekends || a.name.localeCompare(b.name));

    const avgWE = rows.length ? rows.reduce((s,r)=>s + r.weekends, 0) / rows.length : 0;
    const stdev = rows.length ? Math.sqrt(rows.reduce((s,r)=> s + Math.pow(r.weekends - avgWE, 2), 0) / rows.length) : 0;
    const top3 = rows.slice(0, 3);

    return { rows, top3, weDays, weSlots, weUnassigned, totSlots, avgWE, stdev };
  }, [assignments, people, startDate, weeks]);

  const exportCSV = () => {
    const header = ["id","name","weekends","total","ratio","maxStreak"];
    const body = data.rows.map(r => [
      r.id, JSON.stringify(r.name??""), r.weekends, r.total, ((r.ratio*100)|0)+"%", r.maxStreak
    ].join(","));
    const blob = new Blob([ [header.join(","), ...body].join("\n") ], { type:"text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "weekend-audit.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fmt = (n) => new Intl.NumberFormat("es-ES").format(n);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Weekend audit (rango visible)</div>
        <div className="text-xs text-slate-600">
          WE días: <b>{fmt(data.weDays)}</b> · WE slots: <b>{fmt(data.weSlots)}</b> ·
          sin asignar: <b className={data.weUnassigned? "text-rose-600": ""}>{fmt(data.weUnassigned)}</b> ·
          total slots: <b>{fmt(data.totSlots)}</b>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg border text-sm">Exportar CSV</button>
      </div>

      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        {(data.rows || []).slice(0,4).map(p => {
          const z = data.stdev ? (p.weekends - data.avgWE) / data.stdev : 0;
          const tag = z >= 1 ? "🔴" : z >= 0.5 ? "🟡" : "🟢";
          return (
            <div key={p.id} className="rounded-xl border p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-3 w-3 rounded" style={{background:p.color}} />
                <div className="text-sm font-medium">{p.name} <span className="opacity-70">{tag}</span></div>
              </div>
              <div className="text-xs text-slate-600">
                WE: <b>{p.weekends}</b> · Total: {p.total} · Ratio WE: {(p.ratio*100|0)}% · Racha máx: {p.maxStreak}
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Persona</th>
              <th className="text-right p-2">WE</th>
              <th className="text-right p-2">Total</th>
              <th className="text-right p-2">Ratio WE</th>
              <th className="text-right p-2">Racha WE</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(p => (
              <tr key={p.id} className="border-b">
                <td className="p-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded" style={{background:p.color}}/>
                    {p.name}
                  </div>
                </td>
                <td className="p-2 text-end">{fmt(p.weekends)}</td>
                <td className="p-2 text-end">{fmt(p.total)}</td>
                <td className="p-2 text-end">{(p.xRatio||p.ratio).toLocaleString(undefined,{maximumFractionDigits:0})}%</td>
                <td className=" p-2 text-end">{fmt(p.maxStreak)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
