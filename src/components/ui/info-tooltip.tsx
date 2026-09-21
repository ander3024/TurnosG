"use client";
import { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  content: React.ReactNode;
  className?: string;
  iconClassName?: string;
  side?: "top" | "bottom" | "left" | "right";
}

export function InfoTooltip({ content, className, iconClassName, side = "bottom" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div ref={ref} className={cn("relative inline-block", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" onClick={() => setOpen(!open)}
        className={cn("inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 transition-colors", iconClassName)}>
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <div className={cn(
          "absolute z-50 w-72 max-w-[90vw] p-3 rounded-xl bg-gray-900 text-white text-xs shadow-xl border border-gray-800 leading-relaxed",
          positions[side]
        )}>
          {content}
        </div>
      )}
    </div>
  );
}
