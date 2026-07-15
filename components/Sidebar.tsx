"use client";

import React, { useState } from "react";
import { NAV } from "@/lib/nav";
import { useRouter } from "@/lib/nav-context";

export function Sidebar() {
  const { page, go, collapsed, setCollapsed } = useRouter();
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (g: string) =>
    setClosedGroups((prev) => ({ ...prev, [g]: !prev[g] }));

  return (
    <nav
      className={`fixed inset-y-0 left-0 z-[100] flex flex-col overflow-y-auto border-r border-border bg-surface transition-[width] duration-200 ${
        collapsed ? "w-[52px]" : "w-[230px]"
      }`}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        title="Colapsar menú"
        className="absolute top-2.5 right-[-14px] z-[101] flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-xs text-text2 hover:bg-surface2 hover:text-text"
      >
        {collapsed ? "▶" : "◀"}
      </button>

      <div className="border-b border-border px-[18px] pb-3.5 pt-5">
        <h1 className={`font-bold tracking-wide text-accent ${collapsed ? "text-sm" : "text-xl"}`}>
          {collapsed ? "R" : "Ricordo"}
        </h1>
        {!collapsed && <span className="mt-0.5 block text-[11px] text-text3">Pasta Artesanal</span>}
      </div>

      <div className="flex-1 py-1">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.group && !collapsed && (
              <div
                onClick={() => toggleGroup(group.group)}
                className="mt-1.5 flex cursor-pointer select-none items-center justify-between px-2.5 pb-0.5 pt-2 text-[10px] uppercase tracking-[2px] text-text3 hover:text-text2"
              >
                <span>{group.group}</span>
                <span className="text-[9px]">{closedGroups[group.group] ? "▸" : "▾"}</span>
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
                  <span className="w-4 shrink-0 text-center text-sm">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </div>
              ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
