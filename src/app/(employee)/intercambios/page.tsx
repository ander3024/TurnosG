"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, statusColor, statusLabel } from "@/lib/utils";
import {
  ArrowLeftRight, Check, X, Calendar, Send, ChevronLeft, ChevronRight,
  Sunrise, Moon, Sun, Palmtree, Trash2, Info, BedDouble, Scale,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

// ─── Types ──────────────────────────────────────────────
interface TeamAssignment { personCode: string | null; personName: string | null; personColor: string | null; shiftLabel: string; startTime: string; endTime: string }
interface OffPerson { personCode: string; personName: string; personColor: string }
interface DayData { date: string; isClosed: boolean; shifts: { code: string; label: string; startTime: string; endTime: string; hours: number }[]; timeOff: { type: string } | null; teamAssignments: TeamAssignment[]; offPeople?: OffPerson[]; teamTimeOffs?: { personCode: string; personName: string; personColor: string; type: string }[] }
interface Person { id: number; code: string; name: string; color: string }
interface Swap { id: number; fromUser: { id: number; name: string }; toUser: { id: number; name: string }; fromPerson: Person; toPerson: Person; fromDate: string; toDate: string; fromShiftLabel: string; toShiftLabel: string; status: string; reason: string | null; createdAt: string; isOneWay?: boolean; settled?: boolean }
interface SwapPair { myDate: string; myShift: string; theirDate: string; theirShift: string; person: Person }
interface DebtBalance { person: Person; iOwe: number; theyOwe: number; net: number; details: { date: string; shift: string; direction: string }[] }

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS_S = ["L","M","X","J","V","S","D"];

function shiftStyle(label: string) {
  const l = label.toLowerCase();
  if (l.includes("finde") || l.includes("fin")) return { Icon: Sun, color: "text-amber-600", bg: "bg-amber-50", letter: "F" };
  if (l.includes("tarde")) return { Icon: Moon, color: "text-indigo-600", bg: "bg-indigo-50", letter: "T" };
  return { Icon: Sunrise, color: "text-orange-500", bg: "bg-orange-50", letter: "M" };
}

function fmtShort(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Main Component ─────────────────────────────────────
export default function IntercambiosPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState<DayData[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [pairs, setPairs] = useState<SwapPair[]>([]);
  const [pendingShift, setPendingShift] = useState<{ date: string; shift: string } | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState<"new" | "pending" | "history" | "debts">("new");
  const [debts, setDebts] = useState<DebtBalance[]>([]);
  const toast = useToast();

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const nc = { cache: "no-store" as const };
      const [c, p, s, m, d] = await Promise.all([
        fetch(`/api/employee/calendar?start=${from}&end=${to}`, nc),
        fetch("/api/employee/people", nc),
        fetch("/api/employee/swaps", nc),
        fetch("/api/auth/me", nc),
        fetch("/api/employee/swaps/debts", nc),
      ]);
      if (c.ok) { const j = await c.json(); setDays(j.days || []); }
      if (p.ok) { const j = await p.json(); setPeople(Array.isArray(j) ? j : []); }
      if (s.ok) { const j = await s.json(); setSwaps(j.swaps || j.items || (Array.isArray(j) ? j : [])); }
      if (m.ok) { const j = await m.json(); setMyUserId(j.user?.id || j.id || null); }
      if (d.ok) { const j = await d.json(); setDebts(j.debts || []); }
    } catch { toast.error("Error al cargar datos"); } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { fetchData(); }, [fetchData]);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }

  const dayMap = new Map(days.map((d) => [d.date, d]));

  // Grid cells for desktop
  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const gridCells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) gridCells.push(null);
  for (let d = 1; d <= lastDay; d++) gridCells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  // Swap actions
  function clickMyShift(date: string, shift: string) {
    if (pendingShift?.date === date && pendingShift?.shift === shift) setPendingShift(null);
    else setPendingShift({ date, shift });
  }

  function clickTheirShift(date: string, shift: string, personCode: string) {
    if (!pendingShift) return;
    const p = people.find((pp) => pp.code === personCode);
    if (!p) return;

    // Validate: can't swap finde (12h) with weekday (8h)
    const myIsFinde = pendingShift.shift.toLowerCase().includes("finde") || pendingShift.shift.toLowerCase().includes("fin");
    const theirIsFinde = shift.toLowerCase().includes("finde") || shift.toLowerCase().includes("fin");
    if (myIsFinde !== theirIsFinde) {
      toast.warning(`No puedes intercambiar un turno de ${myIsFinde ? "fin de semana (12h)" : "entre semana (8h)"} por uno de ${theirIsFinde ? "fin de semana (12h)" : "entre semana (8h)"}. Las horas son diferentes.`);
      return;
    }

    setPairs([...pairs, { myDate: pendingShift.date, myShift: pendingShift.shift, theirDate: date, theirShift: shift, person: p }]);
    setPendingShift(null);
  }

  function clickOffPerson(date: string, personCode: string) {
    if (!pendingShift) return;
    const p = people.find((pp) => pp.code === personCode);
    if (!p) return;
    // One-way swap: they cover my shift, toShiftLabel = "Libra"
    setPairs([...pairs, { myDate: pendingShift.date, myShift: pendingShift.shift, theirDate: date, theirShift: "Libra", person: p }]);
    setPendingShift(null);
  }

  async function submitSwaps() {
    if (pairs.length === 0) return;
    setSending(true);
    try {
      let hasError = false;
      for (let i = 0; i < pairs.length; i++) {
        const pr = pairs[i];
        const res = await fetch("/api/employee/swaps", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toPersonId: pr.person.id, fromDate: pr.myDate, toDate: pr.theirDate, fromShiftLabel: pr.myShift, toShiftLabel: pr.theirShift, reason: i === 0 ? reason : undefined }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Error al enviar intercambio");
          hasError = true;
          break;
        }
      }
      if (!hasError) {
        toast.success("Intercambios propuestos correctamente");
        setPairs([]); setReason(""); fetchData();
      }
    } catch { toast.error("Error de conexión"); } finally { setSending(false); }
  }

  function clearAll() { setPairs([]); setPendingShift(null); setReason(""); }

  const pendingForMe = swaps.filter((s) => s.status === "pendiente" && s.toUser?.id === myUserId);
  const myPendingSent = swaps.filter((s) => s.status === "pendiente" && s.fromUser?.id === myUserId);
  const resolved = swaps.filter((s) => s.status !== "pendiente");

  async function respond(id: number, status: "aceptado" | "rechazado") {
    try {
      const res = await fetch(`/api/employee/swaps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.ok) {
        const data = await res.json();
        if (data.autoApproved) toast.success("Intercambio aprobado automáticamente");
        else if (status === "aceptado") toast.info("Aceptado — pendiente de aprobación del admin");
        else toast.success("Intercambio rechazado");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al responder");
      }
      fetchData();
    } catch { toast.error("Error de conexión"); }
  }

  // ─── Render a day cell (shared between desktop grid and mobile list) ───
  function DayContent({ day, dateStr, compact }: { day: DayData | undefined; dateStr: string; compact?: boolean }) {
    if (!day || day.isClosed) return null;
    const myShifts = day.shifts || [];
    const isPending = pendingShift?.date === dateStr;

    return (
      <div className={cn("flex flex-wrap gap-1", compact ? "" : "mt-1")}>
        {/* My shifts */}
        {myShifts.map((s, i) => {
          const st = shiftStyle(s.label);
          const paired = pairs.some((pr) => pr.myDate === dateStr && pr.myShift === s.label);
          const isSelected = pendingShift?.date === dateStr && pendingShift?.shift === s.label;
          return (
            <button key={i} onClick={(e) => { e.stopPropagation(); if (!paired) clickMyShift(dateStr, s.label); }}
              className={cn("inline-flex items-center gap-1 rounded-lg text-[11px] font-bold transition-all",
                compact ? "px-1.5 py-0.5" : "px-2 py-1",
                isSelected ? "bg-indigo-500 text-white shadow-md scale-105" :
                paired ? "bg-gray-200 text-gray-400" : cn(st.bg, "text-gray-900"),
                !paired && !isSelected && "active:scale-95 hover:shadow-sm"
              )}>
              <st.Icon className={cn("w-3 h-3", isSelected ? "text-white" : st.color)} />
              Tú
            </button>
          );
        })}
        {/* Team shifts */}
        {day.teamAssignments?.filter((ta) => !myShifts.some((ms) => ms.label === ta.shiftLabel)).map((ta, i) => {
          const st = shiftStyle(ta.shiftLabel);
          const canClick = !!pendingShift && !!ta.personCode;
          return (
            <button key={`t${i}`}
              onClick={(e) => { e.stopPropagation(); if (canClick && ta.personCode) clickTheirShift(dateStr, ta.shiftLabel, ta.personCode); }}
              className={cn("inline-flex items-center gap-1 rounded-lg border text-[11px] transition-all",
                compact ? "px-1.5 py-0.5" : "px-2 py-1",
                canClick ? "border-purple-300 bg-purple-50 hover:bg-purple-100 active:scale-95" : "border-gray-200 bg-white"
              )}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ta.personColor || "#9ca3af" }} />
              <span className="text-gray-700 truncate max-w-[60px]">{ta.personName}</span>
              <span className={cn("font-bold", st.color)}>{st.letter}</span>
            </button>
          );
        })}
        {/* Off people — clickable to propose coverage */}
        {day.offPeople?.map((op, i) => {
          const canClick = !!pendingShift && !!op.personCode;
          return (
            <button key={`off${i}`}
              onClick={(e) => { e.stopPropagation(); if (canClick) clickOffPerson(dateStr, op.personCode); }}
              className={cn("inline-flex items-center gap-1 rounded-lg border text-[11px] transition-all",
                compact ? "px-1.5 py-0.5" : "px-2 py-1",
                canClick ? "border-orange-300 bg-orange-50 hover:bg-orange-100 active:scale-95" : "border-gray-100 bg-gray-50"
              )}>
              <BedDouble className="w-3 h-3 text-gray-400" />
              <span className="text-gray-400 truncate max-w-[60px]">{op.personName}</span>
              <span className="text-[9px] font-bold text-gray-300">LIB</span>
            </button>
          );
        })}
        {day.timeOff && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold"><Palmtree className="w-3 h-3" />VAC</span>}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Intercambios de turno</h1>
        <p className="text-gray-500 text-sm">Propón intercambiar turnos con tus compañeros</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
        {([["new","Nuevo"],["pending",`Pendientes${pendingForMe.length>0?` (${pendingForMe.length})`:""}`],["debts",`Deudas${debts.some(d=>d.net!==0)?" •":""}`],["history","Historial"]] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-shrink-0",
            tab===k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          )}>{l}</button>
        ))}
      </div>

      {/* ═══ NEW SWAP ═══ */}
      {tab === "new" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Calendar */}
          <Card className="overflow-hidden">
            {/* Month nav */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-bold text-gray-900">{MONTHS[month]} {year}</span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
            </div>

            {/* Status bar */}
            {pendingShift && (
              <div className="px-4 py-2 bg-purple-50 border-b border-purple-200 text-xs text-purple-700">
                <strong>Selecciona el turno de un compañero</strong> (o uno que esté <strong>librando</strong>) para intercambiar con tu <strong>{pendingShift.shift}</strong> del {fmtShort(pendingShift.date)}
              </div>
            )}

            {/* Desktop grid */}
            <div className="hidden md:block p-2">
              <div className="grid grid-cols-7 mb-1">
                {DAYS_S.map((d, i) => <div key={d} className={cn("text-center text-[10px] font-bold py-1", i>=5?"text-amber-600":"text-gray-400")}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {gridCells.map((ds, idx) => {
                  if (!ds) return <div key={idx} className="min-h-[60px] bg-gray-50/30 rounded" />;
                  const day = dayMap.get(ds);
                  const dn = parseInt(ds.split("-")[2]);
                  const isPending = pendingShift?.date === ds;
                  const hasPair = pairs.some((pr) => pr.myDate === ds || pr.theirDate === ds);
                  return (
                    <div key={idx} className={cn("min-h-[60px] p-1 rounded",
                      idx%7>=5 && "bg-gray-50/50",
                      isPending && "ring-2 ring-purple-400 bg-purple-50/40",
                      hasPair && !isPending && "bg-indigo-50/30"
                    )}>
                      <span className="text-[10px] font-bold text-gray-600">{dn}</span>
                      <DayContent day={day} dateStr={ds} compact />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile list */}
            <div className="md:hidden max-h-[55vh] overflow-y-auto">
              {days.filter((d) => !d.isClosed && (d.shifts?.length > 0 || d.teamAssignments?.length > 0)).map((day) => {
                const dt = new Date(day.date + "T12:00:00");
                const dow = dt.getDay();
                const isPending = pendingShift?.date === day.date;
                const hasPair = pairs.some((pr) => pr.myDate === day.date || pr.theirDate === day.date);
                return (
                  <div key={day.date} className={cn("flex items-start gap-3 px-3 py-2.5 border-b border-gray-50",
                    isPending && "bg-purple-50", hasPair && !isPending && "bg-indigo-50/30"
                  )}>
                    <div className={cn("w-10 text-center flex-shrink-0 pt-0.5", isPending ? "text-purple-600" : "text-gray-500")}>
                      <div className="text-lg font-bold leading-none">{dt.getDate()}</div>
                      <div className="text-[9px] font-bold uppercase">{DAYS_S[dow === 0 ? 6 : dow - 1]}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <DayContent day={day} dateStr={day.date} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Right panel */}
          <div className="space-y-3">
            {sent ? (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="py-8 text-center">
                  <Check className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <p className="font-semibold text-emerald-800">Intercambios propuestos</p>
                  <p className="text-sm text-emerald-600">Tus compañeros recibirán una notificación</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Selected pairs */}
                <Card className={pairs.length > 0 ? "border-indigo-200" : ""}>
                  <CardHeader className="!py-3">
                    <span className="text-sm font-semibold text-gray-900">
                      {pairs.length > 0 ? `${pairs.length} intercambio${pairs.length > 1 ? "s" : ""} seleccionado${pairs.length > 1 ? "s" : ""}` : "Selecciona turnos"}
                    </span>
                  </CardHeader>
                  <CardContent className="!pt-0">
                    {pairs.length === 0 ? (
                      <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-blue-700 space-y-1">
                          <p><strong>1.</strong> Pulsa en <strong>tu turno</strong> (se marca azul)</p>
                          <p><strong>2.</strong> Pulsa en el turno de un <strong>compañero</strong> o en alguien que esté <strong>librando</strong></p>
                          <p>Si eliges a alguien librando, te cubrirá y le deberás un turno</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pairs.map((pr, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                            <div className="flex-1 min-w-0 text-xs">
                              <p className="font-semibold text-gray-900 truncate">Tu {pr.myShift} · {fmtShort(pr.myDate)}</p>
                              <div className="flex items-center gap-1 mt-0.5 text-gray-500">
                                <ArrowLeftRight className="w-3 h-3 flex-shrink-0" />
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pr.person.color }} />
                                <span className="truncate">{pr.person.name} {pr.theirShift} · {fmtShort(pr.theirDate)}</span>
                              </div>
                            </div>
                            <button onClick={() => setPairs(pairs.filter((_, j) => j !== i))} className="p-1 hover:bg-red-50 rounded flex-shrink-0">
                              <X className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Submit */}
                {pairs.length > 0 && (
                  <Card className="border-emerald-200">
                    <CardContent className="!py-3 space-y-3">
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)..." rows={2}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" />
                      <div className="flex gap-2">
                        <Button onClick={submitSwaps} loading={sending} className="flex-1">
                          <Send className="w-4 h-4" /> Proponer
                        </Button>
                        <Button variant="ghost" onClick={clearAll}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ PENDING ═══ */}
      {tab === "pending" && (
        <div className="space-y-3">
          {pendingForMe.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-gray-700">Solicitudes recibidas</h3>
              {pendingForMe.map((s) => (
                <SwapCard key={s.id} swap={s} actions={
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => respond(s.id, "aceptado")}><Check className="w-3 h-3" /> Aceptar</Button>
                    <Button size="sm" variant="danger" onClick={() => respond(s.id, "rechazado")}><X className="w-3 h-3" /> Rechazar</Button>
                  </div>
                } />
              ))}
            </>
          )}
          {myPendingSent.length > 0 && (
            <>
              <h3 className="text-sm font-bold text-gray-700 mt-4">Enviadas (esperando respuesta)</h3>
              {myPendingSent.map((s) => <SwapCard key={s.id} swap={s} actions={
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm("¿Cancelar esta solicitud de intercambio?")) return;
                  try {
                    const res = await fetch(`/api/employee/swaps/${s.id}`, { method: "DELETE" });
                    if (res.ok) toast.success("Solicitud cancelada");
                    else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al cancelar"); }
                  } catch { toast.error("Error de conexión"); }
                  fetchData();
                }}><X className="w-3 h-3" /> Cancelar</Button>
              } />)}
            </>
          )}
          {pendingForMe.length === 0 && myPendingSent.length === 0 && (
            <Card><CardContent className="py-12 text-center"><ArrowLeftRight className="w-12 h-12 text-gray-200 mx-auto mb-3" /><p className="text-gray-400">No hay intercambios pendientes</p></CardContent></Card>
          )}
        </div>
      )}

      {/* ═══ DEBTS ═══ */}
      {tab === "debts" && (
        <div className="space-y-3">
          {debts.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><Scale className="w-12 h-12 text-gray-200 mx-auto mb-3" /><p className="text-gray-400">No hay deudas de turnos</p><p className="text-xs text-gray-300 mt-1">Cuando alguien te cubra un turno sin devolvértelo, aparecerá aquí</p></CardContent></Card>
          ) : (
            <>
              <p className="text-xs text-gray-500">Cuando alguien te cubre un turno (estando de libra), se genera una deuda. Cuando tú le cubres a esa persona, la deuda se salda.</p>
              {debts.map((d) => (
                <Card key={d.person.id} className={cn("overflow-hidden", d.net > 0 ? "border-emerald-200" : d.net < 0 ? "border-amber-200" : "border-gray-200")}>
                  <CardContent className="!py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: d.person.color }}>
                        {d.person.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{d.person.name}</p>
                        {d.net > 0 ? (
                          <p className="text-xs text-emerald-600 font-medium">Te debe {d.net} turno{d.net > 1 ? "s" : ""}</p>
                        ) : d.net < 0 ? (
                          <p className="text-xs text-amber-600 font-medium">Le debes {Math.abs(d.net)} turno{Math.abs(d.net) > 1 ? "s" : ""}</p>
                        ) : (
                          <p className="text-xs text-gray-400">Estáis en paz</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={cn("text-lg font-bold", d.net > 0 ? "text-emerald-600" : d.net < 0 ? "text-amber-600" : "text-gray-400")}>
                          {d.net > 0 ? `+${d.net}` : d.net}
                        </div>
                      </div>
                    </div>
                    {d.details.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                        {d.details.map((det, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                            <span className={cn("w-1.5 h-1.5 rounded-full", det.direction === "theyOwe" ? "bg-emerald-400" : "bg-amber-400")} />
                            <span>{fmtShort(det.date)}</span>
                            <span className="text-gray-300">·</span>
                            <span>{det.direction === "theyOwe" ? "Le cubriste" : "Te cubrió"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* ═══ HISTORY ═══ */}
      {tab === "history" && (
        <div className="space-y-2">
          {resolved.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" /><p className="text-gray-400">Sin historial</p></CardContent></Card>
          ) : resolved.map((s) => <SwapCard key={s.id} swap={s} />)}
        </div>
      )}
    </div>
  );
}

// ─── Swap Card ──────────────────────────────────────────
function SwapCard({ swap, actions }: { swap: Swap; actions?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="!py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swap.fromPerson.color }} />
              <span className="text-sm font-semibold text-gray-900 truncate">{swap.fromPerson.name}</span>
              <span className="text-xs text-gray-400 truncate">{swap.fromShiftLabel} · {fmtShort(swap.fromDate)}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <ArrowLeftRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swap.toPerson.color }} />
              <span className="text-sm font-semibold text-gray-900 truncate">{swap.toPerson.name}</span>
              <span className="text-xs text-gray-400 truncate">{swap.toShiftLabel} · {fmtShort(swap.toDate)}</span>
            </div>
          </div>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0", statusColor(swap.status))}>{statusLabel(swap.status)}</span>
        </div>
        {(actions || swap.reason) && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            {swap.reason && <span className="text-xs text-gray-400 italic truncate">"{swap.reason}"</span>}
            {actions && <div className="ml-auto flex-shrink-0">{actions}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
