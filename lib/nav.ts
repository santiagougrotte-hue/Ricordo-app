import { LayoutDashboard, ShoppingCart, UtensilsCrossed, Boxes, Factory, Landmark, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

// Menú reducido a 7 módulos (ver plan de refactor): cada uno agrupa, con pestañas internas, lo
// que antes eran varias pantallas sueltas. Sin sub-grupos — a esta escala una lista plana alcanza.
const NAV_RAW: NavGroup[] = [
  {
    group: "",
    items: [
      { key: "inicio", label: "Inicio", icon: LayoutDashboard },
      { key: "ventas", label: "Ventas", icon: ShoppingCart },
      { key: "productos", label: "Productos", icon: UtensilsCrossed },
      { key: "inventario", label: "Inventario", icon: Boxes },
      { key: "operaciones", label: "Operaciones", icon: Factory },
      { key: "finanzas", label: "Finanzas", icon: Landmark },
      { key: "config", label: "Configuración", icon: Settings },
    ],
  },
];

export const NAV: NavGroup[] = NAV_RAW;

export const NAV_LABELS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, i.label]))
);

export const NAV_GROUPS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, g.group]))
);

export const DEFAULT_PAGE = "inicio";
