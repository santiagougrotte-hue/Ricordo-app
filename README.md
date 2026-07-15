# Ricordo Pasta — Sistema de Gestión

Aplicación de gestión artesanal para un negocio de pastas: ventas, catálogo,
producción, stock, finanzas, costos y análisis. Next.js (App Router) +
Tailwind CSS, client-side routing por hash y persistencia en `localStorage`.

## Desarrollo

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Al primer ingreso, si no
hay datos guardados en `localStorage`, la app carga como semilla el backup
real en `lib/data/backup-seed.json` (mapeado por `lib/seed.ts`).

## Estructura

- `lib/types.ts` — esquema canónico de `ricordo_data`.
- `lib/store.tsx` — contexto + persistencia en `localStorage`.
- `lib/calc.ts` — funciones de cálculo compartidas (`calcCosto`, `pvr`,
  `calcStockIngrediente`, `inPeriod`, `fARS`, EERR, punto de equilibrio, CMV…).
- `lib/nav.ts` / `lib/nav-context.tsx` — navegación y ruteo client-side.
- `components/ui.tsx` — sistema de diseño (cards, tablas, badges, formularios).
- `components/pages/*` — un módulo por página (35 en total, agrupados en
  Dashboard, Ventas, Catálogo, Operaciones, Finanzas, Costos, Análisis,
  Fin. Avanzado y Config).

## Build

```bash
npm run build
npm run lint
```
