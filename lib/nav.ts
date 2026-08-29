// Compat layer sobre lib/modules.ts: mantiene los mismos exports que usaban
// Header.tsx, Placeholder.tsx y nav-context.tsx cuando la navegación era una
// lista plana de 35+ páginas agrupadas. Ahora el agrupamiento real (módulo →
// tab → subtab) vive en lib/modules.ts; acá solo se deriva lo que el resto de
// la app todavía necesita por nombre de página.
import { CONFIG_PAGE, DASHBOARD_PAGE, PAGE_LABELS, PAGE_MODULE_LABEL } from "./modules";

export const NAV_LABELS: Record<string, string> = PAGE_LABELS;

// Breadcrumb: módulo para las páginas que viven dentro de uno; Inicio y
// Config no tienen módulo padre, así que no llevan breadcrumb.
export const NAV_GROUPS: Record<string, string> = PAGE_MODULE_LABEL;

export const DEFAULT_PAGE = DASHBOARD_PAGE;

export { CONFIG_PAGE };
