"use client";

import React from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

export const SECTION_LABEL = "text-[11px] font-bold uppercase tracking-[1.3px] text-text2";
export const NUM_BIG = "font-[750] tracking-[-1.6px] [font-variant-numeric:tabular-nums]";

/** Métrica grande + subtítulo + chip de comparación (verde/rojo según signo) + link al pie. */
export function Hero({
  label,
  value,
  sub,
  comparacion,
  linkText,
  onLinkClick,
}: {
  label: string;
  value: string;
  sub?: string;
  comparacion?: { pct: number; label?: string };
  linkText?: string;
  onLinkClick?: () => void;
}) {
  const subiendo = comparacion ? comparacion.pct >= 0 : null;
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className={SECTION_LABEL}>{label}</div>
      <div className={`mt-1.5 text-[34px] leading-none text-text ${NUM_BIG}`}>{value}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        {sub && <span className="text-[12.5px] text-text2">{sub}</span>}
        {comparacion && (
          <span
            className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-semibold ${
              subiendo ? "bg-green-dim text-green" : "bg-red-dim text-red"
            }`}
          >
            {subiendo ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(comparacion.pct).toFixed(1)}% {comparacion.label ?? ""}
          </span>
        )}
      </div>
      {linkText && (
        <button
          onClick={onLinkClick}
          className="mt-3 min-h-[28px] text-[12.5px] font-medium text-accent hover:text-accent2"
        >
          {linkText} →
        </button>
      )}
    </div>
  );
}

/** Número grande a la izquierda + grupo de pills a la derecha. */
export function StatRow({ value, pills }: { value: React.ReactNode; pills: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className={`text-[22px] text-text ${NUM_BIG}`}>{value}</div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">{pills}</div>
    </div>
  );
}

export type PillVariant = "neutral" | "warn" | "bad";
const PILL_STYLES: Record<PillVariant, string> = {
  neutral: "bg-surface3 text-text2",
  warn: "bg-orange-dim text-orange",
  bad: "bg-red-dim text-red",
};

/** Mini-métrica — variantes neutral / warn / bad. */
export function Pill({ children, variant = "neutral" }: { children: React.ReactNode; variant?: PillVariant }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-semibold ${PILL_STYLES[variant]}`}
    >
      {children}
    </span>
  );
}

/** Fila de lista: ícono cuadrado + título/subtítulo + valor a la derecha. */
export function Row({
  icon: Icon,
  iconColor = "var(--accent)",
  title,
  subtitle,
  value,
  onClick,
}: {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: React.ReactNode;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`flex w-full min-h-[44px] items-center gap-3 py-2 text-left ${
        onClick ? "-mx-2 cursor-pointer rounded-lg px-2 hover:bg-surface2/60" : ""
      }`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
        style={{ backgroundColor: `color-mix(in oklab, ${iconColor} 14%, transparent)` }}
      >
        <Icon className="h-4 w-4" style={{ color: iconColor }} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-text">{title}</span>
        {subtitle && <span className="block truncate text-[11.5px] text-text3">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-[13px] font-medium text-text2">{value}</span>}
    </Comp>
  );
}

const BAR_COLORS = {
  accent: "bg-accent",
  green: "bg-green",
  orange: "bg-orange",
  red: "bg-red",
  blue: "bg-blue",
  purple: "bg-purple",
};

/** Barra de progreso fina, para márgenes y participación. */
export function Bar({
  pct,
  color = "accent",
  height = 6,
}: {
  pct: number;
  color?: keyof typeof BAR_COLORS;
  height?: number;
}) {
  return (
    <div className="w-full overflow-hidden rounded-[var(--radius-bar)] bg-surface3" style={{ height }}>
      <div
        className={`h-full rounded-[var(--radius-bar)] transition-all duration-500 ${BAR_COLORS[color]}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export interface ModuleRailItem {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
}

/** Rail horizontal scrolleable de íconos circulares por módulo, sin scrollbar visible, marca el activo. */
export function ModuleRail({
  items,
  active,
  onSelect,
}: {
  items: ModuleRailItem[];
  active?: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <button
            key={it.key}
            onClick={() => onSelect?.(it.key)}
            className="flex min-h-[44px] shrink-0 flex-col items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-icon)] border-2 transition-transform"
              style={{
                backgroundColor: `color-mix(in oklab, ${it.color} 13%, transparent)`,
                borderColor: isActive ? it.color : `color-mix(in oklab, ${it.color} 27%, transparent)`,
                transform: isActive ? "scale(1.06)" : undefined,
              }}
            >
              <it.icon className="h-5 w-5" style={{ color: it.color }} strokeWidth={2} />
            </span>
            <span className={`text-[10.5px] ${isActive ? "font-semibold text-text" : "text-text3"}`}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Selector de 2–3 opciones. */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-border bg-surface2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] rounded-[calc(var(--radius-pill)-4px)] px-3 text-[12px] font-medium transition-colors ${
            value === o.value ? "bg-accent text-[#0d0d1a]" : "text-text2 hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Card con gradiente violeta para el insight destacado — rojo si la severidad es "alta". */
export function PulseCard({
  title = "Pulso semanal",
  children,
  severidad = "info",
  fecha,
  onRefresh,
}: {
  title?: string;
  children: React.ReactNode;
  severidad?: "alta" | "media" | "info";
  fecha?: string;
  onRefresh?: () => void;
}) {
  const esAlta = severidad === "alta";
  return (
    <div
      className="relative rounded-[var(--radius-card)] border p-5 text-white"
      style={{
        borderColor: esAlta ? "rgba(245,86,110,0.35)" : "rgba(139,92,246,0.3)",
        background: esAlta
          ? "linear-gradient(135deg, #7a1f33 0%, #3d0f1a 100%)"
          : "linear-gradient(135deg, #8b5cf6 0%, #4c1d95 100%)",
      }}
    >
      <span className="absolute right-5 top-5 h-2 w-2 animate-pulse-glow rounded-full bg-white/80" />
      <div className="mb-2 flex items-center justify-between pr-6">
        <span className="text-[11px] font-bold uppercase tracking-[1.3px] text-white/70">{title}</span>
        {onRefresh && (
          <button onClick={onRefresh} className="min-h-[28px] text-[11px] font-medium text-white/80 hover:text-white">
            Actualizar pulso
          </button>
        )}
      </div>
      <div className="text-[13px] leading-relaxed text-white/95">{children}</div>
      {fecha && <div className="mt-3 text-[11px] text-white/60">Actualizado {fecha}</div>}
    </div>
  );
}

/** Barra fija abajo: acción principal + botón secundario. */
export function ActionBar({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2.5">
        {secondaryLabel && (
          <button
            onClick={onSecondary}
            className="min-h-[44px] rounded-[var(--radius-pill)] border border-border px-4 text-[13px] font-medium text-text2 hover:text-text"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          onClick={onPrimary}
          className="min-h-[44px] flex-1 rounded-[var(--radius-pill)] bg-accent px-4 text-[13px] font-semibold text-[#0d0d1a] hover:bg-accent2"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
