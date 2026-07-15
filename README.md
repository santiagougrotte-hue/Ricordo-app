# Ricordo Pasta — Sistema de Gestión

Aplicación de gestión artesanal para un negocio de pastas: ventas, catálogo,
producción, stock, finanzas, costos y análisis. Next.js (App Router) +
Tailwind CSS, client-side routing por hash.

Sin configurar nada, corre en **modo local**: los datos viven en el
`localStorage` del navegador, sin login. Configurando Supabase (abajo) pasa a
**modo compartido**: login con usuario/contraseña y los mismos datos en
cualquier dispositivo (celu, compu), sincronizados en tiempo real.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Sin Supabase configurado,
si no hay datos en `localStorage` la app carga como semilla el backup real en
`lib/data/backup-seed.json` (mapeado por `lib/seed.ts`).

## Poner en producción con datos compartidos (celu + compu)

### 1. Crear el proyecto en Supabase (base de datos, gratis)

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta (podés usar GitHub).
2. **New project** → elegí un nombre (ej. `ricordo-pasta`), una contraseña de
   base de datos (guardala) y una región. Esperá ~2 minutos a que se cree.
3. Andá a **SQL Editor** → **New query**, pegá el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql) y ejecutalo (`Run`). Esto
   crea la tabla `app_state` (donde vive todo el negocio como un JSON) con
   permisos para que solo un usuario autenticado pueda leer/escribir, y
   habilita el realtime para que un cambio en un dispositivo aparezca solo en
   el otro.
4. Andá a **Authentication → Users → Add user** y creá el usuario con el que
   vas a entrar a la app (tu email + una contraseña). No hace falta pantalla
   de registro: este es el único usuario.
5. Andá a **Project Settings → API** y copiá:
   - **Project URL**
   - **anon public** key (es pública para este uso, no da acceso de admin)

### 2. Deployar en Vercel

1. Entrá a [vercel.com](https://vercel.com) y creá una cuenta con GitHub.
2. **Add New… → Project** → importá el repo `santiagougrotte-hue/Ricordo-app`
   (con la rama que tenga los últimos cambios).
3. Antes de deployar, en **Environment Variables** agregá:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL del paso anterior
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la anon key del paso anterior
4. **Deploy**. Vercel te da una URL (ej. `ricordo-app.vercel.app`) — esa es la
   que abrís desde el celu y la compu, con el mismo login.
5. Cada vez que se pushee a la rama conectada, Vercel redeploya solo.

### Desarrollo local contra Supabase (opcional)

Copiá `.env.example` a `.env.local` y completá las mismas dos variables para
probar el modo compartido en tu máquina antes de deployar.

### 3. Instalarla como app en el celu y la compu

Ya deployada en Vercel, es una PWA instalable (ícono propio, pantalla completa
sin barra del navegador, funciona con conexión intermitente):

- **Android (Chrome)**: abrí la URL → menú (⋮) → **Instalar app** (o el banner
  que aparece solo).
- **iPhone/iPad (Safari)**: abrí la URL → botón compartir (□↑) → **Agregar a
  pantalla de inicio**.
- **Computadora (Chrome/Edge)**: abrí la URL → ícono de instalar (⊕) en la
  barra de direcciones, a la derecha.

## Estructura

- `lib/types.ts` — esquema canónico de `ricordo_data`.
- `lib/store.tsx` — estado global: local-first (`localStorage`) con
  sincronización a Supabase (una fila JSONB + realtime) cuando está configurado.
- `lib/auth-context.tsx` / `components/Login.tsx` — login con Supabase Auth,
  solo activo si Supabase está configurado.
- `lib/calc.ts` — funciones de cálculo compartidas (`calcCosto`, `pvr`,
  `calcStockIngrediente`, `inPeriod`, `fARS`, EERR, punto de equilibrio, CMV…).
- `lib/nav.ts` / `lib/nav-context.tsx` — navegación y ruteo client-side.
- `components/ui.tsx` — sistema de diseño (cards, tablas, badges, formularios).
- `components/pages/*` — un módulo por página (35 en total, agrupados en
  Dashboard, Ventas, Catálogo, Operaciones, Finanzas, Costos, Análisis,
  Fin. Avanzado y Config).
- `supabase/schema.sql` — migración a correr una sola vez en el SQL Editor de Supabase.
- `app/manifest.ts`, `public/sw.js`, `components/PwaRegister.tsx` — soporte PWA
  (instalable en celu/compu, ícono propio, shell disponible offline).

## Build

```bash
npm run build
npm run lint
```
