"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_PAGE, NAV_LABELS } from "./nav";

interface RouterCtx {
  page: string;
  go: (key: string) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (o: boolean) => void;
}

const Ctx = createContext<RouterCtx | null>(null);

function pageFromHash(): string {
  if (typeof window === "undefined") return DEFAULT_PAGE;
  const key = window.location.hash.replace("#", "").split("/")[0];
  return key && NAV_LABELS[key] ? key : DEFAULT_PAGE;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Sync from the URL hash post-mount (SSR has no window) — must stay in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(pageFromHash());
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (key: string) => {
    setPage(key);
    if (typeof window !== "undefined") window.location.hash = key;
    setMobileOpen(false);
  };

  return (
    <Ctx.Provider value={{ page, go, collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRouter(): RouterCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}
