"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarClock,
  Clock,
  Settings,
  Shield,
  FileText,
  LogOut,
  Palmtree,
  ArrowLeftRight,
  Activity,
  Bell,
  Zap,
  Menu,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "General",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Calendario", href: "/admin/calendar", icon: Calendar },
    ],
  },
  {
    title: "Personas",
    items: [
      { label: "Usuarios", href: "/admin/users", icon: Users },
      { label: "Empleados", href: "/admin/people", icon: Shield },
    ],
  },
  {
    title: "Turnos",
    items: [
      { label: "Tipos de turno", href: "/admin/shifts", icon: Clock },
      { label: "Eventos especiales", href: "/admin/events", icon: Zap },
      { label: "Asignaciones", href: "/admin/overrides", icon: CalendarClock },
      { label: "Intercambios", href: "/admin/swaps", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Ausencias",
    items: [
      { label: "Solicitudes", href: "/admin/timeoff", icon: Palmtree },
      { label: "Horas extra", href: "/admin/extra-hours", icon: Activity },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Festivos", href: "/admin/holidays", icon: Calendar },
      { label: "Configuración", href: "/admin/settings", icon: Settings },
      { label: "Auditoría", href: "/admin/audit", icon: FileText },
      { label: "Notificaciones", href: "/admin/notifications", icon: Bell },
    ],
  },
];

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      aria-label="Abrir menú"
    >
      <Menu className="w-6 h-6" />
    </button>
  );
}

export function AdminSidebar({
  user,
  mobileOpen,
  setMobileOpen,
}: {
  user: { name: string; email: string };
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-small.png" alt="El Ganso" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="font-bold text-gray-900 text-sm">El Ganso</h1>
            <p className="text-xs text-gray-500">Panel de Admin</p>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4 flex-shrink-0",
                        isActive ? "text-indigo-600" : "text-gray-400"
                      )}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <span className="text-xs font-bold text-indigo-700">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-200 flex-col z-40">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar panel */}
          <aside className="relative w-64 h-full bg-white flex flex-col shadow-xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
