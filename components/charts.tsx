"use client";

// Primitivas de gráficos livianas (SVG a mano, sin librería) compartidas entre Analítica de
// Ventas y el Dashboard de Inicio — evita duplicar la misma lógica de barras/línea en cada módulo.

import React from "react";
import { fNum } from "@/lib/calc-v2";

function fPctFirmado(n: number | null): string {
  if (n === null) return "—";
  const signo = n > 0 ? "+" : "";
  return `${signo}${fNum(n, 1)}%`;
}

export function IndicadorCrecimiento({ label, valor }: { label: string; valor: number | null }) {
  const color = valor === null ? "text-text3" : valor > 0 ? "text-green" : valor < 0 ? "text-red" : "text-text2";
  const flecha = valor === null ? "" : valor > 0 ? "↑ " : valor < 0 ? "↓ " : "";
  return (
    <div className="rounded-[var(--radius-card)] border border-border p-3">
      <div className="text-[11px] text-text3">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>
        {flecha}
        {fPctFirmado(valor)}
      </div>
    </div>
  );
}

/** Barras verticales genéricas — comparaciones simples de N categorías con un solo valor cada una. */
export function GraficoBarras({ datos, color = "#4a90d9" }: { datos: { label: string; valor: number }[]; color?: string }) {
  if (datos.length === 0) return null;
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const alto = 110;
  const anchoBarra = 40;
  const gap = 24;
  const anchoGrupo = anchoBarra + gap;
  const anchoTotal = datos.length * anchoGrupo;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${anchoTotal} ${alto + 26}`} className="text-text2" style={{ height: 150, minWidth: Math.min(anchoTotal, 420) }}>
        {datos.map((d, i) => {
          const x0 = i * anchoGrupo + gap / 2;
          const h = (d.valor / max) * alto;
          return (
            <g key={i}>
              <rect x={x0} y={alto - h} width={anchoBarra} height={h} fill={color} rx={3} />
              <text x={x0 + anchoBarra / 2} y={alto + 14} fontSize="10" textAnchor="middle" fill="currentColor">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Línea de evolución mensual (N puntos) — usado por evolución de ventas, de un gusto o de un canal. */
export function GraficoLinea({ puntos, color = "#4a90d9" }: { puntos: { label: string; valor: number }[]; color?: string }) {
  if (puntos.length === 0) return null;
  const max = Math.max(1, ...puntos.map((p) => p.valor));
  const alto = 110;
  const ancho = 700;
  const paso = ancho / Math.max(1, puntos.length - 1);
  const coords = puntos.map((p, i) => ({ x: i * paso, y: alto - (p.valor / max) * alto }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${ancho} ${alto + 26}`} className="text-text2" style={{ height: 150, minWidth: 500 }}>
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={3} fill={color} />
            <text x={c.x} y={alto + 14} fontSize="9" textAnchor="middle" fill="currentColor">
              {puntos[i].label.slice(0, 3)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
