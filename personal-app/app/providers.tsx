"use client";

import React from "react";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
import { PeriodProvider } from "@/lib/period";
import { RouterProvider } from "@/lib/nav-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { supabaseConfigured } from "@/lib/supabase";
import { Login } from "@/components/Login";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();

  if (supabaseConfigured && !ready) {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-text3">Cargando…</div>;
  }
  if (supabaseConfigured && !session) {
    return <Login />;
  }

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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
