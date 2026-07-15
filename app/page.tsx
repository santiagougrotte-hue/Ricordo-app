"use client";

import React from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { useRouter } from "@/lib/nav-context";
import { useStore } from "@/lib/store";
import { PAGES } from "@/components/pages/registry";

export default function Home() {
  const { page, collapsed } = useRouter();
  const { ready } = useStore();

  const PageComponent = PAGES[page];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className={`flex-1 transition-[margin] duration-200 ${collapsed ? "ml-[52px]" : "ml-[230px]"}`}>
        <Header />
        <div className="px-7 py-6">
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
