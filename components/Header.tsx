"use client";

import React, { useEffect, useState } from "react";
import { Menu, ChevronRight, Circle, Search } from "lucide-react";
import { NAV_LABELS, NAV_GROUPS } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";
import { MESES, usePeriod } from "@/lib/period";
import { useStoreV2 } from "@/lib/store-v2";
import { supabaseConfigured } from "@/lib/supabase";
import { Select } from "./ui";
import { GlobalSearchModal } from "./GlobalSearchModal";

// Módulos donde el filtro de mes/año del header tiene sentido (los que muestran datos por
// período): Inicio, Ventas y Finanzas. Productos/Inventario/Operaciones/Configuración no dependen
// del período seleccionado.
const PERIOD_PAGES = new Set(["inicio", "ventas", "finanzas"]);

const SYNC_LABEL: Record<string, { text: string; color: string }> = {
  local: { text: "Solo local", color: "text-text3" },
  syncing: { text: "Guardando…", color: "text-orange" },
  synced: { text: "Sincronizado", color: "text-green" },
  error: { text: "Error al guardar", color: "text-red" },
  conflict: { text: "Conflicto por resolver", color: "text-orange" },
};

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { page } = useRouter();
  const { mes, anio, setMes, setAnio } = usePeriod();
  const { syncStatus, reintentar } = useStoreV2();
  const showPeriod = PERIOD_PAGES.has(page);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);
  const sync = SYNC_LABEL[syncStatus];
  const group = NAV_GROUPS[page];
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusquedaAbierta(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:px-7">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-text2 md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-1.5 text-sm font-medium text-text2">
          {group && (
            <>
              <span className="text-text3">{group}</span>
              <ChevronRight className="h-3.5 w-3.5 text-text3" />
            </>
          )}
          <span className="text-text">{NAV_LABELS[page] ?? ""}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setBusquedaAbierta(true)}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-text3 hover:border-border2 hover:text-text2"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Buscar</span>
          <span className="hidden rounded border border-border px-1 text-[10px] sm:inline">⌘K</span>
        </button>
        {supabaseConfigured && (
          <span className={`hidden items-center gap-1.5 text-[11px] sm:flex ${sync.color}`}>
            <Circle className="h-2 w-2 fill-current" />
            {sync.text}
            {syncStatus === "error" && (
              <button onClick={reintentar} className="ml-1 rounded border border-current px-1.5 py-0.5 text-[10px] hover:bg-red/10">
                Reintentar
              </button>
            )}
          </span>
        )}
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
      <GlobalSearchModal open={busquedaAbierta} onClose={() => setBusquedaAbierta(false)} />
    </div>
  );
}
