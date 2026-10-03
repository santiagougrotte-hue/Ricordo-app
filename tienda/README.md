# Ricordo · Tienda online

Tienda de pastas rellenas sin TACC (Vite + React + TypeScript). Diseño: [`docs/brand-board.html`](../docs/brand-board.html). Tokens: [`styles/tokens.css`](../styles/tokens.css).

## Correr en local

```bash
cd tienda
npm install
npm run dev        # http://localhost:5173
npm test           # lógica de CP, envío, turnos y montos
npm run build      # chequeo de tipos + build de producción
```

Sin variables de entorno corre en **modo demo**, con 5 productos y 3 zonas de ejemplo. Los pedidos se simulan en el navegador con las mismas reglas que la base: stock, mínimo, envío gratis y turnos.

## Conectar Supabase

1. Creá el proyecto en Supabase.
2. En **SQL Editor**, ejecutá `supabase/migrations/20261003000000_schema.sql`. Crea tablas, funciones, RLS, realtime y el bucket `product-media`.
3. Opcional: ejecutá `supabase/seed.sql` para cargar los datos de ejemplo.
4. En **Authentication → Providers → Email**, desactivá los registros (*Allow new users to sign up*). El admin se crea a mano y se agrega a la tabla `admins`. Eso llega en la etapa 5.
5. Copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Deploy en Netlify

- **Base directory:** `tienda`. El resto está en `netlify.toml`: build, publish `dist`, redirects SPA y `/api/*`.
- **Variables:** `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. La etapa 4 suma `SUPABASE_SERVICE_ROLE_KEY` y `TURNSTILE_SECRET_KEY`, que van solo en el servidor.

## Estado

| Etapa | |
|---|---|
| 1. Brand board y tokens | ✅ |
| 2. Esquema + seguridad | ✅ `supabase/migrations` |
| 3. Tienda: catálogo, CP, carrito, checkout | ✅ funciona en modo demo |
| 4. Pedido en el servidor (Netlify Function + Turnstile) | pendiente: en modo Supabase, "Confirmar pedido" todavía no tiene a quién llamar |
| 5. Panel admin | pendiente |
| 6. Capa visual: logo 3D, GSAP, videos | pendiente |
| 7. Auditoría | pendiente |

## Estructura

```
src/
  lib/          lógica pura y testeada: postal, shipping, slots, money, whatsapp
  lib/api/      demo.ts (sin backend) · supabase.ts (postgrest-js, liviano) · seed-data.ts
  state/        carrito, CP y modalidad de entrega
  components/   piezas de "la caja": Logo, Stamp, ProductLabel, Placeholder, Ruler, Sheet…
  pages/        Home, Catalog, ProductPage, Checkout, Confirmation
supabase/       migración + seed
```

## Textos y datos a confirmar

Son de ejemplo y conviene revisarlos antes de publicar:
- **Productos:** precios, rellenos y descripciones.
- **Envío:** códigos postales, costos y mínimos por zona.
- **Configuración:** alias de transferencia y número de WhatsApp.
- **Textos con datos concretos:** "4 a 6 minutos" de cocción y "hasta 3 meses" en el freezer.
