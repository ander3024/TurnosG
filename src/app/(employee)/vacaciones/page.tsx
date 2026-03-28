"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate, statusColor, statusLabel } from "@/lib/utils";
import { Plus, X, Palmtree, Send } from "lucide-react";

interface TimeOffRequest {
  id: number;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  note: string | null;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "asuntos_propios", label: "Asuntos propios" },
  { value: "enfermedad", label: "Enfermedad" },
  { value: "otro", label: "Otro" },
];

export default function VacacionesPage() {
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [type, setType] = useState("vacaciones");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    try {
      const res = await fetch("/api/employee/timeoff");
      if (res.ok) {
        const json = await res.json();
        setRequests(json.requests);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!startDate || !endDate) {
      setError("Por favor, selecciona las fechas");
      return;
    }
    if (endDate < startDate) {
      setError("La fecha de fin debe ser posterior a la de inicio");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/employee/timeoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, startDate, endDate, note: note || null }),
      });

      if (res.ok) {
        setShowForm(false);
        setType("vacaciones");
        setStartDate("");
        setEndDate("");
        setNote("");
        fetchRequests();
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear la solicitud");
      }
    } catch {
      setError("Error de conexion");
    }
    setSubmitting(false);
  }

  function resetForm() {
    setShowForm(false);
    setError("");
    setType("vacaciones");
    setStartDate("");
    setEndDate("");
    setNote("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vacaciones y Ausencias</h1>
          <p className="text-gray-500 mt-1">
            Gestiona tus solicitudes de tiempo libre
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="w-4 h-4" />
            Nueva solicitud
          </Button>
        )}
      </div>

      {/* New request form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Nueva solicitud</h2>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="startDate"
                  label="Fecha inicio"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                <Input
                  id="endDate"
                  label="Fecha fin"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="note"
                  className="block text-sm font-medium text-gray-700"
                >
                  Nota (opcional)
                </label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-400"
                  placeholder="Motivo o comentario adicional..."
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" type="button" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" loading={submitting}>
                  <Send className="w-4 h-4" />
                  Enviar solicitud
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Requests list */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Mis solicitudes</h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <Palmtree className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                No tienes solicitudes de ausencia
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Pulsa &quot;Nueva solicitud&quot; para crear una
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(req.startDate)} - {formatDate(req.endDate)}
                      </p>
                      <Badge className={statusColor(req.status)}>
                        {statusLabel(req.status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 capitalize">
                      {req.type.replace("_", " ")}
                      {req.note && ` — ${req.note}`}
                    </p>
                  </div>
                  <div className="text-xs text-gray-400">
                    Creada el{" "}
                    {new Date(req.createdAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
