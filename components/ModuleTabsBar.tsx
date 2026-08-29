"use client";

import React from "react";
import { Segmented } from "@/components/ds";
import { PAGE_LOCATION, tabDefaultPage } from "@/lib/modules";

/** Fila de pestañas (y subpestañas, si la pestaña activa agrupa más de una
 * página) del módulo al que pertenece la página actual. No se muestra en
 * Inicio ni en Config, que no tienen módulo padre. */
export function ModuleTabsBar({ page, go }: { page: string; go: (key: string) => void }) {
  const loc = PAGE_LOCATION[page];
  if (!loc) return null;
  const { module: mod, tab, subtab } = loc;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      {mod.tabs.length > 1 && (
        <Segmented
          options={mod.tabs.map((t) => ({ value: t.key, label: t.label }))}
          value={tab.key}
          onChange={(key) => {
            const nextTab = mod.tabs.find((t) => t.key === key);
            if (nextTab) go(tabDefaultPage(nextTab));
          }}
        />
      )}
      {tab.subtabs && tab.subtabs.length > 1 && (
        <Segmented
          options={tab.subtabs.map((s) => ({ value: s.key, label: s.label }))}
          value={subtab?.key ?? tab.subtabs[0].key}
          onChange={(key) => {
            const nextSub = tab.subtabs!.find((s) => s.key === key);
            if (nextSub) go(nextSub.page);
          }}
        />
      )}
    </div>
  );
}
