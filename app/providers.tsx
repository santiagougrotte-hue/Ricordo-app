"use client";

import React from "react";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
import { PeriodProvider } from "@/lib/period";
import { RouterProvider } from "@/lib/nav-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <PeriodProvider>
          <RouterProvider>{children}</RouterProvider>
        </PeriodProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
