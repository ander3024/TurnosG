"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Save, Clock, ShieldCheck, Palmtree, Users, Calendar, MapPin,
  ToggleLeft, ToggleRight, AlertTriangle, Coffee, Moon, Sun, Info,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface SettingData {
  id: number;
  key: string;
  value: string;
  label: string | null;
}

interface Props {
  initialSettings: SettingData[];
}

export function SettingsManagement({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string } | null>(null);
  const toast = useToast();

  function getValue(key: string): string {
    return settings.find((s) => s.key === key)?.value ?? "";
  }

  function getBool(key: string): boolean {
    return getValue(key) === "true";
  }

  function getNumber(key: string): number {
    return parseInt(getValue(key)) || 0;
  }

  function getJSON(key: string): Record<string, unknown> {
    try { return JSON.parse(getValue(key)); } catch { return {}; }
  }

  async function saveSetting(key: string, value: string) {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(settings.map((s) => (s.key === key ? data : s)));
        setSaved(key);
        setTimeout(() => setSaved(null), 2000);
        toast.success("Guardado");
      } else toast.error("Error al guardar configuración");
    } catch { toast.error("Error de conexión"); } finally {
      setSaving(null);
    }
  }

  async function saveJSON(key: string, obj: Record<string, unknown>) {
    await saveSetting(key, JSON.stringify(obj));
  }

  // ─── Toggle Component ──────────
  function Toggle({ settingKey, label, description }: { settingKey: string; label: string; description: string }) {
    const on = getBool(settingKey);
    return (
      <div className="flex items-center justify-between py-3">
        <div className="flex-1 pr-4">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving === settingKey && <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
          {saved === settingKey && <span className="text-xs text-emerald-600 font-medium">Guardado</span>}
          <button
            onClick={() => saveSetting(settingKey, on ? "false" : "true")}
            disabled={saving === settingKey}
            className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors", on ? "bg-indigo-600" : "bg-gray-300")}
          >
            <span className={cn("inline-block h-5 w-5 rounded-full bg-white transition-transform shadow-sm", on ? "translate-x-6" : "translate-x-1")} />
          </button>
        </div>
      </div>
    );
  }

  // ─── Number Input ──────────
  function NumberField({ settingKey, label, description, suffix, min, max, step }: {
    settingKey: string; label: string; description: string; suffix?: string; min?: number; max?: number; step?: number;
  }) {
    const [val, setVal] = useState(getValue(settingKey));
    const changed = val !== getValue(settingKey);
    return (
      <div className="py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-gray-900">{label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {saving === settingKey && <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
            {saved === settingKey && <span className="text-xs text-emerald-600 font-medium">Guardado</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            min={min}
            max={max}
            step={step}
            className="w-32 rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
          {changed && (
            <Button size="sm" onClick={() => saveSetting(settingKey, val)} loading={saving === settingKey}>
              <Save className="w-3 h-3" /> Guardar
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── Text/Select Input ──────────
  function TextField({ settingKey, label, description, type, placeholder }: {
    settingKey: string; label: string; description: string; type?: "date" | "text" | "password"; placeholder?: string;
  }) {
    const [val, setVal] = useState(getValue(settingKey));
    const changed = val !== getValue(settingKey);
    return (
      <div className="py-3">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">{description}</p>
        <div className="flex items-center gap-2">
          <input
            type={type || "text"}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={placeholder}
            className="w-48 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          {changed && (
            <Button size="sm" onClick={() => saveSetting(settingKey, val)} loading={saving === settingKey}>
              <Save className="w-3 h-3" /> Guardar
            </Button>
          )}
          {saved === settingKey && <span className="text-xs text-emerald-600 font-medium">Guardado</span>}
        </div>
      </div>
    );
  }

  // ─── Rules (from JSON) ──────────
  const rules = getJSON("rules") as {
    enforce?: boolean; maxConsecutiveWeekends?: number; maxDailyHours?: number;
    maxWeeklyHours?: number; minRestHours?: number; maxDaysPerWeek?: number;
  };

  function RuleNumber({ field, label, description, suffix, min, max }: {
    field: string; label: string; description: string; suffix?: string; min?: number; max?: number;
  }) {
    const currentVal = (rules as Record<string, unknown>)[field];
    const [val, setVal] = useState(String(currentVal ?? ""));
    const changed = val !== String(currentVal ?? "");
    return (
      <div className="py-2">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-1.5">{description}</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            min={min} max={max}
            className="w-24 rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
          {changed && (
            <Button size="sm" onClick={() => saveJSON("rules", { ...rules, [field]: parseFloat(val) })} loading={saving === "rules"}>
              <Save className="w-3 h-3" /> Guardar
            </Button>
          )}
          {saved === "rules" && <span className="text-xs text-emerald-600 font-medium">Guardado</span>}
        </div>
      </div>
    );
  }

  async function sendTestEmail() {
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const res = await fetch("/api/admin/email/test", { method: "POST" });
      const data = await res.json();
      setTestEmailResult({ ok: res.ok, message: data.message || (res.ok ? "Email de prueba enviado" : "Error al enviar") });
    } catch {
      setTestEmailResult({ ok: false, message: "Error de conexión" });
    } finally {
      setTestingEmail(false);
    }
  }

  // ─── Relaxed Months Component ──────────
  function RelaxedMonthsSelector({ settingKey, currentValue, onSave, saving, saved }: {
    settingKey: string; currentValue: string; onSave: (key: string, value: string) => void; saving: string | null; saved: string | null;
  }) {
    const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    let selected: number[] = [];
    try { selected = JSON.parse(currentValue || "[]"); } catch { selected = [6, 7, 8]; }

    const toggle = (month: number) => {
      const next = selected.includes(month) ? selected.filter(m => m !== month) : [...selected, month].sort((a, b) => a - b);
      onSave(settingKey, JSON.stringify(next));
    };

    return (
      <div className="py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-gray-900">Meses con equipo reducido (L-J)</p>
            <p className="text-xs text-gray-500 mt-0.5">En estos meses solo trabajan 2 personas de lunes a jueves (sin refuerzo). El resto del año, el que libra cubre como tercera persona.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {saving === settingKey && <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />}
            {saved === settingKey && <span className="text-xs text-emerald-600 font-medium">Guardado</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {MONTHS.map((label, i) => {
            const month = i + 1;
            const isSelected = selected.includes(month);
            return (
              <button key={month} onClick={() => toggle(month)} disabled={saving === settingKey}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm font-medium transition-all border",
                  isSelected ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                )}>
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Seleccionados: {selected.length > 0 ? selected.map(m => MONTHS[m - 1]).join(", ") : "Ninguno (siempre 3 personas L-J)"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ═══ EMAIL Y NOTIFICACIONES ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Mail className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Email y notificaciones</h2>
              <p className="text-sm text-gray-500">Configuración del servicio de envío de emails</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-gray-100">
          <Toggle settingKey="email_enabled" label="Activar envío de emails" description="Habilita o deshabilita todos los emails del sistema (bienvenida, recuperación de contraseña, notificaciones)" />
          <TextField settingKey="smtp2go_api_key" label="API Key SMTP2GO" description="Clave de API del servicio SMTP2GO para enviar emails" type="password" />
          <TextField settingKey="email_from_address" label="Email remitente" description="Dirección de email desde la que se envían los correos" placeholder="turnos@elganso.com" />
          <TextField settingKey="email_from_name" label="Nombre remitente" description="Nombre que aparece como remitente en los emails" placeholder="El Ganso Turnos" />
          <div className="py-3">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={sendTestEmail}
                loading={testingEmail}
                className="!bg-emerald-600 hover:!bg-emerald-500"
              >
                <Mail className="w-3 h-3" /> Enviar email de prueba
              </Button>
              {testEmailResult && (
                <span className={cn("text-xs font-medium", testEmailResult.ok ? "text-emerald-600" : "text-red-600")}>
                  {testEmailResult.message}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ JORNADA Y HORAS ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Jornada y horas</h2>
              <p className="text-sm text-gray-500">Configura las horas del convenio y los días de vacaciones</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-gray-100">
          <NumberField settingKey="annualTargetHours" label="Horas anuales por convenio" description="Total de horas que debe trabajar cada empleado al año" suffix="horas/año" min={1000} max={2500} />
          <NumberField settingKey="vacationDaysNatural" label="Días de vacaciones" description="Días laborables de vacaciones por empleado al año" suffix="días laborables" min={0} max={40} />
          <NumberField settingKey="travelDefaultHours" label="Horas de viaje" description="Horas que se computan cuando un empleado hace un desplazamiento" suffix="horas" min={1} max={24} />
          <NumberField settingKey="weeks" label="Semanas del calendario" description="Número de semanas que abarca el año laboral" suffix="semanas" min={1} max={53} />
          <TextField settingKey="startDate" label="Inicio del año laboral" description="Primer lunes del año desde donde empieza la rotación" type="date" />
        </CardContent>
      </Card>

      {/* ═══ FESTIVOS Y CIERRE ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Festivos y cierre</h2>
              <p className="text-sm text-gray-500">Cómo se gestionan los días festivos</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-gray-100">
          <Toggle settingKey="closeOnHolidays" label="Cerrar en festivos oficiales" description="La tienda cierra los días festivos oficiales (Año Nuevo, Navidad, etc.). Los festivos laborables siempre se trabajan." />
          <Toggle settingKey="consumeVacationOnHoliday" label="Los festivos consumen vacaciones" description="Si alguien tiene vacaciones en un día festivo, ¿le cuenta como día de vacaciones? Normalmente NO." />
          <TextField settingKey="province" label="Provincia" description="Provincia para calcular los festivos oficiales" />
        </CardContent>
      </Card>

      {/* ═══ LÍMITES Y REGLAS ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Límites y reglas</h2>
              <p className="text-sm text-gray-500">Restricciones legales y de bienestar del trabajador</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-gray-100">
          <div className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Aplicar reglas estrictamente</p>
                <p className="text-xs text-gray-500 mt-0.5">Si está activado, el sistema no permite asignar turnos que incumplan los límites</p>
              </div>
              <button
                onClick={() => saveJSON("rules", { ...rules, enforce: !rules.enforce })}
                className={cn("relative inline-flex h-7 w-12 items-center rounded-full transition-colors", rules.enforce ? "bg-indigo-600" : "bg-gray-300")}
              >
                <span className={cn("inline-block h-5 w-5 rounded-full bg-white transition-transform shadow-sm", rules.enforce ? "translate-x-6" : "translate-x-1")} />
              </button>
            </div>
          </div>

          <RuleNumber field="maxDailyHours" label="Máximo de horas al día" description="Un empleado no puede superar estas horas en un solo día" suffix="horas" min={8} max={16} />
          <RuleNumber field="maxWeeklyHours" label="Máximo de horas a la semana" description="Límite semanal por empleado (convenio colectivo)" suffix="horas" min={20} max={80} />
          <RuleNumber field="minRestHours" label="Descanso mínimo entre turnos" description="Horas de descanso obligatorias entre el final de un turno y el inicio del siguiente" suffix="horas" min={8} max={16} />
          <RuleNumber field="maxConsecutiveWeekends" label="Fines de semana consecutivos" description="Máximo de fines de semana seguidos que puede trabajar una persona" suffix="consecutivos" min={1} max={4} />
          <RuleNumber field="maxDaysPerWeek" label="Máximo de días por semana" description="Días máximos que puede trabajar una persona en una semana" suffix="días" min={5} max={7} />
        </CardContent>
      </Card>

      {/* ═══ ROTACIÓN Y TURNOS ═══ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Rotación y turnos</h2>
              <p className="text-sm text-gray-500">Cómo funciona la asignación automática de turnos</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Toggle settingKey="rebalance" label="Equilibrar horas automáticamente" description="El sistema reparte los refuerzos para que todos los empleados tengan horas similares al final del año" />
          <Toggle settingKey="applyConciliation" label="Aplicar conciliación" description="Penaliza patrones de trabajo malos (días sueltos, muchos cambios de turno, fines de semana consecutivos)" />

          {/* Relaxed months selector */}
          <RelaxedMonthsSelector settingKey="vacationRelaxedMonths" currentValue={getValue("vacationRelaxedMonths")} onSave={saveSetting} saving={saving} saved={saved} />

          <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Cómo funciona la rotación</p>
                <ul className="space-y-1 text-xs text-blue-700">
                  <li><strong>Lunes a Jueves:</strong> 3 personas (1 mañana + 1 tarde + 1 refuerzo). En meses relajados: solo 2 personas (sin refuerzo)</li>
                  <li><strong>Viernes:</strong> 2 personas (1 mañana + 1 tarde)</li>
                  <li><strong>Sábado y Domingo:</strong> 1 persona (turno de finde)</li>
                  <li><strong>Rotación:</strong> cada 4 semanas, una persona descansa la semana entera</li>
                  <li><strong>Semana completa:</strong> quien trabaja el fin de semana, trabaja de L-D y libra la siguiente</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ INFO ═══ */}
      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
        <p className="text-xs text-gray-500">
          Los cambios se aplican inmediatamente al calendario. Si cambias las horas del convenio o los días de vacaciones, el motor recalculará todos los turnos automáticamente.
          Los tipos de turno y los festivos se gestionan en sus secciones correspondientes del menú.
        </p>
      </div>
    </div>
  );
}
