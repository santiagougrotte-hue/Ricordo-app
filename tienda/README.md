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

### Versión de un solo archivo

```bash
npm run build:html   # → dist-html/index.html
```

Es la tienda entera en modo demo, panel incluido (`#/admin`, contraseña `ricordo`), en un solo `.html` que se abre con doble clic, sin servidor. Sirve para mostrarla o probarla en el celular. Hay una copia en [`docs/ricordo-tienda-demo.html`](../docs/ricordo-tienda-demo.html).

## Publicar en Netlify (todo en Netlify: web, base de datos y fotos)

No hay que crear ninguna base a mano: **Netlify Database** (Postgres) se crea sola en el primer deploy y aplica las migraciones de `netlify/database/migrations/` (esquema + datos de ejemplo). Las fotos y videos van a **Netlify Blobs**.

1. En app.netlify.com → proyecto **ricordo-pastas** → *Site configuration → Build & deploy → Link repository* → GitHub `santiagougrotte-hue/Ricordo-app`.
   - **Base directory:** `tienda` · **Branch:** la que quieras publicar (por ejemplo `main` después de mergear).
   - El resto lo toma de `netlify.toml`. Cada push publica solo.
2. Variables (*Site configuration → Environment variables*), ya cargadas en ricordo-pastas:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (secreta): acceso al panel `/admin`.
   - `SESSION_SECRET` (secreta): firma la sesión del panel.
   - `VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`: captcha. Hoy están las **claves de prueba** de Cloudflare (siempre pasan). Reemplazalas por las tuyas (gratis en Cloudflare → Turnstile) para tener protección real contra bots.
   - Opcionales: `RESEND_API_KEY` + `NOTIFY_FROM` (email de pedido nuevo), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.
3. Entrá a `/admin` y cargá tus datos reales: productos y fotos, zonas, WhatsApp, alias, email de aviso y turnos.

### Probar el backend en local

```bash
npm run test:db      # pruebas contra un Postgres real (TEST_DATABASE_URL)
DATABASE_URL=postgres://... ADMIN_EMAIL=... ADMIN_PASSWORD=... SESSION_SECRET=... npx tsx server/localServer.mts
```

## Estado

| Etapa | |
|---|---|
| 1. Brand board y tokens | ✅ |
| 2. Esquema + seguridad | ✅ `netlify/database/migrations` (Netlify Database) |
| 3. Tienda: catálogo, CP, carrito, checkout | ✅ funciona en modo demo |
| 4. Pedido en el servidor (Netlify Function + Turnstile) | ✅ probado contra Postgres real: concurrencia, límites por IP |
| 5. Panel admin (`/admin`) | ✅ pedidos (aviso a los ~8 s), ventas, stock, productos con fotos, zonas, turnos, CSV |
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
netlify/        functions/ (catalog, create-order, admin, media) · database/migrations/
server/         lógica de las funciones (testeada contra Postgres real)
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
