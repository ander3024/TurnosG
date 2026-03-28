"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, statusColor, statusLabel } from "@/lib/utils";
import {
  ArrowLeftRight, Check, X, Calendar, Send, ChevronLeft, ChevronRight,
  Sunrise, Moon, Sun, Palmtree, Trash2,
} from "lucide-react";

interface TeamAssignment { personCode: string | null; personName: string | null; personColor: string | null; shiftLabel: string; startTime: string; endTime: string; }
interface DayData { date: string; isWeekend: boolean; isClosed: boolean; shifts: { code: string; label: string; startTime: string; endTime: string; hours: number }[]; timeOff: { type: string; status: string } | null; holiday: { label: string } | null; teamAssignments: TeamAssignment[]; }
interface Person { id: number; code: string; name: string; color: string }
interface Swap { id: number; fromUser: { id: number; name: string }; toUser: { id: number; name: string }; fromPerson: Person; toPerson: Person; fromDate: string; toDate: string; fromShiftLabel: string; toShiftLabel: string; status: string; reason: string | null; createdAt: string; }
interface SwapPair { myDate: string; myShift: string; theirDate: string; theirShift: string; person: Person; }

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DAYS = ["L","M","X","J","V","S","D"];

function ic(label: string) {
  const l = label.toLowerCase();
  if (l.includes("finde") || l.includes("fin")) return { Icon: Sun, color: "text-amber-600", bg: "bg-amber-50", s: "F" };
  if (l.includes("tarde")) return { Icon: Moon, color: "text-indigo-600", bg: "bg-indigo-50", s: "T" };
  return { Icon: Sunrise, color: "text-orange-500", bg: "bg-orange-50", s: "M" };
}
function fmtD(d: string) { return new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", weekday: "short" }); }

export default function IntercambiosPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [days, setDays] = useState<DayData[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  // Swap builder: list of pairs + pending selection
  const [pairs, setPairs] = useState<SwapPair[]>([]);
  const [pending, setPending] = useState<{ date: string; shift: string } | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState<"new" | "pending" | "history">("new");

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, s, m] = await Promise.all([
        fetch(`/api/employee/calendar?start=${from}&end=${to}`),
        fetch("/api/employee/people"),
        fetch("/api/employee/swaps"),
        fetch("/api/auth/me"),
      ]);
      if (c.ok) { const j = await c.json(); setDays(j.days || []); }
      if (p.ok) { const j = await p.json(); setPeople(Array.isArray(j) ? j : []); }
      if (s.ok) { const j = await s.json(); setSwaps(j.swaps || j.items || (Array.isArray(j) ? j : [])); }
      if (m.ok) { const j = await m.json(); setMyUserId(j.user?.id || j.id || null); }
    } catch {} finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { fetchData(); }, [fetchData]);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }

  const dayMap = new Map(days.map((d) => [d.date, d]));
  const firstDow = (() => { const d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  // Step 1: click my shift
  function clickMy(date: string, label: string) {
    if (pending?.date === date && pending?.shift === label) setPending(null);
    else setPending({ date, shift: label });
  }

  // Step 2: click their shift → creates a pair
  function clickTheir(date: string, label: string, personCode: string) {
    if (!pending) return;
    const p = people.find((pp) => pp.code === personCode);
    if (!p) return;
    setPairs([...pairs, { myDate: pending.date, myShift: pending.shift, theirDate: date, theirShift: label, person: p }]);
    setPending(null);
  }

  async function submit() {
    if (pairs.length === 0) return;
    setSending(true);
    try {
      for (let i = 0; i < pairs.length; i++) {
        const pr = pairs[i];
        await fetch("/api/employee/swaps", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toPersonId: pr.person.id, fromDate: pr.myDate, toDate: pr.theirDate, fromShiftLabel: pr.myShift, toShiftLabel: pr.theirShift, reason: i === 0 ? reason : undefined }),
        });
      }
      setSent(true);
      setTimeout(() => { setSent(false); setPairs([]); setReason(""); fetchData(); }, 2000);
    } finally { setSending(false); }
  }

  // Swap lists
  const pendingForMe = swaps.filter((s) => s.status === "pendiente" && s.toUser?.id === myUserId);
  const myPendingSent = swaps.filter((s) => s.status === "pendiente" && s.fromUser?.id === myUserId);
  const resolved = swaps.filter((s) => s.status !== "pendiente");

  async function respond(id: number, status: "aceptado" | "rechazado") {
    await fetch(`/api/employee/swaps/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    fetchData();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Intercambios de turno</h1>
        <p className="text-gray-500 text-sm">Propón intercambiar turnos con tus compañeros</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([["new","Nuevo"],["pending",`Pendientes${pendingForMe.length>0?` (${pendingForMe.length})`:""}`],["history","Historial"]] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors", tab===k?"bg-white text-gray-900 shadow-sm":"text-gray-500")}>{l}</button>
        ))}
      </div>

      {/* ═══ NEW SWAP ═══ */}
      {tab === "new" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Calendar */}
          <Card>
            <CardHeader className="!pb-2">
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-bold text-gray-900">{MONTHS[month]} {year}</span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
              </div>
              {/* Instructions inline */}
              {pending ? (
                <div className="mt-2 p-2 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-700">
                  <strong>Paso 2:</strong> Ahora pulsa en el turno del compañero con quien quieres intercambiar tu <strong>{pending.shift}</strong> del <strong>{fmtD(pending.date)}</strong>
                </div>
              ) : pairs.length === 0 ? (
                <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-700">
                  <strong>Paso 1:</strong> Pulsa en uno de tus turnos (marcados como <strong>"Tú"</strong>) para empezar
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="!p-1 sm:!p-2">
              <div className="grid grid-cols-7">
                {DAYS.map((d, i) => <div key={d} className={cn("text-center text-[10px] font-bold py-1", i>=5?"text-amber-600":"text-gray-400")}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {cells.map((ds, idx) => {
                  if (!ds) return <div key={idx} className="min-h-[65px] bg-gray-50/30 rounded" />;
                  const day = dayMap.get(ds);
                  const dn = parseInt(ds.split("-")[2]);
                  const myShifts = day?.shifts || [];
                  const isPending = pending?.date === ds;

                  return (
                    <div key={idx} className={cn("min-h-[65px] p-0.5 sm:p-1 rounded text-[9px]", idx%7>=5&&"bg-gray-50/50", day?.isClosed&&"bg-rose-50/30", isPending&&"ring-2 ring-purple-400 bg-purple-50/30")}>
                      <span className="text-[10px] font-bold text-gray-700 block mb-0.5">{dn}</span>

                      {/* My shifts */}
                      {myShifts.map((s, i) => {
                        const c = ic(s.label);
                        const alreadyPaired = pairs.some((pr) => pr.myDate === ds && pr.myShift === s.label);
                        return (
                          <div key={i} onClick={(e) => { e.stopPropagation(); if (!alreadyPaired) clickMy(ds, s.label); }}
                            className={cn("flex items-center gap-0.5 rounded px-0.5 py-px mb-px",
                              pending?.date===ds && pending?.shift===s.label ? "bg-indigo-300 ring-1 ring-indigo-500" :
                              alreadyPaired ? "bg-indigo-100 opacity-50" : c.bg,
                              !alreadyPaired && "cursor-pointer hover:ring-1 hover:ring-indigo-400"
                            )}>
                            <c.Icon className={cn("w-2 h-2", c.color)} />
                            <span className="font-bold text-gray-900 truncate">Tú {c.s}</span>
                          </div>
                        );
                      })}

                      {/* Team */}
                      {day?.teamAssignments?.filter((ta) => !myShifts.some((ms) => ms.label === ta.shiftLabel)).map((ta, i) => {
                        const c = ic(ta.shiftLabel);
                        const canClick = !!pending && !!ta.personCode;
                        return (
                          <div key={`t${i}`}
                            onClick={(e) => { e.stopPropagation(); if (canClick && ta.personCode) clickTheir(ds, ta.shiftLabel, ta.personCode); }}
                            className={cn("flex items-center gap-0.5 rounded px-0.5 py-px mb-px bg-gray-50",
                              canClick && "cursor-pointer hover:bg-purple-100 hover:ring-1 hover:ring-purple-400"
                            )}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ta.personColor || "#9ca3af" }} />
                            <span className="truncate text-gray-600">{ta.personName}</span>
                            <span className={cn("font-bold ml-auto", c.color)}>{c.s}</span>
                          </div>
                        );
                      })}
                      {day?.timeOff && <div className="text-emerald-600 font-bold">VAC</div>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Right panel: pairs */}
          <div className="space-y-3">
            {sent ? (
              <Card className="border-emerald-200 bg-emerald-50">
                <CardContent className="py-8 text-center">
                  <Check className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <p className="font-semibold text-emerald-800">Intercambios propuestos</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className={pairs.length > 0 ? "border-indigo-200" : ""}>
                  <CardHeader className="!py-3">
                    <span className="text-sm font-semibold text-gray-900">Intercambios seleccionados ({pairs.length})</span>
                  </CardHeader>
                  <CardContent className="!pt-0">
                    {pairs.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Selecciona tu turno y luego el de un compañero en el calendario. Puedes añadir varios intercambios con personas diferentes.</p>
                    ) : (
                      <div className="space-y-2">
                        {pairs.map((pr, i) => {
                          const myIc = ic(pr.myShift);
                          const thIc = ic(pr.theirShift);
                          return (
                            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 text-xs">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  <myIc.Icon className={cn("w-3 h-3", myIc.color)} />
                                  <span className="font-semibold">Tu {pr.myShift}</span>
                                  <span className="text-gray-400">{fmtD(pr.myDate)}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <ArrowLeftRight className="w-3 h-3 text-gray-400" />
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pr.person.color }} />
                                  <span className="font-semibold">{pr.person.name} {pr.theirShift}</span>
                                  <span className="text-gray-400">{fmtD(pr.theirDate)}</span>
                                </div>
                              </div>
                              <button onClick={() => setPairs(pairs.filter((_, j) => j !== i))} className="p-1 hover:bg-red-50 rounded">
                                <X className="w-3 h-3 text-gray-400" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {pairs.length > 0 && (
                  <Card className="border-emerald-200">
                    <CardContent className="!py-4 space-y-3">
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)..." rows={2}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" />
                      <div className="flex gap-2">
                        <Button onClick={submit} loading={sending} className="flex-1">
                          <Send className="w-4 h-4" /> Proponer {pairs.length} intercambio{pairs.length > 1 ? "s" : ""}
                        </Button>
                        <Button variant="ghost" onClick={() => { setPairs([]); setPending(null); setReason(""); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
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
              {myPendingSent.map((s) => <SwapCard key={s.id} swap={s} />)}
            </>
          )}
          {pendingForMe.length === 0 && myPendingSent.length === 0 && (
            <Card><CardContent className="py-12 text-center"><ArrowLeftRight className="w-12 h-12 text-gray-200 mx-auto mb-3" /><p className="text-gray-400">No hay intercambios pendientes</p></CardContent></Card>
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

function SwapCard({ swap, actions }: { swap: Swap; actions?: React.ReactNode }) {
  return (
    <Card><CardContent className="!py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swap.fromPerson.color }} />
          <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{swap.fromPerson.name}</p><p className="text-xs text-gray-500">{fmtD(swap.fromDate)} · {swap.fromShiftLabel}</p></div>
        </div>
        <ArrowLeftRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: swap.toPerson.color }} />
          <div className="min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{swap.toPerson.name}</p><p className="text-xs text-gray-500">{fmtD(swap.toDate)} · {swap.toShiftLabel}</p></div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusColor(swap.status))}>{statusLabel(swap.status)}</span>
          {actions}
        </div>
      </div>
      {swap.reason && <p className="text-xs text-gray-400 italic mt-1">"{swap.reason}"</p>}
    </CardContent></Card>
  );
}
