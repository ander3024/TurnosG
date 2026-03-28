"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Search, Clock, Pencil, Trash2, X, Check } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface ExtraHoursData {
  id: number;
  personId: number;
  person: { id: number; code: string; name: string };
  actorId: number;
  actor: { id: number; name: string };
  date: string;
  hours: number;
  comment: string | null;
  createdAt: Date;
}

interface PersonOption {
  id: number;
  code: string;
  name: string;
}

interface Props {
  initialEntries: ExtraHoursData[];
  people: PersonOption[];
}

const emptyForm = {
  personId: "",
  date: "",
  hours: "",
  comment: "",
};

export function ExtraHoursManagement({ initialEntries, people }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const filtered = entries.filter(
    (e) =>
      e.person.name.toLowerCase().includes(search.toLowerCase()) ||
      e.person.code.toLowerCase().includes(search.toLowerCase())
  );

  const totalHours = filtered.reduce((sum, e) => sum + e.hours, 0);

  function startEdit(entry: ExtraHoursData) {
    setEditingId(entry.id);
    setShowCreate(false);
    setForm({
      personId: String(entry.personId),
      date: entry.date,
      hours: String(entry.hours),
      comment: entry.comment || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/extra-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: Number(form.personId),
          date: form.date,
          hours: parseFloat(form.hours),
          comment: form.comment || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries([data, ...entries]);
        setShowCreate(false);
        setForm(emptyForm);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/extra-hours/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: Number(form.personId),
          date: form.date,
          hours: parseFloat(form.hours),
          comment: form.comment || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(entries.map((e) => (e.id === id ? { ...e, ...data } : e)));
        setEditingId(null);
        setForm(emptyForm);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este registro de horas extra?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/extra-hours/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setEntries(entries.filter((e) => e.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 !py-5">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{totalHours.toFixed(1)}</p>
              <p className="text-sm text-gray-500">Horas totales</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 !py-5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
              <p className="text-sm text-gray-500">Registros</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 !py-5">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {filtered.length > 0 ? (totalHours / filtered.length).toFixed(1) : "0"}
              </p>
              <p className="text-sm text-gray-500">Media por registro</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por persona..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}>
          <Plus className="w-4 h-4" />
          Nuevo
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-indigo-200">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Registrar horas extra</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Persona</label>
                <select
                  value={form.personId}
                  onChange={(e) => setForm({ ...form, personId: e.target.value })}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Fecha"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
              <Input
                label="Horas"
                type="number"
                step="0.5"
                min="0.5"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
                placeholder="Ej: 2.5"
                required
              />
              <Input
                label="Comentario"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="Motivo (opcional)"
              />
              <div className="flex items-end gap-2 lg:col-span-4">
                <Button type="submit" loading={saving}>
                  Guardar registro
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Card List */}
      <div className="space-y-2">
        {filtered.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="!py-4">
              {editingId === entry.id ? (
                /* Inline Edit Form */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Persona</label>
                      <select
                        value={form.personId}
                        onChange={(e) => setForm({ ...form, personId: e.target.value })}
                        className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      >
                        <option value="">Seleccionar...</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} - {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      label="Fecha"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      required
                    />
                    <Input
                      label="Horas"
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={form.hours}
                      onChange={(e) => setForm({ ...form, hours: e.target.value })}
                      required
                    />
                    <Input
                      label="Comentario"
                      value={form.comment}
                      onChange={(e) => setForm({ ...form, comment: e.target.value })}
                      placeholder="Motivo (opcional)"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" loading={saving} onClick={() => handleUpdate(entry.id)}>
                      <Check className="w-3.5 h-3.5" />
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="w-3.5 h-3.5" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                /* Display Mode */
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{entry.person.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{entry.person.code}</p>
                      </div>
                    </div>
                    <div className="hidden sm:block text-sm text-gray-600">
                      {formatDate(entry.date)}
                    </div>
                    <span className="text-sm font-semibold text-indigo-600 shrink-0">
                      {entry.hours}h
                    </span>
                    <span className="hidden md:block text-sm text-gray-500 truncate max-w-xs">
                      {entry.comment || "-"}
                    </span>
                    <span className="hidden lg:block text-xs text-gray-400 shrink-0">
                      por {entry.actor.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(entry)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deleting === entry.id}
                      onClick={() => handleDelete(entry.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="!py-12 text-center text-sm text-gray-400">
              No hay registros de horas extra
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
