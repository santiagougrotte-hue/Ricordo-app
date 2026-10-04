# Auditoría final · Tienda Ricordo (etapa 7)

Fecha: 4/10/2026 · Rama `claude/great-thompson-ttsneq` · Probado sobre el build de producción (`vite preview`) en modo demo, más pruebas de integración del servidor contra Postgres 16 con el esquema real.

## Resumen

| Área | Resultado |
|---|---|
| Rendimiento (Lighthouse mobile) | **96–99** en Home, catálogo y producto (mínimo pedido: 85). CLS ≤ 0,03, TBT ≤ 30 ms |
| Accesibilidad | Lighthouse **100** · axe-core **0 problemas** en 14 pantallas × claro/oscuro · recorrido completo solo con teclado |
| Buenas prácticas / SEO | 100 / 100 |
| Pruebas automáticas | **60** unitarias (CP, envío, turnos, montos, servidor, panel) |
| Integración servidor + base | 8 escenarios, incluida concurrencia: 3 compras simultáneas sobre el mismo stock, sin sobreventa |
| Recorridos E2E (navegador real) | Tienda completa, retiro, bajo mínimo, panel en vivo entre pestañas, 3D, reducir movimiento |

## Crítica de diseño (director de arte)

**Lo que funciona**
- Una sola idea, "la caja", atraviesa todo: etiqueta llenada en lápiz, sello, cinta, troquel y el panel con el mismo lenguaje.
- Jerarquía con saltos grandes: titulares de hasta 184px, la tipografía Gloock hace eco del logo y DM Sans hace legibles precios y formularios.
- Ritmo editorial: se alternan papel y kraft, las fotos se salen de la columna y en el celular se alterna el lado de la foto.
- Movimiento con intención: tres gestos con curvas propias (sellar, apoyar, anotar). El 3D es la única pieza con volumen.
- Nada genérico: sin degradés violetas, sin glass, sin emojis (íconos propios de 1,5px), sin fotos de stock ni ilustraciones. Los placeholders dicen qué foto real va en cada lugar.

**Corregido durante la auditoría**

| Problema | Arreglo |
|---|---|
| La foto del producto quedaba 120px más abajo que el título en escritorio | El `position: relative` pisaba al `sticky` y el `top` desplazaba la foto. Ahora están alineados y el sticky funciona |
| El sticky no acompañaba el scroll (producto y resumen del checkout) | Se quitó un `overflow-x` en `body` que creaba un contenedor de scroll |
| Gráficos de ventas en el celular: nombres cortados | Barras en dos renglones (nombre y valor arriba, barra abajo) |
| El Home no tenía `h1` | El logo del hero es el `h1` (imagen con texto alternativo) |
| Cartel de modo demo fuera de un landmark | Ahora es un `<aside>` |

**Corregido en etapas anteriores** (por las críticas de cada pantalla)
- El sello tapaba datos en la etiqueta.
- Las tarjetas del Home eran todas iguales.
- El checkout tenía el botón deshabilitado sin explicar por qué.
- La confirmación mostraba un instante "pedido vacío".
- El checkout desbordaba en escritorio.
- La tabla de stock era ilegible en el celular.
- Los botones deshabilitados parecían texto.
- El 3D se cortaba en los bordes.

**Para vigilar cuando haya contenido real**
- **Fotos:** con fotos reales el sitio gana muchísimo. Seguir la lista de cada placeholder (cenital, luz de ventana, manos).
- **Letra a mano:** la de Reenie Beanie es provisoria. Si pasás una foto de tu letra o del sello real de las cajas, se vectorizan y reemplazan.
- **Textos de ejemplo:** confirmar "4 a 6 minutos" y "hasta 3 meses".

## Accesibilidad
- **Contraste:** todos los pares de texto cumplen WCAG AA o más, en claro y oscuro (tabla en el brand board).
- **Teclado:**
  - "Saltar al contenido".
  - Foco visible en yema.
  - El carrito y el selector de CP usan `<dialog>` nativo: atrapan el foco, cierran con Esc y devuelven el foco al botón que los abrió.
  - Turnos y pagos son radios nativos que se eligen con flechas.
  - Probado: pedido completo solo con teclado.
- **Lectores de pantalla:**
  - Anuncios `aria-live` al agregar al carrito y al cambiar cantidades.
  - Errores de formulario conectados con `aria-describedby` y foco al primer error.
  - Los gráficos tienen tabla alternativa.
