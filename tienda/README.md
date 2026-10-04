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

En modo demo, el panel está en `/admin`: cualquier email y la contraseña `ricordo`. Abrilo en una pestaña y comprá en otra: el pedido aparece al instante.

## Panel (`/admin`)

- **Pedidos:**
  - Lista en tiempo real (Supabase Realtime) con filtro por estado y por día de entrega.
  - "Qué preparar": cajas por gusto para cada entrega.
  - Detalle con WhatsApp al cliente, mapa, avance de estado y marcar pagado.
  - Cancelar devuelve el stock.
- **Aviso de pedido nuevo:**
  - Sonido, notificación del navegador ("Activar avisos"), contador en la pestaña y cartel en pantalla.
  - Email y/o Telegram desde el servidor.
- **Ventas:** día, 7 días y mes, con vendido, pedidos, ticket promedio y cajas. Gráficos por día, por gusto y por zona, con tabla accesible.
- **Stock:** edición rápida, umbral de aviso por producto, mostrar u ocultar.
- **Productos:** alta y edición. Las fotos se comprimen a WebP en el navegador antes de subir. Videos MP4/WebM de hasta 25 MB.
- **Zonas:** códigos postales (acepta 1884 o B1884ABC), costo, mínimo y envío gratis, con aviso de CP repetidos.
- **Ajustes:** WhatsApp, alias de transferencia, email de aviso, retiro en el local y turnos de entrega.
- **Exportar:** pedidos y ventas a CSV (se abren bien en Excel en español).

## Conectar Supabase

1. Creá el proyecto en Supabase.
2. En **SQL Editor**, ejecutá `supabase/migrations/20261003000000_schema.sql`. Crea tablas, funciones, RLS, realtime y el bucket `product-media`.
3. Opcional: ejecutá `supabase/seed.sql` para cargar los datos de ejemplo.
4. En **Authentication → Providers → Email**, desactivá los registros (*Allow new users to sign up*).
5. Creá el usuario admin: **Authentication → Users → Add user** (tu email y una contraseña). Después, en **SQL Editor**:
   ```sql
   insert into admins (user_id) select id from auth.users where email = 'tu@email.com';
   ```
   Estar logueado no alcanza: solo los usuarios de la tabla `admins` ven y editan pedidos (RLS).
6. Copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

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
| 5. Panel admin (`/admin`) | ✅ pedidos en tiempo real con aviso, ventas, stock, productos con fotos, zonas, turnos, CSV |
| 6. Capa visual: logo 3D, GSAP + ScrollTrigger, Lenis, videos | ✅ diferida y solo en equipos capaces; Lighthouse mobile 96–99 |
| 7. Auditoría | ✅ ver [`docs/AUDITORIA.md`](../docs/AUDITORIA.md) |

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

## Capa visual (etapa 6)

- **Logo 3D** (`src/motion/logo3d.ts`):
  - three.js extruye el mismo SVG del logo, con luz cálida de cocina, vaivén lento y reacción al mouse, al giroscopio o al dedo. Al scrollear se aleja hacia el catálogo.
  - Se carga recién con la primera interacción, solo con WebGL, 4 GB o más de memoria, 4 núcleos o más y sin ahorro de datos. Dibuja a 30 cuadros por segundo y se pausa fuera de pantalla.
  - El logo 2D queda siempre debajo como respaldo.
  - Para usar un modelo propio: poné `logo.glb` en `public/` y `VITE_LOGO_GLB=/logo.glb`.
- **Movimiento** (`src/motion/motion.ts`):
  - GSAP + ScrollTrigger con tres curvas propias: sellar, apoyar y anotar.
  - Solo anima lo que está debajo del pliegue. Nunca oculta algo que ya se vio.
  - Lo que espera su animación sigue siendo enfocable con teclado.
- **Lenis:** scroll suave solo con mouse. En pantallas táctiles queda el scroll nativo.
- **Videos de producto:** sin sonido, en loop, solo mientras la tarjeta está en pantalla (`preload="none"`).
- **Reducir movimiento:** apaga todo y el sitio queda completo y estático.

## Textos y datos a confirmar

Son de ejemplo y conviene revisarlos antes de publicar:
- **Productos:** precios, rellenos y descripciones.
- **Envío:** códigos postales, costos y mínimos por zona.
- **Configuración:** alias de transferencia y número de WhatsApp.
- **Textos con datos concretos:** "4 a 6 minutos" de cocción y "hasta 3 meses" en el freezer.
