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
- **Variables públicas** (las ve el navegador): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_TURNSTILE_SITE_KEY`.
- **Variables secretas** (solo la función del servidor, **nunca** con prefijo `VITE_`): `SUPABASE_SERVICE_ROLE_KEY` y `TURNSTILE_SECRET_KEY`.
- **Opcionales para el aviso de pedido nuevo:**
  - Email: `RESEND_API_KEY` y `NOTIFY_FROM`. El destinatario se carga en el panel, en Configuración → email de aviso.
  - Telegram: `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.

### Cómo se crea un pedido

`POST /api/create-order` (`netlify/functions/create-order.mts` → `server/createOrder.ts`):

1. Valida el token de **Turnstile** con Cloudflare. Sin `TURNSTILE_SECRET_KEY` no acepta pedidos (falla cerrado).
2. Valida la forma del pedido. No acepta precios ni totales del navegador.
3. Llama a `create_order()` con la service key. En una sola transacción: bloquea stock, valida, recalcula precios, envío y total, crea el pedido y descuenta stock.
4. Devuelve el comprobante con lo que quedó guardado.
5. Avisa al dueño por email y/o Telegram. Si el aviso falla, el pedido queda igual.

**Para probar sin cuenta de Cloudflare**, usá sus claves de test: sitio `1x00000000000000000000AA`, secreto `1x0000000000000000000000000000000AA`.

## Estado

| Etapa | |
|---|---|
| 1. Brand board y tokens | ✅ |
| 2. Esquema + seguridad | ✅ `supabase/migrations` |
| 3. Tienda: catálogo, CP, carrito, checkout | ✅ funciona en modo demo |
| 4. Pedido en el servidor (Netlify Function + Turnstile) | ✅ probado contra Postgres real, incluida concurrencia |
| 5. Panel admin | pendiente |
| 6. Capa visual: logo 3D, GSAP, videos | pendiente |
| 7. Auditoría | pendiente |

## Estructura

```
src/
  lib/          lógica pura y testeada: postal, shipping, slots, money, whatsapp
server/         createOrder.ts: lógica de la función de Netlify (testeada)
netlify/        functions/create-order.mts
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
