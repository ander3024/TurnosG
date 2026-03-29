"use client";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Algo salió mal</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-md">
        Ha ocurrido un error inesperado. Puedes intentar recargar la página.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
