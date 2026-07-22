export interface NavItem {
  key: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    group: "",
    items: [{ key: "dashboard", label: "Inicio", icon: "◆" }],
  },
  {
    group: "Comercial",
    items: [
      { key: "clientes", label: "Clientes", icon: "◐" },
      { key: "presupuestos", label: "Presupuestos", icon: "▤" },
      { key: "revision-clientes", label: "Revisión de clientes", icon: "↻" },
    ],
  },
  {
    group: "Estudio",
    items: [
      { key: "servicios", label: "Servicios", icon: "✦" },
      { key: "equipo", label: "Equipo", icon: "◎" },
      { key: "costos-fijos", label: "Costos fijos", icon: "▥" },
    ],
  },
  {
    group: "Finanzas",
    items: [
      { key: "finanzas", label: "Finanzas", icon: "▥" },
      { key: "reportes", label: "Reportes", icon: "▲" },
    ],
  },
  {
    group: "",
    items: [{ key: "configuracion", label: "Configuración", icon: "⚙" }],
  },
];

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

export const DEFAULT_PAGE = "dashboard";
