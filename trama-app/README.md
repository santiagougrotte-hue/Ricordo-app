# TRAMA Studio — Gestión financiera

Aplicación de gestión financiera, administrativa y de presupuestos para
TRAMA Studio (redes sociales, producción de contenido, dirección creativa,
estilismo, diseño gráfico, fotografía, video, edición y comunicación de
marcas). Next.js (App Router) + Tailwind CSS, client-side routing por hash.

Es un proyecto **independiente** dentro de este repositorio: tiene su propio
`package.json` y no comparte código con Ricordo Pasta ni con Mi Panel. Se
puede desarrollar y deployar por separado.

Sin configurar nada, corre en **modo local**: los datos viven en el
`localStorage` del navegador, sin login. Configurando Supabase (abajo) pasa a
**modo compartido**: login con usuario/contraseña y los mismos datos en
cualquier dispositivo (celu, compu), sincronizados en tiempo real.

## Desarrollo local

```bash
cd trama-app
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000). Andá a **Configuración
→ Datos de prueba → Cargar datos de ejemplo** para probar la app con
clientes, equipo, servicios, presupuestos y movimientos ficticios (se pueden
borrar en cualquier momento desde el mismo lugar).

## Poner en producción con datos compartidos (celu + compu)

### 1. Crear el proyecto en Supabase (base de datos, gratis)

1. Entrá a [supabase.com](https://supabase.com) y creá una cuenta (podés usar GitHub).
2. **New project** → elegí un nombre (ej. `trama-studio`), una contraseña de
   base de datos (guardala) y una región. Esperá ~2 minutos a que se cree.
3. Andá a **SQL Editor** → **New query**, pegá el contenido de
   [`supabase/schema.sql`](./supabase/schema.sql) y ejecutalo (`Run`). Esto
   crea la tabla `trama_app_state` (donde vive todo el estudio como un JSON)
   con permisos para que solo un usuario autenticado pueda leer/escribir, y
   habilita el realtime para que un cambio en un dispositivo aparezca solo en
   el otro.
4. Andá a **Authentication → Users → Add user** y creá el usuario con el que
   vas a entrar a la app (tu email + una contraseña). No hace falta pantalla
   de registro: este es el único usuario (podés crear más adelante usuarios
   adicionales para el equipo si querés reproducir los roles de
   administradora / colaboradora — ver "Limitaciones" abajo).
5. Andá a **Project Settings → API** y copiá:
   - **Project URL**
   - **anon public** key (es pública para este uso, no da acceso de admin)

### 2. Deployar en Vercel

1. Entrá a [vercel.com](https://vercel.com) y creá una cuenta con GitHub.
2. **Add New… → Project** → importá este repo, y en **Root Directory**
   elegí `trama-app` (así Vercel deploya solo esta app).
3. Antes de deployar, en **Environment Variables** agregá:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL del paso anterior
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la anon key del paso anterior
4. **Deploy**. Vercel te da una URL — esa es la que abrís desde el celu y la
   compu, con el mismo login.
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

## Módulos incluidos (primera versión)

1. **Dashboard** — facturación, cobrado, pendiente, gastos, sueldos, ganancia
   bruta/neta, margen, sueldo de la directora, disponible para reinversión,
   clientes activos, presupuestos por estado, próximos vencimientos,
   comparación con el mes anterior y gráficos simples.
2. **Clientes** — ficha completa (contacto, redes, estado, abono, equipo
   asignado), historial de presupuestos y pagos, rentabilidad por cliente.
3. **Presupuestos** — creador paso a paso (preguntas sobre la marca, redes,
   piezas, producción, equipo) que genera automáticamente ítems y costos a
   partir del catálogo de Servicios; calcula costo interno, precio mínimo,
   sugerido y premium con su margen; todo es editable antes de cerrar el
   presupuesto. Incluye distribución del monto aprobado (fijo/porcentaje,
   con aviso si excede o si queda dinero sin asignar), documento cliente
   (sin costos internos ni márgenes) y exportación a PDF vía impresión del
   navegador.
4. **Servicios y precios base** — catálogo editable con precio, unidad de
   cobro, costo interno, responsable, margen mínimo y complejidad.
5. **Equipo y colaboradoras** — ficha de cada persona (contratación, sueldo
   fijo o por hora/jornada/pieza/proyecto, clientes asignados) con cálculo
   automático de lo cobrado/pendiente cada mes.
6. **Finanzas** — todos los movimientos (ingresos y gastos) con filtros por
   mes, cliente, persona, tipo y estado.
7. **Reportes** — cliente y servicio más/menos rentable, márgenes, punto de
   equilibrio, facturación necesaria para cubrir costos o alcanzar una
   ganancia objetivo, y alertas (margen bajo, pagos vencidos, clientes no
   rentables, servicios por debajo de su costo).
8. **Configuración** — moneda (ARS/USD con tipo de cambio manual por
   movimiento o presupuesto), impuestos, márgenes, fondo para imprevistos,
   reinversión, sueldo de la directora, categorías de gastos, datos
   bancarios/fiscales y datos de ejemplo.

### Fuera de esta primera versión

Proyectos como entidad propia (hoy los movimientos se pueden etiquetar con un
`proyectoId` libre), simulador financiero de escenarios, usuarios/permisos
por rol (hoy la app es de un solo usuario/dispositivo compartido), y subida
de logo/identidad visual. Quedan documentados en el pedido original para una
segunda etapa.

## Estructura

- `lib/types.ts` — esquema canónico de `trama_app_data` (clientes, servicios,
  equipo, presupuestos, movimientos, configuración).
- `lib/store.tsx` — estado global: local-first (`localStorage`) con
  sincronización a Supabase (una fila JSONB + realtime) cuando está configurado.
- `lib/auth-context.tsx` / `components/Login.tsx` — login con Supabase Auth,
  solo activo si Supabase está configurado.
- `lib/calc.ts` — fórmulas financieras compartidas: pricing de presupuestos
  (costo interno → precio mínimo/sugerido/premium con margen sobre precio),
  distribución, resumen mensual, rentabilidad por cliente, punto de
  equilibrio, alertas.
- `lib/print.ts` — genera el documento de presupuesto para el cliente y
  dispara la impresión/PDF del navegador.
- `lib/seed.ts` — datos de ejemplo (nombres ficticios).
- `lib/nav.ts` / `lib/nav-context.tsx` — navegación y ruteo client-side.
- `components/ui.tsx` — sistema de diseño editorial/minimalista (cards,
  tablas, badges, formularios, pasos del wizard).
- `components/pages/*` — un módulo por página.
- `supabase/schema.sql` — migración a correr una sola vez en el SQL Editor de Supabase.
- `app/manifest.ts`, `public/sw.js`, `components/PwaRegister.tsx` — soporte PWA.

## Build

```bash
npm run build
npm run lint
```
