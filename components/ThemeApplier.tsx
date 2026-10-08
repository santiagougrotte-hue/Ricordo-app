"use client";

// Aplica tema (oscuro/claro/sistema) y color de acento personalizado (Sección 34) al documento —
// nunca toca los colores semánticos (verde/rojo/naranja de éxito/error/atención en globals.css),
// solo el atributo data-theme (ya soportado por :root[data-theme="light"]) y las variables
// --accent/--accent2/--accent-dim.

import { useEffect } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { derivarVariantesAcento } from "@/lib/tema";
import type { Tema } from "@/lib/types-v2";

function esOscuroSegunSistema(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolverEsOscuro(tema: Tema): boolean {
  if (tema === "oscuro") return true;
  if (tema === "claro") return false;
  return esOscuroSegunSistema();
}

export function ThemeApplier() {
  const { data, ready } = useStoreV2();
  const apariencia = data.configuracion.apariencia;

  useEffect(() => {
    if (!ready) return;
    const aplicar = () => {
      document.documentElement.setAttribute("data-theme", resolverEsOscuro(apariencia.tema) ? "dark" : "light");
    };
    aplicar();
    if (apariencia.tema !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [apariencia.tema, ready]);

  useEffect(() => {
    if (!ready) return;
    const variantes = derivarVariantesAcento(apariencia.acento_hex);
    const raiz = document.documentElement.style;
    raiz.setProperty("--accent", variantes.accent);
    raiz.setProperty("--accent2", variantes.accent2);
    raiz.setProperty("--accent-dim", variantes.accentDim);
  }, [apariencia.acento_hex, ready]);

  return null;
}
