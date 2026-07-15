"use client";

import React from "react";
import { Inbox, Search, type LucideIcon } from "lucide-react";

type Color = "gold" | "green" | "red" | "blue" | "orange" | "purple" | "none";

const colorBorder: Record<Color, string> = {
  gold: "border-t-accent",
  green: "border-t-green",
  red: "border-t-red",
  blue: "border-t-blue",
  orange: "border-t-orange",
  purple: "border-t-purple",
  none: "border-t-border",
};

const colorValue: Record<Color, string> = {
  gold: "text-accent",
  green: "text-green",
  red: "text-red",
  blue: "text-blue",
  orange: "text-orange",
  purple: "text-purple",
  none: "text-text",
};

export function Card({
  title,
  color = "none",
  className = "",
  children,
  right,
}: {
  title?: string;
  color?: Color;
  className?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-border ${colorBorder[color]} border-t-2 bg-surface p-[18px] shadow-[var(--shadow-card)] ${className}`}
    >
      {title && (
        <div className="mb-3.5 flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text3">{title}</div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  color = "none",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: Color;
}) {
  return (
    <div
      className={`rounded-xl border border-border ${colorBorder[color]} border-t-2 bg-surface p-4 shadow-[var(--shadow-card)]`}
    >
      <div className="text-[10px] uppercase tracking-[1.2px] text-text3">{label}</div>
      <div className={`my-1.5 text-2xl leading-none font-semibold ${colorValue[color]}`}>{value}</div>
      {sub && <div className="text-[11px] text-text3">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">{children}</div>;
}

type BtnVariant = "primary" | "ghost" | "danger" | "green";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-accent text-[#0d0d1a] hover:bg-accent2",
  ghost: "bg-transparent text-text2 border border-border hover:bg-surface2 hover:text-text",
  danger: "bg-red-dim text-red border border-red/20 hover:bg-red/20",
  green: "bg-green-dim text-green border border-green/20 hover:bg-green/20",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  variant?: BtnVariant;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors ${
        size === "sm" ? "px-2.5 py-[5px] text-[11.5px]" : "px-3.5 py-2 text-[12.5px]"
      } ${btnVariants[variant]} ${className} disabled:opacity-40 disabled:cursor-not-allowed`}
      {...rest}
    >
      {children}
    </button>
  );
}

type BadgeColor = "green" | "red" | "orange" | "blue" | "purple" | "gold";
const badgeColors: Record<BadgeColor, string> = {
  green: "bg-green-dim text-green",
  red: "bg-red-dim text-red",
  orange: "bg-orange-dim text-orange",
  blue: "bg-blue-dim text-blue",
  purple: "bg-purple-dim text-purple",
  gold: "bg-accent-dim text-accent",
};

export function Badge({ color, children }: { color: BadgeColor; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColors[color]}`}>
      {children}
    </span>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-border bg-surface2 px-[11px] py-2 text-[12.5px] text-text outline-none transition-colors focus:border-accent ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full cursor-pointer rounded-md border border-border bg-surface2 px-[11px] py-2 text-[12.5px] text-text outline-none transition-colors focus:border-accent ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-border bg-surface2 px-[11px] py-2 text-[12.5px] text-text outline-none transition-colors focus:border-accent ${props.className ?? ""}`}
    />
  );
}

export function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "col-span-full" : ""}`}>
      <label className="text-[11px] font-medium uppercase tracking-wide text-text3">{label}</label>
      {children}
    </div>
  );
}

export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">{children}</div>;
}

export function PageHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[22px] font-semibold text-text">{title}</h2>
        {sub && <p className="mt-1 text-xs text-text3">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function Th({ children, title }: { children?: React.ReactNode; title?: string }) {
  return (
    <th
      title={title}
      className={`whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[1.5px] text-text3 ${title ? "cursor-help decoration-dotted underline-offset-2 hover:underline" : ""}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  main,
  className = "",
}: {
  children?: React.ReactNode;
  main?: boolean;
  className?: string;
}) {
  return (
    <td className={`border-b border-border/50 px-3 py-2.5 align-middle ${main ? "font-medium text-text" : "text-text2"} ${className}`}>
      {children}
    </td>
  );
}

export function TrHover({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tr className={`hover:bg-surface2/60 [&:hover_td]:text-text ${className}`}>{children}</tr>;
}

export function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1">
      {options.map((o) => (
        <div
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
            value === o.value
              ? "border-accent/30 bg-accent-dim text-accent"
              : "border-border bg-surface2 text-text3 hover:text-text"
          }`}
        >
          {o.label}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, text }: { icon?: LucideIcon; text: string }) {
  return (
    <div className="py-10 text-center text-text3">
      <Icon className="mx-auto mb-2.5 h-9 w-9 stroke-[1.5] opacity-60" />
      <div>{text}</div>
    </div>
  );
}

export function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text3" />
      <Input {...props} className={`pl-9 ${props.className ?? ""}`} />
    </div>
  );
}

export function InfoRow({
  label,
  value,
  color = "none",
}: {
  label: string;
  value: React.ReactNode;
  color?: Color;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-none">
      <div className="text-xs text-text3">{label}</div>
      <div className={`text-xs font-medium ${colorValue[color]}`}>{value}</div>
    </div>
  );
}

export function BarRow({
  label,
  value,
  pct,
  color = "gold",
}: {
  label: string;
  value: React.ReactNode;
  pct: number;
  color?: Color;
}) {
  const barColor: Record<Color, string> = {
    gold: "bg-accent",
    green: "bg-green",
    red: "bg-red",
    blue: "bg-blue",
    orange: "bg-orange",
    purple: "bg-purple",
    none: "bg-accent",
  };
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[150px] shrink-0 truncate text-right text-[11.5px] text-text2">{label}</div>
      <div className="h-[7px] flex-1 overflow-hidden rounded bg-surface3">
        <div
          className={`h-full rounded transition-all duration-500 ${barColor[color]}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-[11.5px] text-text2">{value}</div>
    </div>
  );
}

export function Alert({
  kind = "info",
  children,
}: {
  kind?: "warning" | "success" | "info" | "danger";
  children: React.ReactNode;
}) {
  const styles = {
    warning: "bg-orange-dim border-orange/20 text-orange",
    success: "bg-green-dim border-green/20 text-green",
    info: "bg-blue-dim border-blue/20 text-blue",
    danger: "bg-red-dim border-red/20 text-red",
  };
  return (
    <div className={`mb-2.5 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] ${styles[kind]}`}>
      {children}
    </div>
  );
}

export function Sep() {
  return <div className="my-3.5 h-px bg-border" />;
}

export function Semaforo({ nivel, size = "md" }: { nivel: "green" | "orange" | "red"; size?: "sm" | "md" }) {
  const dotColor = { green: "bg-green", orange: "bg-orange", red: "bg-red" }[nivel];
  const ringColor = { green: "bg-green-dim", orange: "bg-orange-dim", red: "bg-red-dim" }[nivel];
  const px = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  const wrap = size === "sm" ? "p-1" : "p-1.5";
  return (
    <span className={`inline-flex items-center justify-center rounded-full ${ringColor} ${wrap}`}>
      <span className={`rounded-full ${dotColor} ${px}`} />
    </span>
  );
}
