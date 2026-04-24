"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, CalendarDays, Palmtree } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function ReportButtons({ year }: { year: number }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const toast = useToast();

  async function download(type: "horarios" | "vacaciones") {
    setDownloading(type);
    try {
      const res = await fetch(`/api/admin/reports?type=${type}&year=${year}`);
      if (!res.ok) {
        toast.error("Error al generar el informe");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "vacaciones" ? `Control_Vacaciones_${year}.xlsx` : `Horarios_Soporte_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Informe descargado");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => download("horarios")}
        loading={downloading === "horarios"} disabled={!!downloading}>
        <CalendarDays className="w-4 h-4" /> Horarios Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => download("vacaciones")}
        loading={downloading === "vacaciones"} disabled={!!downloading}>
        <Palmtree className="w-4 h-4" /> Vacaciones Excel
      </Button>
    </div>
  );
}
