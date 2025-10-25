import { useMemo } from "react";

function isWE(dateStr){
  const d = new Date(dateStr); const dow = d.getDay(); // 0=dom,6=sáb
  return dow===0 || dow===6;
}
function fmt(n){ return new Intl.NumberFormat('es-ES').format(n); }

export default function WeekendAuditPanel({ assignments = {}, people = [], startDate, weeks }){
  const data = useMemo(()=>{
    // Mapa persona -> métricas
    const map = new Map(people.map(p=>[p.id, {
      id:p.id, name:p.name, color:p.color,
      weekends:0, total:0, lastWasWE:false, maxStreak:0, streak:0
    }]));
    let weDays=0, weSlots=0, weUnassigned=0, totSlots=0;

    // Recorre días visibles (si recibimos startDate+weeks) o todo assignments
    const keys = Object.keys(assignments).sort();
    const from = startDate? new Date(startDate) : null;
    const to   = startDate? new Date(startDate.getTime()+(weeks*7-1)*86400000) : null;

    for (const k of keys){
      const inRange = !from || (new Date(k) >= from && new Date(k) <= to);
      if(!inRange) continue;
      const isWeekend = isWE(k);
      const arr = assignments[k] || [];
      totSlots += arr.length;
      if (isWeekend){ weDays++; weSlots += arr.length; }

      // huecos sin persona
      if (isWeekend){
        weUnassigned += arr.filter(a=>!a?.personId).length;
      }

      // por persona
      for (const a of arr){
        if(!a?.personId) continue;
        const rec = map.get(a.personId);
        if (!rec) continue;
        rec.total++;
        if (isWeekend){
          rec.weekends++;
          // racha de findes seguidos (por día, no por slot)
          if (!rec.lastWasWE){ rec.streak = 1; }
          else { rec.streak += 1; }
          if (rec.streak > rec.maxStreak) rec.maxStreak = rec.streak;
          rec.lastWasWE = true;
        } else {
          rec.lastWasWE = false;
          rec.streak = 0;
        }
      }
    }

    const rows = [...map.values()]
      .map(r=>({
        ...r,
        ratio: r.total ? r.weekends / r.total : 0
      }))
      .sort((a,b)=> b.weekends - a.weekends);

    const avgWE = rows.length ? rows.reduce((s,r)=>s+r.weekends,0)/rows.length : 0;
    // top y bottom (outliers)
    const top3 = rows.slice(0,3);
    const bottom3 = [...rows].reverse().slice(0,3);

    return {
      weDays, weSlots, weUnassigned, totSlots,
      avgWE, rows, top3, bottom3
    };
  }, [assignments, people, startDate, weeks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Weekend audit — rango visible</div>
        <div className="text-xs text-slate-500">
          Días WE: <b>{fmt(data.weDays)}</b> · Slots WE: <b>{fmt(data.weSlots)}</b> ·
          Sin asignar WE: <b className={data.weUnassigned? "text-rose-600": ""}>{fmt(data.weUnassigned)}</b> ·
          Slots totales: <b>{fmt(data.totSlots)}</b>
        </div>
      </div>

      {/* Top desequilibrio (más findes) */}
      <div className="grid md:grid-cols-3 gap-3">
        {data.top3.map(p=>(
          <div key={p.id} className="rounded-xl border p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-3 w-3 rounded" style={{background:p.color}}/>
              <div className="text-sm font-medium">{p.name}</div>
            </div>
            <div className="text-xs text-slate-600">
              WE: <b>{p.weekends}</b> · Total: {p.total} · Ratio WE: {(p.ratio*100).toFixed(0)}% ·
              Racha máx: {p.maxStreak}
            </div>
          </div>
        ))}
      </div>

      {/* Tabla completa */}
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
            {data.rows.map(p=>(
              <tr key={p.id} className="border-b">
                <td className="p-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded" style={{background:p.color}}/>
                    {p.name}
                  </div>
                </td>
                <td className="p-2 text-right">{fmt(p.weekends)}</td>
                <td className="p-2 text-right">{fmt(p.total)}</td>
                <td className="p-2 text-right">{(p.ratio*100).toFixed(0)}%</td>
                <td className="p-2 text-right">{fmt(p.maxStreak)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alertas rápidas */}
      <div className="text-xs">
        {data.weUnassigned>0 && (
          <div className="text-rose-600">⚠ Hay {fmt(data.weUnassigned)} huecos de fin de semana sin asignar.</div>
        )}
        {data.rows.length>0 && (
          <div className="text-slate-600">
            Media WE por persona: <b>{fmt(data.avgWE.toFixed(1))}</b>
          </div>
        )}
      </div>
    </div>
  );
}
