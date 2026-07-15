"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={
              "rounded-lg border px-4 py-3 text-[12.5px] font-medium shadow-lg backdrop-blur-sm animate-in " +
              (t.kind === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : t.kind === "error"
                ? "border-red-400/30 bg-red-400/10 text-red-300"
                : "border-sky-400/30 bg-sky-400/10 text-sky-300")
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
