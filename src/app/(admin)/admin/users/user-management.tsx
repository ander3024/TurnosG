"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  UserPlus, Search, Pencil, Trash2, X, Check, Key, Mail, Shield,
  Phone, User, Calendar, Link2, Send, Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface UserData {
  id: number; email: string; name: string; role: string;
  active: boolean; phone: string | null; createdAt: Date;
  person: { id: number; code: string; name: string } | null;
}

interface Props {
  initialUsers: UserData[];
  availablePeople: { id: number; code: string; name: string }[];
}

const emptyForm = { email: "", name: "", password: "", role: "user", phone: "", personId: "" };

const roleConfig: Record<string, { label: string; variant: "danger" | "warning" | "default"; icon: typeof Shield }> = {
  admin: { label: "Administrador", variant: "danger", icon: Shield },
  manager: { label: "Manager", variant: "warning", icon: User },
  user: { label: "Usuario", variant: "default", icon: User },
};

export function UserManagement({ initialUsers, availablePeople }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [feedback, setFeedback] = useState<{ id: number; msg: string } | null>(null);
  const toast = useToast();

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  function showFeedback(id: number, msg: string) {
    setFeedback({ id, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  function startEdit(user: UserData) {
    setEditingId(user.id);
    setShowCreate(false);
    setExpandedId(null);
    setForm({
      email: user.email, name: user.name, password: "",
      role: user.role, phone: user.phone || "",
      personId: user.person?.id?.toString() || "",
    });
  }

  function cancelEdit() { setEditingId(null); setShowCreate(false); setForm(emptyForm); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) { toast.warning("La contraseña debe tener al menos 6 caracteres"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers([data, ...users]);
        cancelEdit();
        toast.success("Usuario creado correctamente");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al crear usuario");
      }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function handleUpdate(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, role: form.role, phone: form.phone || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(users.map((u) => (u.id === id ? { ...u, ...data } : u)));
        cancelEdit();
        toast.success("Usuario actualizado");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al actualizar usuario");
      }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function handleResetPassword(id: number) {
    if (!newPassword || newPassword.length < 6) { toast.warning("Mínimo 6 caracteres"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setNewPassword("");
        setShowPw(false);
        toast.success("Contraseña cambiada");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Error al cambiar contraseña");
      }
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function sendResetEmail(email: string, id: number) {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) toast.success("Email de recuperación enviado");
      else toast.error("Error al enviar email de recuperación");
    } catch { toast.error("Error de conexión"); } finally { setSaving(false); }
  }

  async function toggleActive(id: number, active: boolean) {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, active: !active } : u)));
        toast.success(active ? "Usuario desactivado" : "Usuario activado");
      } else toast.error("Error al cambiar estado");
    } catch { toast.error("Error de conexión"); }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`¿Eliminar a "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (res.ok) { setUsers(users.filter((u) => u.id !== id)); toast.success("Usuario eliminado"); }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || "Error al eliminar"); }
    } catch { toast.error("Error de conexión"); }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar por nombre o email..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <Button onClick={() => { setShowCreate(true); setEditingId(null); setExpandedId(null); setForm(emptyForm); }}>
          <UserPlus className="w-4 h-4" /> Nuevo usuario
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>{users.length} usuarios</span>
        <span>{users.filter((u) => u.active).length} activos</span>
        <span>{users.filter((u) => u.role === "admin").length} admins</span>
      </div>

      {/* Create Form */}
      {showCreate && (
        <Card className="border-indigo-200 shadow-md">
          <CardHeader><h3 className="font-semibold text-gray-900">Crear nuevo usuario</h3></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Nombre completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <Input label="Contraseña inicial" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="Mínimo 6 caracteres" />
                <Input label="Teléfono" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Opcional" />
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Rol</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="user">Usuario (empleado)</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <p className="text-[11px] text-gray-400">Los admins pueden gestionar todo el sistema</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Vincular a empleado</label>
                  <select value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })}
                    className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Sin vincular</option>
                    {availablePeople.map((p) => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                  </select>
                  <p className="text-[11px] text-gray-400">Vincula al usuario con un empleado del calendario</p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" loading={saving}>Crear usuario</Button>
                <Button type="button" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Users List */}
      <div className="space-y-2">
        {filtered.map((user) => {
          const rc = roleConfig[user.role] || roleConfig.user;
          const isExpanded = expandedId === user.id;
          const fb = feedback?.id === user.id ? feedback.msg : null;

          return (
            <Card key={user.id} className={cn(!user.active && "opacity-50", isExpanded && "ring-2 ring-indigo-200")}>
              {editingId === user.id ? (
                <>
                  <CardHeader><h3 className="font-semibold text-gray-900">Editar usuario</h3></CardHeader>
                  <CardContent>
                    <form onSubmit={(e) => { e.preventDefault(); handleUpdate(user.id); }} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                        <Input label="Teléfono" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Opcional" />
                        <div className="space-y-1.5">
                          <label className="block text-sm font-medium text-gray-700">Rol</label>
                          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                            className="block w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="user">Usuario</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Administrador</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" loading={saving}>Guardar</Button>
                        <Button type="button" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
                      </div>
                    </form>
                  </CardContent>
                </>
              ) : (
                <CardContent className="!py-4">
                  {/* Main row */}
                  <div className="flex items-center gap-3 sm:gap-4" onClick={() => setExpandedId(isExpanded ? null : user.id)}>
                    <div className="w-11 h-11 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer">
                      <span className="text-base font-bold text-indigo-700">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                        <Badge variant={rc.variant}>{rc.label}</Badge>
                        {!user.active && <Badge>Inactivo</Badge>}
                        {fb && <Badge variant="success">{fb}</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
                    </div>
                    <button className="p-2 rounded-lg hover:bg-gray-100 flex-shrink-0" onClick={(e) => { e.stopPropagation(); startEdit(user); }}>
                      <Pencil className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  {/* Expanded panel */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                      {/* Info grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Mail className="w-4 h-4 text-gray-400" /> {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Phone className="w-4 h-4 text-gray-400" /> {user.phone || "Sin teléfono"}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Link2 className="w-4 h-4 text-gray-400" />
                          {user.person ? (
                            <span className="text-emerald-600 font-medium">{user.person.code} - {user.person.name}</span>
                          ) : (
                            <span className="text-gray-400">Sin empleado vinculado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          Creado: {new Date(user.createdAt).toLocaleDateString("es-ES")}
                        </div>
                      </div>

                      {/* Password reset */}
                      <div className="p-3 rounded-xl bg-gray-50 space-y-3">
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Contraseña</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="flex-1 relative">
                            <input
                              type={showPw ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Nueva contraseña (mín. 6 caract.)"
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
                              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleResetPassword(user.id)} loading={saving} disabled={!newPassword}>
                              <Key className="w-3.5 h-3.5" /> Cambiar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => sendResetEmail(user.email, user.id)} loading={saving}>
                              <Send className="w-3.5 h-3.5" /> Enviar email reset
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(user)}>
                          <Pencil className="w-3.5 h-3.5" /> Editar datos
                        </Button>
                        <Button size="sm" variant={user.active ? "ghost" : "primary"} onClick={() => toggleActive(user.id, user.active)}>
                          {user.active ? "Desactivar cuenta" : "Activar cuenta"}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(user.id, user.name)}>
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No se encontraron usuarios</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
