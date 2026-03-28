"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Search, Pencil, X, Check } from "lucide-react";

interface PersonData {
  id: number;
  code: string;
  name: string;
  color: string;
  offset: number;
  active: boolean;
  user: { id: number; name: string; email: string } | null;
}

interface Props {
  initialPeople: PersonData[];
  availableUsers: { id: number; name: string; email: string }[];
}

const emptyForm = {
  code: "",
  name: "",
  color: "#3b82f6",
  offset: 0,
  active: true,
  userId: "",
};

export function PeopleManagement({ initialPeople, availableUsers }: Props) {
  const [people, setPeople] = useState(initialPeople);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const filtered = people.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase())
  );

  function startEdit(person: PersonData) {
    setEditingId(person.id);
    setForm({
      code: person.code,
      name: person.name,
      color: person.color,
      offset: person.offset,
      active: person.active,
      userId: person.user?.id?.toString() || "",
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
      const res = await fetch("/api/admin/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          offset: Number(form.offset),
          userId: form.userId ? Number(form.userId) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPeople([...people, data]);
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
      const res = await fetch(`/api/admin/people/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          offset: Number(form.offset),
          userId: form.userId ? Number(form.userId) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPeople(people.map((p) => (p.id === id ? data : p)));
        setEditingId(null);
        setForm(emptyForm);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar empleados..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}>
          <UserPlus className="w-4 h-4" />
          Nuevo empleado
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Crear nuevo empleado</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input
                label="Codigo"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="P1, P2..."
                required
              />
              <Input
                label="Nombre"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
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
              <Input
                label="Offset"
                type="number"
                value={form.offset.toString()}
                onChange={(e) => setForm({ ...form, offset: Number(e.target.value) })}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Vincular a usuario
                </label>
                <select
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sin vincular</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" loading={saving} className="flex-1">
                  Crear empleado
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* People Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Codigo
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Nombre
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Color
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Offset
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Estado
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Usuario vinculado
                </th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((person) =>
                editingId === person.id ? (
                  <tr key={person.id} className="bg-indigo-50/30">
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="color"
                        value={form.color}
                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                        className="w-8 h-8 rounded-lg border border-gray-300 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <input
                        type="number"
                        value={form.offset}
                        onChange={(e) => setForm({ ...form, offset: Number(e.target.value) })}
                        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <select
                        value={form.active ? "true" : "false"}
                        onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                      </select>
                    </td>
                    <td className="px-6 py-3">
                      <select
                        value={form.userId}
                        onChange={(e) => setForm({ ...form, userId: e.target.value })}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Sin vincular</option>
                        {person.user && (
                          <option value={person.user.id}>
                            {person.user.name} ({person.user.email})
                          </option>
                        )}
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.email})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="primary"
                          size="sm"
                          loading={saving}
                          onClick={() => handleUpdate(person.id)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelEdit}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={person.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-semibold text-indigo-600">
                        {person.code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{person.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded-full border border-gray-200 shadow-sm"
                          style={{ backgroundColor: person.color }}
                        />
                        <span className="text-xs text-gray-400 font-mono">{person.color}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{person.offset}</span>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={person.active ? "success" : "default"}>
                        {person.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {person.user ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          {person.user.name}
                        </span>
                      ) : (
                        <span className="text-gray-400">No vinculado</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(person)}>
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </Button>
                    </td>
                  </tr>
                )
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                    No se encontraron empleados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
