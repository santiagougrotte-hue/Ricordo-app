"use client";

import React from "react";
import { ChevronLeft, ChevronRight, X, Home, Settings, LogOut } from "lucide-react";
import { CONFIG_PAGE, DASHBOARD_PAGE, MODULES, PAGE_LOCATION, moduleDefaultPage } from "@/lib/modules";
import { useRouter } from "@/lib/nav-context";
import { useAuth } from "@/lib/auth-context";
import { supabaseConfigured } from "@/lib/supabase";

export function Sidebar() {
  const { page, go, collapsed, setCollapsed, mobileOpen, setMobileOpen } = useRouter();
  const { signOut } = useAuth();

  const activeModuleKey = PAGE_LOCATION[page]?.module.key;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <nav
        className={`fixed inset-y-0 left-0 z-[100] flex w-[230px] flex-col overflow-y-auto border-r border-border bg-surface transition-transform duration-200 md:transition-[width] ${
          collapsed ? "md:w-[52px]" : "md:w-[230px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          title="Colapsar menú"
          className="absolute top-2.5 right-[-14px] z-[101] hidden h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text2 shadow-[var(--shadow-card)] hover:bg-surface2 hover:text-text md:flex"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text2 md:hidden"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="border-b border-border px-[18px] pb-3.5 pt-5">
          <h1 className={`font-bold tracking-wide text-accent ${collapsed ? "md:text-sm" : "text-xl"}`}>
            <span className="md:hidden">Ricordo</span>
            <span className="hidden md:inline">{collapsed ? "R" : "Ricordo"}</span>
          </h1>
          <span className={`mt-0.5 block text-[11px] text-text3 ${collapsed ? "md:hidden" : ""}`}>
            Pasta Artesanal
          </span>
        </div>

        <div className="flex-1 py-2">
          <SidebarItem
            active={page === DASHBOARD_PAGE}
            collapsed={collapsed}
            icon={Home}
            label="Inicio"
            color="var(--accent)"
            onClick={() => go(DASHBOARD_PAGE)}
          />

          <div className={`mx-3.5 my-2 border-t border-border ${collapsed ? "md:mx-2" : ""}`} />

          {MODULES.map((mod) => (
            <SidebarItem
              key={mod.key}
              active={activeModuleKey === mod.key}
              collapsed={collapsed}
              icon={mod.icon}
              label={mod.label}
              color={mod.color}
              onClick={() => go(moduleDefaultPage(mod))}
            />
          ))}
        </div>

        <div className={`border-t border-border p-2.5 ${collapsed ? "md:flex md:flex-col md:items-center" : ""}`}>
          <SidebarItem
            active={page === CONFIG_PAGE}
            collapsed={collapsed}
            icon={Settings}
            label="Configuración"
            color="var(--text3)"
            secondary
            onClick={() => go(CONFIG_PAGE)}
          />
          {supabaseConfigured && (
            <button
              onClick={() => signOut()}
              title={collapsed ? "Cerrar sesión" : undefined}
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-md px-3.5 py-2 text-[12.5px] text-text2 hover:bg-surface2 hover:text-text"
            >
              <LogOut className="h-[17px] w-[17px] shrink-0 stroke-[1.75]" />
              <span className={collapsed ? "md:hidden" : ""}>Cerrar sesión</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function SidebarItem({
  active,
  collapsed,
  icon: Icon,
  label,
  color,
  secondary,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  secondary?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`mx-1.5 my-0.5 flex min-h-[40px] cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-md border-l-2 px-3.5 py-2 text-[12.5px] transition-colors ${
        active
          ? secondary
            ? "border-transparent bg-surface2 font-medium text-text"
            : "font-medium text-text"
          : "border-transparent text-text2 hover:bg-surface2 hover:text-text"
      }`}
      style={active && !secondary ? { borderColor: color, backgroundColor: `color-mix(in oklab, ${color} 12%, transparent)`, color } : undefined}
    >
      <Icon className="h-[17px] w-[17px] shrink-0 stroke-[1.75]" />
      <span className={collapsed ? "md:hidden" : ""}>{label}</span>
    </div>
  );
}
