"use client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, CalendarDays, Info, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

interface EventData {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  weekdaysExtraSlots: number;
  weekendExtraSlots: number;
  assigneePersonId: number | null;
  assigneeForced: boolean;
  weekdayRefuerzo: string | null;
  color: string | null;
  notes: string | null;
  createdAt: Date;
}

interface PersonOption {
  id: number;
  code: string;
  name: string;
}

interface Props {
  initialEvents: EventData[];
  people: PersonOption[];
}

const emptyForm = {
  label: "",
  startDate: "",
  endDate: "",
  weekdaysExtraSlots: 0,
  weekendExtraSlots: 0,
  assigneePersonId: "",
  assigneeForced: false,
  weekdayRefuerzo: "",
  color: "#8b5cf6",
  notes: "",
};

function eventToForm(event: EventData) {
  return {
    label: event.label,
    startDate: event.startDate,
    endDate: event.endDate,
    weekdaysExtraSlots: event.weekdaysExtraSlots,
    weekendExtraSlots: event.weekendExtraSlots,
    assigneePersonId: event.assigneePersonId ? String(event.assigneePersonId) : "",
    assigneeForced: event.assigneeForced,
    weekdayRefuerzo: event.weekdayRefuerzo || "",
    color: event.color || "#8b5cf6",
    notes: event.notes || "",
  };
}

function EventForm({
  form,
  setForm,
  people,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  people: PersonOption[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Input
            label="Nombre del evento"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Ej: Navidad 2026, Rebajas enero..."
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
            />
            <span className="text-sm text-gray-500">{form.color}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Fecha inicio"
          type="date"
          value={form.startDate}
          onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          required
        />
        <Input
          label="Fecha fin"
          type="date"
          value={form.endDate}
          onChange={(e) => setForm({ ...form, endDate: e.target.value })}
          required
        />
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-indigo-500" />
          <p className="text-sm text-gray-600">
            Los slots extra indican cuantas personas adicionales se necesitan por turno durante este evento.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Slots extra entre semana"
            type="number"
            value={form.weekdaysExtraSlots.toString()}
            onChange={(e) => setForm({ ...form, weekdaysExtraSlots: Number(e.target.value) })}
            min="0"
          />
          <Input
            label="Slots extra fin de semana"
            type="number"
            value={form.weekendExtraSlots.toString()}
            onChange={(e) => setForm({ ...form, weekendExtraSlots: Number(e.target.value) })}
            min="0"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-indigo-500" />
          <p className="text-sm text-gray-600">
            Opcionalmente asigna una persona fija al evento y define el tipo de refuerzo entre semana.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Persona asignada</label>
            <select
              value={form.assigneePersonId}
              onChange={(e) => setForm({ ...form, assigneePersonId: e.target.value })}
              className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Sin asignar</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Asignacion forzada</label>
            <select
              value={form.assigneeForced ? "true" : "false"}
              onChange={(e) => setForm({ ...form, assigneeForced: e.target.value === "true" })}
              className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="false">No</option>
              <option value="true">Si, forzar asignacion</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              Tipo refuerzo entre semana
            </label>
            <select
              value={form.weekdayRefuerzo}
              onChange={(e) => setForm({ ...form, weekdayRefuerzo: e.target.value })}
              className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Ninguno</option>
              <option value="manana">Manana</option>
              <option value="tarde">Tarde</option>
              <option value="completo">Completo</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Notas</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          placeholder="Notas adicionales sobre el evento..."
          className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function EventManagement({ initialEvents, people }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const toast = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q))
    );
  }, [events, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          weekdaysExtraSlots: Number(form.weekdaysExtraSlots),
          weekendExtraSlots: Number(form.weekendExtraSlots),
          assigneePersonId: form.assigneePersonId ? Number(form.assigneePersonId) : null,
          weekdayRefuerzo: form.weekdayRefuerzo || null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvents([data, ...events]);
        setShowCreate(false);
        setForm(emptyForm);
        toast.success("Evento creado");
      } else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al crear evento"); }
    } catch { toast.error("Error de conexión"); } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent, id: number) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          weekdaysExtraSlots: Number(editForm.weekdaysExtraSlots),
          weekendExtraSlots: Number(editForm.weekendExtraSlots),
          assigneePersonId: editForm.assigneePersonId ? Number(editForm.assigneePersonId) : null,
          weekdayRefuerzo: editForm.weekdayRefuerzo || null,
          notes: editForm.notes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(events.map((ev) => (ev.id === id ? data : ev)));
        setEditingId(null);
        toast.success("Evento actualizado");
      } else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al actualizar"); }
    } catch { toast.error("Error de conexión"); } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Seguro que quieres eliminar este evento?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
      if (res.ok) {
        setEvents(events.filter((e) => e.id !== id));
        toast.success("Evento eliminado");
      } else toast.error("Error al eliminar evento");
    } catch { toast.error("Error de conexión"); } finally {
      setDeleting(null);
    }
  }

  function startEditing(event: EventData) {
    setEditingId(event.id);
    setEditForm(eventToForm(event));
  }

  function getPersonName(id: number | null) {
    if (!id) return null;
    const p = people.find((p) => p.id === id);
    return p ? `${p.code} - ${p.name}` : null;
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar eventos..."
            className="w-full rounded-xl border border-gray-300 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}>
          <Plus className="w-4 h-4" />
          Nuevo evento
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-indigo-300">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Crear evento especial</h3>
          </CardHeader>
          <CardContent>
            <EventForm
              form={form}
              setForm={setForm}
              people={people}
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              saving={saving}
              submitLabel="Crear evento"
            />
          </CardContent>
        </Card>
      )}

      {/* Events list */}
      {filtered.length === 0 && (
        <Card>
          <CardContent className="!py-4">
            <div className="py-8 text-center">
              <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No hay eventos especiales configurados</p>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.map((event) => (
        <Card key={event.id}>
          <CardContent className="!py-4">
            {editingId === event.id ? (
              <EventForm
                form={editForm}
                setForm={setEditForm}
                people={people}
                onSubmit={(e) => handleEdit(e, event.id)}
                onCancel={() => setEditingId(null)}
                saving={saving}
                submitLabel="Guardar cambios"
              />
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {event.color && (
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: event.color }}
                      />
                    )}
                    <span className="font-medium text-gray-900">{event.label}</span>
                    {event.weekdayRefuerzo && (
                      <Badge variant="info">{event.weekdayRefuerzo}</Badge>
                    )}
                    {event.assigneeForced && (
                      <Badge variant="warning">Forzado</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {formatDate(event.startDate)} - {formatDate(event.endDate)}
                    </span>
                    <span>L-V: <span className="font-medium text-gray-700">{event.weekdaysExtraSlots}</span> extra</span>
                    <span>S-D: <span className="font-medium text-gray-700">{event.weekendExtraSlots}</span> extra</span>
                    {getPersonName(event.assigneePersonId) && (
                      <span>Asignado: <span className="font-medium text-gray-700">{getPersonName(event.assigneePersonId)}</span></span>
                    )}
                  </div>
                  {event.notes && (
                    <p className="text-xs text-gray-400 truncate max-w-lg">{event.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEditing(event)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={deleting === event.id}
                    onClick={() => handleDelete(event.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
