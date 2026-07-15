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
    items: [{ key: "dashboard", label: "Inicio", icon: "🏠" }],
  },
  {
    group: "Calendario",
    items: [{ key: "calendario", label: "Calendario", icon: "📅" }],
  },
  {
    group: "Finanzas",
    items: [
      { key: "finanzas", label: "Resumen", icon: "📊" },
      { key: "ingresos", label: "Ingresos", icon: "💰" },
      { key: "egresos", label: "Egresos", icon: "💸" },
      { key: "historial", label: "Historial", icon: "🧾" },
    ],
  },
];

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

export const DEFAULT_PAGE = "dashboard";
