"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home, CalendarDays, Palmtree, ArrowLeftRight, User, LogOut, Bell,
} from "lucide-react";
import { NotificationBell } from "./notification-bell";

interface NavbarProps {
  user: { id: number; name: string; email: string; role: string };
}

const tabs = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/intercambios", label: "Cambios", icon: ArrowLeftRight },
  { href: "/vacaciones", label: "Ausencias", icon: Palmtree },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function EmployeeNavbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingSwaps, setPendingSwaps] = useState(0);

  const fetchPendingSwaps = useCallback(async () => {
    try {
      const res = await fetch("/api/employee/swaps");
      if (res.ok) {
        const data = await res.json();
        const swaps = data.swaps || [];
        setPendingSwaps(swaps.filter((s: any) => s.status === "pendiente" && s.toUser?.id === user.id).length);
      }
    } catch {}
  }, [user.id]);

  useEffect(() => {
    fetchPendingSwaps();
    const interval = setInterval(fetchPendingSwaps, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingSwaps]);

  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const initials = user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <>
      {/* ═══ TOP BAR ═══ */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 md:h-16">
            {/* Brand */}
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <img src="/logo-small.png" alt="El Ganso" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
              <span className="font-semibold text-gray-900 text-sm sm:text-base">El Ganso</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {tabs.map((link) => {
                const Icon = link.icon;
                const hasBadge = link.href === "/intercambios" && pendingSwaps > 0;
                return (
                  <Link key={link.href} href={link.href}
                    className={cn("relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                      isActive(link.href) ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}>
                    <Icon className="w-4 h-4" />
                    {link.label}
                    {hasBadge && (
                      <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
                        {pendingSwaps}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                  {initials}
                </div>
                <span className="text-sm text-gray-700 font-medium max-w-[100px] truncate hidden lg:block">{user.name}</span>
              </div>
              <button onClick={handleLogout}
                className="hidden md:flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ MOBILE BOTTOM TAB BAR ═══ */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            const hasBadge = tab.href === "/intercambios" && pendingSwaps > 0;
            return (
              <Link key={tab.href} href={tab.href}
                className={cn("relative flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-xl transition-colors",
                  active ? "text-indigo-600" : "text-gray-400"
                )}>
                <div className="relative">
                  <Icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
                  {hasBadge && (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {pendingSwaps}
                    </span>
                  )}
                </div>
                <span className={cn("text-[10px] font-medium", active ? "text-indigo-600" : "text-gray-400")}>{tab.label}</span>
                {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-600 rounded-full" />}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
