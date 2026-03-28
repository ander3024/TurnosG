"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar, MobileMenuButton } from "@/components/admin/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        const u = data?.user || data;
        if (!u || u.role !== "admin") {
          router.push("/login");
          return;
        }
        setUser(u);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar user={user} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 md:hidden bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <MobileMenuButton onClick={() => setMobileOpen(true)} />
          <img src="/logo-small.png" alt="El Ganso" className="w-8 h-8 object-contain" />
          <span className="font-bold text-gray-900 text-sm">El Ganso</span>
        </div>
      </div>

      <main className="flex-1 ml-0 md:ml-64">
        <div className="p-4 md:p-8 pt-16 md:pt-8">{children}</div>
      </main>
    </div>
  );
}
