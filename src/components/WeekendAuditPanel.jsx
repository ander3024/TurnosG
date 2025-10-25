export default function WeekendAuditPanel({ assignments }) {
  // Cuenta asignaciones en sábados/domingos visibles
  const days = Object.keys(assignments||{});
  let tot = 0;
  for (const d of days) {
    const dt = new Date(d);
    const dow = dt.getDay(); // 0=dom,6=sáb
    if (dow===0 || dow===6) tot += (assignments[d]?.length||0);
  }
  return (
    <div className="border rounded-xl p-3">
      <div className="text-sm font-medium mb-1">Weekend audit</div>
      <div className="text-sm text-slate-600">Asignaciones en findes (rango visible): <b>{tot}</b></div>
    </div>
  );
}
