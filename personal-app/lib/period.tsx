"use client";

import React, { createContext, useContext, useState } from "react";

interface PeriodCtx {
  mes: number;
  anio: number;
  setMes: (m: number) => void;
  setAnio: (a: number) => void;
}

const Ctx = createContext<PeriodCtx | null>(null);

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  return <Ctx.Provider value={{ mes, anio, setMes, setAnio }}>{children}</Ctx.Provider>;
}

export function usePeriod(): PeriodCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePeriod must be used within PeriodProvider");
  return ctx;
}
