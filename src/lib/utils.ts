import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusColor(status: string): string {
  switch (status) {
    case "aprobada":
    case "aprobado":
    case "aceptado":
      return "bg-emerald-100 text-emerald-800";
    case "pendiente":
      return "bg-amber-100 text-amber-800";
    case "rechazada":
    case "rechazado":
      return "bg-red-100 text-red-800";
    case "cancelada":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendiente: "Pendiente",
    aprobada: "Aprobada",
    aprobado: "Aprobado",
    rechazada: "Rechazada",
    cancelada: "Cancelada",
    aceptado: "Aceptado",
    rechazado: "Rechazado",
  };
  return labels[status] || status;
}
