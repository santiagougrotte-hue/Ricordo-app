"use client";

import React from "react";
import { NAV } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";
import { useAuth } from "@/lib/auth-context";
import { supabaseConfigured } from "@/lib/supabase";

export function Sidebar() {
  const { page, go, collapsed, setCollapsed, mobileOpen, setMobileOpen } = useRouter();
  const { signOut } = useAuth();

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-[99] bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <nav
        className={`fixed inset-y-0 left-0 z-[100] flex w-[220px] flex-col overflow-y-auto border-r border-border bg-surface transition-transform duration-200 md:transition-[width] ${
          collapsed ? "md:w-[56px]" : "md:w-[220px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          title="Colapsar menú"
          className="absolute top-2.5 right-[-14px] z-[101] hidden h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-xs text-text2 hover:bg-surface2 hover:text-text md:flex"
        >
          {collapsed ? "›" : "‹"}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-xs text-text2 md:hidden"
        >
          ✕
        </button>

        <div className="border-b border-border px-[18px] pb-4 pt-6">
          <h1 className={`font-display font-semibold tracking-[0.5px] text-text ${collapsed ? "md:text-sm" : "text-lg"}`}>
            <span className="md:hidden">TRAMA Studio</span>
            <span className="hidden md:inline">{collapsed ? "T" : "TRAMA Studio"}</span>
          </h1>
          <span className={`mt-0.5 block text-[10.5px] tracking-wide text-text3 ${collapsed ? "md:hidden" : ""}`}>
            Gestión financiera
          </span>
        </div>

        <div className="flex-1 py-1">
          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.group && (
                <div
                  className={`mt-2 px-3 pb-0.5 pt-2.5 text-[10px] uppercase tracking-[2px] text-text3 ${
                    collapsed ? "md:hidden" : ""
                  }`}
                >
                  {group.group}
                </div>
              )}
              {group.items.map((item) => (
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
                  <span className="w-4 shrink-0 text-center text-sm">{item.icon}</span>
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
              <span className="w-4 shrink-0 text-center text-sm">⏻</span>
              <span className={collapsed ? "md:hidden" : ""}>Cerrar sesión</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
}
