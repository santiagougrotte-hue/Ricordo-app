// Arquitectura de navegación: 6 módulos visibles (+ Inicio y Config aparte),
// cada uno con pestañas internas y, cuando hace falta agrupar varias páginas
// viejas bajo una sola pestaña, subpestañas. Esto no mueve ni renombra
// ninguna página existente — solo cambia cómo se llega a ellas, así que
// components/pages/registry.tsx y cada página siguen intactas.
//
// Un "page key" es el identificador de siempre (el mismo que usaba lib/nav.ts
// y que sigue viviendo en el hash de la URL, ver lib/nav-context.tsx).
//
// Pedidos / Productos / Producción / Insumos / Compras / Finanzas: separa lo
// que antes vivía junto bajo "Ventas" (pedidos + clientes + análisis) y bajo
// "Productos y Producción" (catálogo + producción) y bajo "Compras y Stock"
// (insumos + compras + proveedores), porque son flujos de trabajo distintos
// aunque compartan datos.

import {
  ShoppingCart,
  UtensilsCrossed,
  Factory,
  Package,
  ShoppingBag,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export const DASHBOARD_PAGE = "dashboard";
export const CONFIG_PAGE = "config";

export interface LeafTab {
  key: string;
  label: string;
  page: string;
}

export interface ModuleTab {
  key: string;
  label: string;
  /** Página que abre esta pestaña cuando no tiene subpestañas. */
  page?: string;
  /** Cuando una pestaña agrupa más de una página vieja. La primera es la que abre por defecto. */
  subtabs?: LeafTab[];
}

export interface ModuleDef {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Variable CSS (ver app/globals.css) usada al 13%/27%/sólido, igual que ModuleRail. */
  color: string;
  tabs: ModuleTab[];
}

export const MODULES: ModuleDef[] = [
  {
    key: "pedidos",
    label: "Pedidos",
    icon: ShoppingCart,
    color: "var(--mod6-pedidos)",
    tabs: [
      {
        key: "pedidos",
        label: "Pedidos",
        subtabs: [
          { key: "pedidos", label: "Pedidos", page: "pedidos" },
          { key: "cuentas-por-cobrar", label: "Por cobrar", page: "cuentas-por-cobrar" },
          { key: "envios", label: "Envíos", page: "envios" },
        ],
      },
      {
        key: "clientes",
        label: "Clientes",
        subtabs: [
          { key: "clientes", label: "Clientes", page: "clientes" },
          { key: "an-clientes", label: "Análisis", page: "an-clientes" },
        ],
      },
    ],
  },
  {
    key: "productos",
    label: "Productos",
    icon: UtensilsCrossed,
    color: "var(--mod6-productos)",
    tabs: [
      {
        key: "productos",
        label: "Productos",
        subtabs: [
          { key: "productos", label: "Productos", page: "productos" },
          { key: "familias", label: "Familias", page: "familias" },
        ],
      },
      {
        key: "recetas-costos",
        label: "Recetas y Costos",
        subtabs: [
          { key: "recetas", label: "Recetas", page: "recetas" },
          { key: "subrecetas", label: "Subrecetas", page: "subrecetas" },
          { key: "costeo", label: "Costeo", page: "costeo" },
          { key: "simulador", label: "Simulador", page: "simulador" },
          { key: "informe-control", label: "Informe de Control", page: "informe-control" },
        ],
      },
      {
        key: "metricas",
        label: "Métricas",
        subtabs: [
          { key: "an-productos", label: "Por producto", page: "an-productos" },
          { key: "an-anual", label: "Anual", page: "an-anual" },
        ],
      },
    ],
  },
  {
    key: "produccion",
    label: "Producción",
    icon: Factory,
    color: "var(--mod6-produccion)",
    tabs: [
      { key: "produccion", label: "Producción", page: "produccion" },
      { key: "planificacion", label: "Planificación", page: "planificacion-produccion" },
    ],
  },
  {
    key: "insumos",
    label: "Insumos",
    icon: Package,
    color: "var(--mod6-insumos)",
    tabs: [
      { key: "insumos", label: "Insumos", page: "insumos" },
      { key: "stock", label: "Stock", page: "stock" },
      { key: "historial-precios", label: "Historial de Precios", page: "historial-precios" },
    ],
  },
  {
    key: "compras",
    label: "Compras",
    icon: ShoppingBag,
    color: "var(--mod6-compras)",
    tabs: [
      { key: "compras", label: "Compras", page: "compras" },
      { key: "proveedores", label: "Proveedores", page: "proveedores" },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: Landmark,
    color: "var(--mod6-finanzas)",
    tabs: [
      {
        key: "resumen",
        label: "Resumen",
        subtabs: [
          { key: "eerr", label: "EERR", page: "eerr" },
          { key: "punto-equilibrio", label: "Punto de Equilibrio", page: "punto-equilibrio" },
          { key: "pe-vivo", label: "PE Vivo", page: "pe-vivo" },
          { key: "cmv", label: "CMV", page: "cmv" },
          { key: "an-rentabilidad", label: "Rentabilidad", page: "an-rentabilidad" },
        ],
      },
      {
        key: "movimientos",
        label: "Movimientos",
        subtabs: [
          { key: "caja", label: "Caja", page: "caja" },
          { key: "transferencias", label: "Transferencias", page: "transferencias" },
          { key: "posicion", label: "Posición", page: "posicion" },
          { key: "flujo", label: "Flujo", page: "flujo" },
          { key: "proyeccion", label: "Proyección", page: "proyeccion" },
          { key: "caja-inteligente", label: "Distribución de fondos", page: "caja-inteligente" },
        ],
      },
      {
        key: "costos",
        label: "Costos",
        subtabs: [
          { key: "costos-fijos", label: "Costos Fijos", page: "costos-fijos" },
          { key: "costos-indirectos", label: "Costos Indirectos", page: "costos-indirectos" },
        ],
      },
      {
        key: "activos",
        label: "Activos",
        subtabs: [
          { key: "amortizaciones", label: "Amortizaciones", page: "amortizaciones" },
          { key: "roi", label: "ROI", page: "roi" },
          { key: "payback", label: "Payback", page: "payback" },
          { key: "cap-trabajo", label: "Capital de Trabajo", page: "cap-trabajo" },
          { key: "elasticidad", label: "Elasticidad", page: "elasticidad" },
        ],
      },
    ],
  },
];

/** Etiquetas de página "de siempre" — usadas en el breadcrumb del Header y como
 * fallback del título en Placeholder. Independientes de las labels de tab/subtab
 * (que están redactadas para el contexto de su módulo, ej. "Análisis" en vez de
 * repetir "Clientes" dentro de la pestaña Clientes). */
export const PAGE_LABELS: Record<string, string> = {
  dashboard: "Inicio",
  pedidos: "Pedidos",
  clientes: "Clientes",
  productos: "Productos",
  recetas: "Recetas",
  subrecetas: "Subrecetas",
  insumos: "Insumos",
  compras: "Compras",
  proveedores: "Proveedores",
  "informe-control": "Informe de Control",
  "cuentas-por-cobrar": "Cuentas por Cobrar",
  familias: "Familias",
  stock: "Stock",
  produccion: "Producción",
  "planificacion-produccion": "Planificación",
  envios: "Envíos",
  caja: "Caja",
  posicion: "Posición",
  flujo: "Flujo",
  proyeccion: "Proyección",
  "caja-inteligente": "Distribución de fondos",
  transferencias: "Transferencias",
  eerr: "EERR",
  "costos-fijos": "Costos Fijos",
  "costos-indirectos": "Costos Indirectos",
  amortizaciones: "Amortizaciones",
  "punto-equilibrio": "Punto de Equilibrio",
  cmv: "CMV",
  "historial-precios": "Historial de Precios",
  "an-rentabilidad": "Rentabilidad",
  "an-productos": "Análisis de Productos",
  "an-clientes": "Análisis de Clientes",
  "an-anual": "Análisis Anual",
  simulador: "Simulador",
  "pe-vivo": "PE Vivo",
  costeo: "Costeo",
  roi: "ROI",
  elasticidad: "Elasticidad",
  "cap-trabajo": "Capital de Trabajo",
  payback: "Payback",
  config: "Config",
};

export function tabDefaultPage(tab: ModuleTab): string {
  return tab.page ?? tab.subtabs![0].page;
}

export function moduleDefaultPage(mod: ModuleDef): string {
  return tabDefaultPage(mod.tabs[0]);
}

export interface PageLocation {
  module: ModuleDef;
  tab: ModuleTab;
  subtab?: LeafTab;
}

/** page key -> dónde vive dentro de un módulo (o undefined para Inicio/Config). */
export const PAGE_LOCATION: Record<string, PageLocation> = {};
for (const mod of MODULES) {
  for (const tab of mod.tabs) {
    if (tab.subtabs) {
      for (const sub of tab.subtabs) {
        PAGE_LOCATION[sub.page] = { module: mod, tab, subtab: sub };
      }
    } else if (tab.page) {
      PAGE_LOCATION[tab.page] = { module: mod, tab };
    }
  }
}

/** page key -> nombre del módulo, para el breadcrumb del Header (reemplaza al viejo NAV_GROUPS). */
export const PAGE_MODULE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(PAGE_LOCATION).map(([page, loc]) => [page, loc.module.label])
);

/** Todos los page keys válidos — Inicio y Config incluidos — para sembrar el registro
 * de páginas y para validar el hash de la URL. */
export const ALL_PAGE_KEYS: string[] = [
  DASHBOARD_PAGE,
  ...Object.keys(PAGE_LOCATION),
  CONFIG_PAGE,
];
