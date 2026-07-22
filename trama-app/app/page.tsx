"use client";

import React from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useRouter } from "@/lib/nav-context";
import { useStore } from "@/lib/store";
import { PAGES } from "@/components/pages/registry";

export default function Home() {
  const { page, collapsed, setMobileOpen } = useRouter();
  const { ready } = useStore();

  const PageComponent = PAGES[page];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={`min-w-0 flex-1 transition-[margin] duration-200 ${collapsed ? "md:ml-[56px]" : "md:ml-[220px]"}`}
      >
        <Header onMenuClick={() => setMobileOpen(true)} />
        <div className="px-4 py-5 sm:px-7 sm:py-6">
          {!ready ? (
            <div className="py-20 text-center text-text3">Cargando…</div>
          ) : PageComponent ? (
            <PageComponent />
          ) : (
            <div className="py-20 text-center text-text3">Módulo no encontrado</div>
          )}
        </div>
      </main>
    </div>
  );
}
