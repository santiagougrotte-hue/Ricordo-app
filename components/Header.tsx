"use client";

import React from "react";
import { NAV_LABELS } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";
import { MESES, usePeriod } from "@/lib/period";
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

export function Header() {
  const { page } = useRouter();
  const { mes, anio, setMes, setAnio } = usePeriod();
  const showPeriod = PERIOD_PAGES.has(page);
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i);

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-bg/90 px-7 py-3 backdrop-blur">
      <div className="text-sm font-medium text-text2">{NAV_LABELS[page] ?? ""}</div>
      {showPeriod && (
        <div className="flex items-center gap-2">
          <Select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            style={{ width: 130 }}
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
          <Select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90 }}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
