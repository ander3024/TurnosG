"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";
import { cn, formatDate, formatDateTime, statusColor, statusLabel } from "@/lib/utils";

interface TimeOffData {
  id: number;
  personId: number;
  person: { id: number; code: string; name: string };
  requesterId: number;
  requester: { id: number; name: string; email: string };
  type: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  status: string;
  note: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PersonOption {
  id: number;
  code: string;
  name: string;
}

interface Props {
  initialRequests: TimeOffData[];
}

const typeLabels: Record<string, string> = {
  vacaciones: "Vacaciones",
  asuntos_propios: "Asuntos propios",
  enfermedad: "Enfermedad",
  otro: "Otro",
};

const typeOptions = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "asuntos_propios", label: "Asuntos propios" },
  { value: "enfermedad", label: "Enfermedad" },
  { value: "otro", label: "Otro" },
];

const emptyForm = {
  personId: "",
  type: "",
  startDate: "",
  endDate: "",
  note: "",
};

export function TimeOffManagement({ initialRequests }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processing, setProcessing] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [people, setPeople] = useState<PersonOption[]>([]);

  useEffect(() => {
    fetch("/api/admin/people")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items || [];
        setPeople(list.map((p: any) => ({ id: p.id, code: p.code, name: p.name })));
      })
      .catch(() => {});
  }, []);

  const filtered = requests.filter((r) => {
    const matchesSearch =
      r.person.name.toLowerCase().includes(search.toLowerCase()) ||
      r.person.code.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: requests.length,
    pendiente: requests.filter((r) => r.status === "pendiente").length,
    aprobada: requests.filter((r) => r.status === "aprobada").length,
    rechazada: requests.filter((r) => r.status === "rechazada").length,
  };

  function startEdit(req: TimeOffData) {
    setEditingId(req.id);
    setShowCreate(false);
    setForm({
      personId: String(req.personId),
      type: req.type,
      startDate: req.startDate,
      endDate: req.endDate,
      note: req.note || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleAction(id: number, action: "aprobada" | "rechazada") {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/timeoff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(requests.map((r) => (r.id === id ? { ...r, ...data } : r)));
      }
    } finally {
      setProcessing(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/timeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: Number(form.personId),
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate,
          note: form.note || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests([data, ...requests]);
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
      const res = await fetch(`/api/admin/timeoff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          startDate: form.startDate,
          endDate: form.endDate,
          note: form.note || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(requests.map((r) => (r.id === id ? { ...r, ...data } : r)));
        setEditingId(null);
        setForm(emptyForm);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const req = requests.find((r) => r.id === id);
    const msg = req?.status === "pendiente"
      ? "¿Cancelar esta solicitud pendiente?"
      : "¿Eliminar esta solicitud?";
    if (!confirm(msg)) return;
    setDeleting(id);
    try {
      if (req?.status === "pendiente") {
        const res = await fetch(`/api/admin/timeoff/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cancelada" }),
        });
        if (res.ok) {
          const data = await res.json();
          setRequests(requests.map((r) => (r.id === id ? { ...r, ...data } : r)));
        }
      } else {
        const res = await fetch(`/api/admin/timeoff/${id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          setRequests(requests.filter((r) => r.id !== id));
        }
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Status Filter Tabs + New Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: "all", label: "Todas" },
              { key: "pendiente", label: "Pendientes" },
              { key: "aprobada", label: "Aprobadas" },
              { key: "rechazada", label: "Rechazadas" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                statusFilter === tab.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {tab.label}
              <span
                className={`ml-2 text-xs ${
                  statusFilter === tab.key ? "text-indigo-200" : "text-gray-400"
                }`}
              >
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>
        <Button onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}>
          <Plus className="w-4 h-4" />
          Nueva solicitud
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por persona..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-indigo-200">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Nueva solicitud de ausencia</h3>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {typeOptions.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
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
              <Input
                label="Nota"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Motivo (opcional)"
              />
              <div className="flex items-end gap-2 lg:col-span-5">
                <Button type="submit" loading={saving}>
                  Crear solicitud
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
        {filtered.map((req) => (
          <Card key={req.id}>
            <CardContent className="!py-4">
              {editingId === req.id ? (
                /* Inline Edit Form */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700">Tipo</label>
                      <select
                        value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                        className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        required
                      >
                        {typeOptions.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
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
                    <Input
                      label="Nota"
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      placeholder="Motivo (opcional)"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" loading={saving} onClick={() => handleUpdate(req.id)}>
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
                        <p className="text-sm font-medium text-gray-900 truncate">{req.person.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{req.person.code}</p>
                      </div>
                    </div>
                    <Badge variant="info">
                      {typeLabels[req.type] || req.type}
                    </Badge>
                    <div className="hidden sm:block text-sm text-gray-600">
                      {formatDate(req.startDate)}
                      <span className="text-gray-300 mx-1">-</span>
                      {formatDate(req.endDate)}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                        statusColor(req.status)
                      )}
                    >
                      {statusLabel(req.status)}
                    </span>
                    <span className="hidden lg:block text-xs text-gray-400 shrink-0">
                      por {req.requester.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {req.status === "pendiente" && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          loading={processing === req.id}
                          onClick={() => handleAction(req.id, "aprobada")}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aprobar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          loading={processing === req.id}
                          onClick={() => handleAction(req.id, "rechazada")}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Rechazar
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(req)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deleting === req.id}
                      onClick={() => handleDelete(req.id)}
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
              No hay solicitudes que coincidan con los filtros
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
