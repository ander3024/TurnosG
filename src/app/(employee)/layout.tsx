import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EmployeeNavbar } from "@/components/employee/navbar";

export const metadata = {
  title: "El Ganso - Portal del Empleado",
};

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Admin users go to the admin panel
  if (user.role === "admin") redirect("/admin");

  return (
    <div className="min-h-screen bg-gray-50/50">
      <EmployeeNavbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
