"use client";

import React from "react";
import { NAV_LABELS } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";
import { MESES, usePeriod } from "@/lib/period";
import { useStore } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase";
import { Select } from "./ui";

const PERIOD_PAGES = new Set([
  "dashboard",
  "pedidos",
  "produccion",
  "costos-indirectos",
  "eerr",
  "punto-equilibrio",
  "an-rentabilidad",
  "an-productos",
  "an-clientes",
  "pe-vivo",
  "costeo",
  "roi",
]);

const SYNC_LABEL: Record<string, { text: string; color: string }> = {
  local: { text: "Solo local", color: "text-text3" },
  syncing: { text: "● Guardando…", color: "text-orange" },
  synced: { text: "● Sincronizado", color: "text-green" },
  error: { text: "● Error de sincronización", color: "text-red" },
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { page } = useRouter();
  const { mes, anio, setMes, setAnio } = usePeriod();
  const { syncStatus } = useStore();
  const showPeriod = PERIOD_PAGES.has(page);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);
  const sync = SYNC_LABEL[syncStatus];

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:px-7">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text2 md:hidden"
            aria-label="Abrir menú"
          >
            ☰
          </button>
        )}
        <div className="text-sm font-medium text-text2">{NAV_LABELS[page] ?? ""}</div>
      </div>
      <div className="flex items-center gap-3">
        {supabaseConfigured && <span className={`hidden text-[11px] sm:inline ${sync.color}`}>{sync.text}</span>}
        {showPeriod && (
          <div className="flex items-center gap-2">
            <Select value={mes} onChange={(e) => setMes(Number(e.target.value))} style={{ width: 110 }}>
              {MESES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
            <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 80 }}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
