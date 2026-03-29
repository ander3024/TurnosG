"use client";
import { ToastProvider } from "@/components/ui/toast";

export function EmployeeLayoutClient({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
