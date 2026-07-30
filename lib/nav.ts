import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  BookOpen,
  Wheat,
  ShoppingBag,
  Store,
  BarChart3,
  Factory,
  Truck,
  Landmark,
  Scale,
  ArrowLeftRight,
  TrendingUp,
  Brain,
  Repeat,
  FileText,
  Home,
  Receipt,
  Building2,
  Target,
  Beef,
  History,
  PieChart,
  Calendar,
  FlaskConical,
  Radio,
  Calculator,
  Rocket,
  Gauge,
  Briefcase,
  Timer,
  Settings,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_RAW: NavGroup[] = [
  {
    group: "",
    items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    group: "Ventas",
    items: [
      { key: "pedidos", label: "Pedidos", icon: ShoppingCart },
      { key: "clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    group: "Catálogo",
    items: [
      { key: "productos", label: "Productos", icon: UtensilsCrossed },
      { key: "recetas", label: "Recetas", icon: BookOpen },
      { key: "insumos", label: "Insumos", icon: Wheat },
      { key: "compras", label: "Compras", icon: ShoppingBag },
      { key: "proveedores", label: "Proveedores", icon: Store },
    ],
  },
  {
    group: "Operaciones",
    items: [
      { key: "stock", label: "Stock", icon: BarChart3 },
      { key: "produccion", label: "Producción", icon: Factory },
      { key: "planificacion-produccion", label: "Planificación", icon: ClipboardList },
      { key: "envios", label: "Envíos", icon: Truck },
    ],
  },
  {
    group: "Finanzas",
    items: [
      { key: "caja", label: "Caja", icon: Landmark },
      { key: "posicion", label: "Posición", icon: Scale },
      { key: "flujo", label: "Flujo", icon: ArrowLeftRight },
      { key: "proyeccion", label: "Proyección", icon: TrendingUp },
      { key: "caja-inteligente", label: "Caja Inteligente", icon: Brain },
      { key: "transferencias", label: "Transferencias", icon: Repeat },
    ],
  },
  {
    group: "Costos",
    items: [
      { key: "eerr", label: "EERR", icon: FileText },
      { key: "costos-fijos", label: "Costos Fijos", icon: Home },
      { key: "costos-indirectos", label: "Costos Indirectos", icon: Receipt },
      { key: "amortizaciones", label: "Amortizaciones", icon: Building2 },
      { key: "punto-equilibrio", label: "Punto de Equilibrio", icon: Target },
      { key: "cmv", label: "CMV", icon: Beef },
      { key: "historial-precios", label: "Historial Precios", icon: History },
    ],
  },
  {
    group: "Análisis",
    items: [
      { key: "an-rentabilidad", label: "Rentabilidad", icon: PieChart },
      { key: "an-productos", label: "Productos", icon: UtensilsCrossed },
      { key: "an-clientes", label: "Clientes", icon: Users },
      { key: "an-anual", label: "Anual", icon: Calendar },
      { key: "simulador", label: "Simulador", icon: FlaskConical },
    ],
  },
  {
    group: "Fin. Avanzado",
    items: [
      { key: "pe-vivo", label: "PE Vivo", icon: Radio },
      { key: "costeo", label: "Costeo", icon: Calculator },
      { key: "roi", label: "ROI", icon: Rocket },
      { key: "elasticidad", label: "Elasticidad", icon: Gauge },
      { key: "cap-trabajo", label: "Cap. de Trabajo", icon: Briefcase },
      { key: "payback", label: "Payback", icon: Timer },
    ],
  },
  {
    group: "",
    items: [{ key: "config", label: "Config", icon: Settings }],
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

export const NAV_GROUPS: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.key, g.group]))
);

export const DEFAULT_PAGE = "dashboard";
