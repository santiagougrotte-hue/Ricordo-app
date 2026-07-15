export interface NavItem {
  key: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_RAW: NavGroup[] = [
  {
    group: "",
    items: [{ key: "dashboard", label: "Dashboard", icon: "📊" }],
  },
  {
    group: "Ventas",
    items: [
      { key: "pedidos", label: "Pedidos", icon: "📦" },
      { key: "clientes", label: "Clientes", icon: "👥" },
    ],
  },
  {
    group: "Catálogo",
    items: [
      { key: "productos", label: "Productos", icon: "🍝" },
      { key: "recetas", label: "Recetas", icon: "📖" },
      { key: "insumos", label: "Insumos", icon: "🌾" },
      { key: "compras", label: "Compras", icon: "🛒" },
      { key: "proveedores", label: "Proveedores", icon: "🏪" },
    ],
  },
  {
    group: "Operaciones",
    items: [
      { key: "stock", label: "Stock", icon: "📈" },
      { key: "produccion", label: "Producción", icon: "🏭" },
      { key: "envios", label: "Envíos", icon: "🚚" },
    ],
  },
  {
    group: "Finanzas",
    items: [
      { key: "caja", label: "Caja", icon: "🏦" },
      { key: "posicion", label: "Posición", icon: "⚖️" },
      { key: "flujo", label: "Flujo", icon: "💵" },
      { key: "proyeccion", label: "Proyección", icon: "🔮" },
      { key: "caja-inteligente", label: "Caja Inteligente", icon: "🧠" },
      { key: "transferencias", label: "Transferencias", icon: "🔁" },
    ],
  },
  {
    group: "Costos",
    items: [
      { key: "eerr", label: "EERR", icon: "📋" },
      { key: "costos-fijos", label: "Costos Fijos", icon: "🏠" },
      { key: "costos-indirectos", label: "Costos Indirectos", icon: "🧾" },
      { key: "amortizaciones", label: "Amortizaciones", icon: "🏗️" },
      { key: "punto-equilibrio", label: "Punto de Equilibrio", icon: "⚙️" },
      { key: "cmv", label: "CMV", icon: "🥩" },
      { key: "historial-precios", label: "Historial Precios", icon: "📉" },
    ],
  },
  {
    group: "Análisis",
    items: [
      { key: "an-rentabilidad", label: "Rentabilidad", icon: "💹" },
      { key: "an-productos", label: "Productos", icon: "🍝" },
      { key: "an-clientes", label: "Clientes", icon: "👥" },
      { key: "an-anual", label: "Anual", icon: "📆" },
      { key: "simulador", label: "Simulador", icon: "🧮" },
    ],
  },
  {
    group: "Fin. Avanzado",
    items: [
      { key: "pe-vivo", label: "PE Vivo", icon: "📡" },
      { key: "costeo", label: "Costeo", icon: "🧮" },
      { key: "roi", label: "ROI", icon: "🚀" },
      { key: "elasticidad", label: "Elasticidad", icon: "🎯" },
      { key: "cap-trabajo", label: "Cap. de Trabajo", icon: "💼" },
      { key: "payback", label: "Payback", icon: "⏱️" },
    ],
  },
  {
    group: "",
    items: [{ key: "config", label: "Config", icon: "⚙️" }],
  },
];

// Items within each named group are sorted alphanumerically (es locale) for
// easier scanning; the two ungrouped single-item sections (Dashboard, Config)
// and the group order itself follow the business workflow and stay as authored.
export const NAV: NavGroup[] = NAV_RAW.map((g) => ({
  ...g,
  items: g.group ? [...g.items].sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true })) : g.items,
}));

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

export const DEFAULT_PAGE = "dashboard";
