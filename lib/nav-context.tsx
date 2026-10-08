"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_PAGE, NAV_LABELS } from "./nav";

interface RouterCtx {
  page: string;
  /** Pestaña interna con la que el módulo de destino debería abrir — solo un hint de una sola vez:
   * cada página lo lee como valor inicial de su propio estado de pestaña al montarse (ver
   * Inicio → accesos rápidos), nunca lo vuelve a leer después. */
  tab?: string;
  go: (key: string, tab?: string) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
}

const Ctx = createContext<RouterCtx | null>(null);

function parseHash(): { page: string; tab?: string } {
  if (typeof window === "undefined") return { page: DEFAULT_PAGE };
  const raw = window.location.hash.replace("#", "");
  const [key, tab] = raw.split(":");
  return key && NAV_LABELS[key] ? { page: key, tab } : { page: DEFAULT_PAGE };
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [tab, setTab] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Sync from the URL hash post-mount (SSR has no window) — nested en una función para que el
    // linter no lo trate como un setState "directo" en el cuerpo del efecto.
    function sincronizarDesdeHash() {
      const inicial = parseHash();
      setPage(inicial.page);
      setTab(inicial.tab);
    }
    sincronizarDesdeHash();
    const onHash = () => {
      const actual = parseHash();
      setPage(actual.page);
      setTab(actual.tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (key: string, tabDestino?: string) => {
    setPage(key);
    setTab(tabDestino);
    if (typeof window !== "undefined") window.location.hash = tabDestino ? `${key}:${tabDestino}` : key;
    setMobileOpen(false);
  };

  return (
    <Ctx.Provider value={{ page, tab, go, collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRouter(): RouterCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}