- **Animaciones:** nunca usan `visibility: hidden`. Lo que espera su animación sigue siendo enfocable, y si recibe foco aparece al instante. Bug encontrado y corregido en esta auditoría.
- **Reducir movimiento:** sin 3D, sin Lenis y sin animaciones. El sitio queda completo y estático.
- **Táctil:** objetivos de 44 a 48px. Inputs de 16px (iOS no hace zoom).

## Rendimiento (celular)
- **JS inicial:** ~104 KB comprimido, con React 19 y el router. El checkout, la confirmación y el panel se cargan bajo demanda.
- **Supabase en la tienda:** solo `postgrest-js` (+3 KB). El `supabase-js` completo se carga únicamente en el panel.
- **3D (152 KB):** se carga solo con la primera interacción y en equipos capaces. Dibuja a 30 cuadros por segundo y se pausa fuera de pantalla o en otra pestaña.
- **GSAP + Lenis (54 KB):** se cargan cuando el navegador está libre. Lenis solo con mouse.
- **Estabilidad visual:** fuentes self-hosted (solo latín) con precarga de las dos principales, esqueletos con la forma final y `main` con alto mínimo. CLS ≈ 0.
- **Imágenes:** `loading="lazy"` y `srcset` vía Supabase Storage. En el panel se comprimen a WebP antes de subir. La textura de papel es un WebP de 11 KB.

## Seguridad
- **RLS en todas las tablas:**
  - Los clientes solo leen lo activo.
  - Los pedidos no se leen ni se insertan desde el navegador.
  - El panel exige estar en la tabla `admins`, no alcanza con estar logueado.
- **Pedidos:**
  - Solo los crea la función de Netlify, después de validar Turnstile. Sin el secreto configurado no acepta pedidos.
  - `create_order()` solo la puede ejecutar `service_role`.
  - Precios, envío y total se recalculan en la base. El servidor no reenvía ningún monto que mande el navegador (cubierto por una prueba).
  - Bloqueo de filas en orden fijo: sin deadlocks ni sobreventa (probado con concurrencia).
  - Cancelar devuelve el stock una sola vez.
- **Errores:** los inesperados de la base devuelven un mensaje genérico, sin filtrar detalles internos.
- **Secretos:**
  - No hay claves de servidor con prefijo `VITE_` y no aparecen en el bundle (verificado).
  - No hay `innerHTML` ni `eval`.
  - Todos los `target="_blank"` llevan `rel="noopener"`.
- **CSV:** protegido contra inyección de fórmulas en Excel. Un nombre como `=HYPERLINK(...)` se exporta como texto.
- **Pendiente sugerido:**
  - Límite de pedidos por IP en la función (Turnstile ya frena bots).
  - Si en algún momento hay más de un admin, sumar un registro de quién cambió cada estado.

## Pruebas que corrieron

| Suite | Qué cubre |
|---|---|
| `src/lib/*.test.ts` | Normalización de CP, cotización de envío, mínimo, envío gratis, retiro, turnos (coinciden con la función de la base), formatos |
| `server/createOrder.test.ts` | Turnstile (válido, inválido, sin token, sin secreto), validación, mapeo RC001–RC006, no reenvía precios, avisos que fallan no rompen el pedido |
| `src/admin/util.test.ts` | WhatsApp argentino (con 0, 15, +54 9), día en hora de Buenos Aires, CSV y fórmulas |
| Integración (Postgres 16) | OK, captcha falso, sin stock, CP fuera de zona, bajo mínimo, turno inexistente, retiro, email al dueño, concurrencia |
| E2E (Chromium) | Tienda completa y teclado, panel entre pestañas (aviso, preparar, estados, cancelar con stock devuelto, zonas, producto con foto, ventas, CSV), 3D, reducir movimiento, axe |

## Para salir a producción
1. Crear el proyecto de Supabase, correr la migración y el seed, crear el usuario admin (ver `tienda/README.md`).
2. Crear el sitio de Turnstile en Cloudflare (gratis) y copiar las dos claves.
3. En Netlify: base `tienda`, cargar las variables (públicas `VITE_*` y secretas) y deployar.
4. En el panel: cargar productos reales con fotos, zonas con los CP reales, WhatsApp, alias, email de aviso y horarios de los turnos.
5. Hacer un pedido de prueba de punta a punta y cancelarlo desde el panel.
