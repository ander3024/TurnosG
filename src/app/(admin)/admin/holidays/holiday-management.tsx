"use client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, CalendarDays, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface HolidayData {
  id: number;
  date: string;
  label: string | null;
  year: number;
  province: string;
  type: string;
}

interface Props {
  initialHolidays: HolidayData[];
}

const typeLabels: Record<string, string> = {
  official: "Oficial",
  custom: "Personalizado",
  working: "Laborable especial",
};

const typeVariants: Record<string, "info" | "warning" | "success"> = {
  official: "info",
  custom: "warning",
  working: "success",
};

const emptyForm = {
  date: "",
  label: "",
  type: "official",
  province: "Madrid",
};

export function HolidayManagement({ initialHolidays }: Props) {
  const [holidays, setHolidays] = useState(initialHolidays);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return holidays;
    const q = search.toLowerCase();
    return holidays.filter(
      (h) =>
        (h.label && h.label.toLowerCase().includes(q)) ||
        h.date.includes(q) ||
        h.province.toLowerCase().includes(q)
    );
  }, [holidays, search]);

  const groupedByYear = useMemo(() => {
    const groups: Record<number, HolidayData[]> = {};
    filtered.forEach((h) => {
      if (!groups[h.year]) groups[h.year] = [];
      groups[h.year].push(h);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, items]) => ({ year: Number(year), items }));
  }, [filtered]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const year = new Date(form.date + "T00:00:00").getFullYear();
      const res = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          label: form.label || null,
          year,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setHolidays([data, ...holidays]);
        setShowCreate(false);
        setForm(emptyForm);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent, id: number) {
    e.preventDefault();
    setSaving(true);
    try {
      const year = new Date(editForm.date + "T00:00:00").getFullYear();
      const res = await fetch(`/api/admin/holidays/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          label: editForm.label || null,
          year,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setHolidays(holidays.map((h) => (h.id === id ? data : h)));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Seguro que quieres eliminar este festivo?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/holidays/${id}`, { method: "DELETE" });
      if (res.ok) {
        setHolidays(holidays.filter((h) => h.id !== id));
      }
    } finally {
      setDeleting(null);
    }
  }

  function startEditing(holiday: HolidayData) {
    setEditingId(holiday.id);
    setEditForm({
      date: holiday.date,
      label: holiday.label || "",
      type: holiday.type,
      province: holiday.province,
    });
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
            placeholder="Buscar festivos..."
            className="w-full rounded-xl border border-gray-300 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}>
          <Plus className="w-4 h-4" />
          Nuevo festivo
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="border-indigo-300">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Anadir festivo</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input
                label="Fecha"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
              <Input
                label="Etiqueta"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Ej: Dia de la Constitucion"
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="official">Oficial</option>
                  <option value="custom">Personalizado</option>
                  <option value="working">Laborable especial</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Provincia</label>
                <select
                  value={form.province}
                  onChange={(e) => setForm({ ...form, province: e.target.value })}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Madrid">Madrid</option>
                  <option value="Nacional">Nacional</option>
                </select>
              </div>
              <div className="flex items-end gap-2 lg:col-span-4">
                <Button type="submit" loading={saving}>
                  Guardar festivo
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Grouped by Year */}
      {groupedByYear.map(({ year, items }) => (
        <Card key={year}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CalendarDays className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">{year}</h2>
              <Badge>{items.length} festivos</Badge>
            </div>
          </CardHeader>
          <CardContent className="!py-0 divide-y divide-gray-100">
            {items.map((holiday) => (
              <div key={holiday.id} className="py-3">
                {editingId === holiday.id ? (
                  <form
                    onSubmit={(e) => handleEdit(e, holiday.id)}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                  >
                    <Input
                      label="Fecha"
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      required
                    />
                    <Input
                      label="Etiqueta"
                      value={editForm.label}
                      onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                      placeholder="Ej: Dia de la Constitucion"
                    />
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Tipo</label>
                      <select
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                        className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="official">Oficial</option>
                        <option value="custom">Personalizado</option>
                        <option value="working">Laborable especial</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Provincia</label>
                      <select
                        value={editForm.province}
                        onChange={(e) => setEditForm({ ...editForm, province: e.target.value })}
                        className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Madrid">Madrid</option>
                        <option value="Nacional">Nacional</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2 lg:col-span-4">
                      <Button type="submit" loading={saving} size="sm">
                        Guardar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 w-28 flex-shrink-0">
                        {formatDate(holiday.date)}
                      </span>
                      <span className="text-sm text-gray-600 flex-1 min-w-0 truncate">
                        {holiday.label || <span className="text-gray-400">-</span>}
                      </span>
                      <Badge variant={typeVariants[holiday.type] || "default"}>
                        {typeLabels[holiday.type] || holiday.type}
                      </Badge>
                      <span className="text-sm text-gray-500">{holiday.province}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(holiday)}
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={deleting === holiday.id}
                        onClick={() => handleDelete(holiday.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {groupedByYear.length === 0 && (
        <Card>
          <CardContent className="!py-4">
            <div className="py-8 text-center">
              <CalendarDays className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No hay festivos configurados</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
