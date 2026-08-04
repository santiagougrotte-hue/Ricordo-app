"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, LogOut } from "lucide-react";
import { NAV } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";
import { useAuth } from "@/lib/auth-context";
import { supabaseConfigured } from "@/lib/supabase";

export function Sidebar() {
  const { page, go, collapsed, setCollapsed, mobileOpen, setMobileOpen } = useRouter();
  const { signOut } = useAuth();
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (g: string) =>
    setClosedGroups((prev) => ({ ...prev, [g]: !prev[g] }));

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

        <div className="flex-1 py-1">
          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.group && (
                <div
                  onClick={() => toggleGroup(group.group)}
                  className={`mt-1.5 flex cursor-pointer select-none items-center justify-between px-2.5 pb-0.5 pt-2 text-[10px] uppercase tracking-[2px] text-text3 hover:text-text2 ${
                    collapsed ? "md:hidden" : ""
                  }`}
                >
                  <span>{group.group}</span>
                  {closedGroups[group.group] ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              )}
              {(!closedGroups[group.group] || collapsed) &&
                group.items.map((item) => (
                  <div
                    key={item.key}
                    onClick={() => go(item.key)}
                    title={collapsed ? item.label : undefined}
                    className={`mx-1.5 my-0.5 flex cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-md border-l-2 px-3.5 py-2 text-[12.5px] transition-colors ${
                      page === item.key
                        ? "border-accent bg-accent-dim font-medium text-accent"
                        : "border-transparent text-text2 hover:bg-surface2 hover:text-text"
                    }`}
                  >
                    <item.icon className="h-[17px] w-[17px] shrink-0 stroke-[1.75]" />
                    <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>

        {supabaseConfigured && (
          <div className={`border-t border-border p-2.5 ${collapsed ? "md:flex md:justify-center" : ""}`}>
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-2.5 rounded-md px-3.5 py-2 text-[12.5px] text-text2 hover:bg-surface2 hover:text-text"
            >
              <LogOut className="h-[17px] w-[17px] shrink-0 stroke-[1.75]" />
              <span className={collapsed ? "md:hidden" : ""}>Cerrar sesión</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
}
