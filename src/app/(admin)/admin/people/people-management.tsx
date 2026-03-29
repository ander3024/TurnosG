"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserPlus, Search, Pencil, X, Check, Save } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface PersonData {
  id: number; code: string; name: string; color: string; offset: number; active: boolean;
  user: { id: number; name: string; email: string } | null;
}
interface Props {
  initialPeople: PersonData[];
  availableUsers: { id: number; name: string; email: string }[];
}

const emptyForm = { code: "", name: "", color: "#3b82f6", offset: 0, active: true, userId: "" };

export function PeopleManagement({ initialPeople, availableUsers }: Props) {
  const [people, setPeople] = useState(initialPeople);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const toast = useToast();

  const filtered = people.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase()));

  function startEdit(person: PersonData) {
    setEditingId(person.id); setShowCreate(false);
    setForm({ code: person.code, name: person.name, color: person.color, offset: person.offset, active: person.active, userId: person.user?.id?.toString() || "" });
  }
  function cancelEdit() { setEditingId(null); setShowCreate(false); setForm(emptyForm); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch("/api/admin/people", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, offset: Number(form.offset), userId: form.userId ? Number(form.userId) : null }) });
      if (res.ok) { const data = await res.json(); setPeople([...people, data]); cancelEdit(); toast.success("Empleado creado"); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al crear empleado"); }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/people/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, offset: Number(form.offset), userId: form.userId ? Number(form.userId) : null }) });
      if (res.ok) { const data = await res.json(); setPeople(people.map((p) => (p.id === id ? data : p))); cancelEdit(); toast.success("Empleado actualizado"); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al actualizar"); }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  function PersonForm({ onSubmit, label }: { onSubmit: (e: React.FormEvent) => void; label: string }) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="P1, P2..." required />
          <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Color</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
              <span className="text-sm text-gray-500 font-mono">{form.color}</span>
            </div>
          </div>
          <Input label="Offset (rotación)" type="number" value={form.offset.toString()} onChange={(e) => setForm({ ...form, offset: Number(e.target.value) })} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Estado</label>
            <select value={form.active ? "true" : "false"} onChange={(e) => setForm({ ...form, active: e.target.value === "true" })} className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="true">Activo</option><option value="false">Inactivo</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Vincular a usuario</label>
            <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Sin vincular</option>
              {availableUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={saving}>{label}</Button>
          <Button type="button" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar empleados..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setEditingId(null); setForm(emptyForm); }}>
          <UserPlus className="w-4 h-4" /> Nuevo empleado
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-indigo-200 shadow-md">
          <CardHeader><h3 className="font-semibold text-gray-900">Crear nuevo empleado</h3></CardHeader>
          <CardContent><PersonForm onSubmit={handleCreate} label="Crear empleado" /></CardContent>
        </Card>
      )}

      {/* People Cards */}
      <div className="space-y-2">
        {filtered.map((person) => (
          <Card key={person.id} className={cn(!person.active && "opacity-50")}>
            {editingId === person.id ? (
              <>
                <CardHeader><h3 className="font-semibold text-gray-900">Editar empleado</h3></CardHeader>
                <CardContent><PersonForm onSubmit={(e) => { e.preventDefault(); handleUpdate(person.id); }} label="Guardar" /></CardContent>
              </>
            ) : (
              <CardContent className="!py-4">
                <div className="flex items-center gap-3">
                  {/* Color + Code */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: person.color }}>
                    {person.code}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{person.name}</p>
                      <Badge variant={person.active ? "success" : "default"}>{person.active ? "Activo" : "Inactivo"}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                      <span>Offset: {person.offset}</span>
                      {person.user ? (
                        <span className="text-emerald-600">{person.user.name} ({person.user.email})</span>
                      ) : (
                        <span className="text-gray-400">Sin usuario</span>
                      )}
                    </div>
                  </div>
                  {/* Edit */}
                  <button onClick={() => startEdit(person)} className="p-2 rounded-lg hover:bg-gray-100 flex-shrink-0">
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center"><p className="text-sm text-gray-400">No se encontraron empleados</p></CardContent></Card>
        )}
      </div>
    </div>
  );
}
