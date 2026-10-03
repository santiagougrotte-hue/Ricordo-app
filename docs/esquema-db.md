# Esquema de base de datos — propuesta v1

> **Estado: propuesta para aprobar.** No se creó nada en Supabase todavía.
> SQL completo: [`esquema-propuesto.sql`](./esquema-propuesto.sql) (probado contra Postgres 16 con stubs de `auth`/`storage`).

## Tablas

| Tabla | Para qué | Campos clave (además de los pedidos) |
|---|---|---|
| `products` | Catálogo | `slug` (URL linda), `featured` (destacados del Home), `stock` **en cajas**, `price` en pesos enteros |
| `product_media` | Fotos y videos | `kind` photo/video, `alt` (accesibilidad), **una sola portada por producto** (índice único) |
| `shipping_zones` | Envío por CP | `postal_codes text[]` siempre de 4 dígitos (validado), `free_shipping_from` opcional |
| `orders` | Pedidos | `number` empieza en **1001**, `delivery_method` (envío / retiro en local), `postal_code_raw` (lo que tipeó el cliente), `zone_name` (copia), `stock_returned` |
| `order_items` | Líneas del pedido | copia de `product_name` y `units_per_box`, `unit_price` al momento, `line_total` calculado |
| `admins` | Quién es admin | `user_id` de Supabase Auth |

Montos en **pesos enteros** (sin centavos) para evitar errores de redondeo.

## Lógica en el servidor (RPC)

- **`normalize_postal_code(text)`**: `1884`, `B1884ABC`, `b 1884 abc` y `1884-ABC` dan `1884`. Cualquier otra cosa da `null`.
- **`quote_shipping(cp, subtotal)`**: lo usa el carrito. Devuelve la zona, el costo, cuánto falta para el mínimo y cuánto para el envío gratis. Si el CP no está en ninguna zona devuelve `found = false`, no un error.
- **`create_order(...)`**: todo en una transacción.
  1. Bloquea las filas de producto y valida el stock.
  2. Recalcula precios, envío y total con los datos de la base.
  3. Crea el pedido y sus items.
  4. Descuenta el stock.

  Si falla, no se crea nada y devuelve un código que el front traduce a un mensaje claro:
  - `RC001`: sin stock. Incluye qué producto falló y cuántas cajas quedan.
  - `RC002`: CP fuera de zona.
  - `RC003`: no llega al mínimo. Incluye cuánto falta.
  - `RC004`: datos inválidos.
- **`set_order_status(id, estado)`**: solo para el admin. Al cancelar devuelve el stock **una sola vez**, aunque se cancele dos veces. Un pedido cancelado no se puede reabrir.

## Seguridad (RLS)

- **Clientes (anon):** solo ven los productos, fotos y zonas **activos**. No pueden leer pedidos ni insertarlos directo. El único camino es `create_order()`, que revalida todo.
- **Admin:** acceso total, pero solo si su `user_id` está en `admins`. Estar logueado no alcanza, así nadie que se registre por su cuenta entra al panel. Igual conviene **desactivar los registros** en Supabase Auth.
- **Storage:** el bucket `product-media` es de lectura pública y solo el admin puede subir, editar o borrar.
- **Realtime:** `orders` está en la publicación. Como RLS filtra, solo el admin recibe los pedidos nuevos.

## Lo probé así

| Caso | Resultado |
|---|---|
| Pedido con envío a `B1884ABC`, 2 cajas de $9.800 | Pedido #1001, total $22.100 ($2.500 de envío), stock 5 → 3 |
| Pedido con un producto sin stock | `RC001` dice que hay 1 caja de Ravioles espinaca y pidió 3. **No se creó nada** |
| CP 1900 | `RC002` |
| Subtotal $8.500 con mínimo de $15.000 | `RC003`, faltan $6.500 |
| Anon lee pedidos / inserta pedido / cambia estado | 0 filas / denegado / denegado |
| Admin cancela #1001 dos veces | Stock devuelto una sola vez (3 → 5) |

## Preguntas abiertas

1. **¿El retiro en local tiene compra mínima?** Hoy no tiene mínimo ni costo.
2. **¿El stock se cuenta en cajas?** Así está propuesto.
3. **Tipos de pasta:** ravioles, sorrentinos y cappellacci están fijos en un `enum`. Si van a sumar ñoquis, lasagna, etc., conviene una tabla `pasta_types` editable desde el panel.
4. **Mercado Pago:** para cobrar online hace falta una función en el servidor (Netlify o Supabase Edge) que cree la preferencia y reciba el webhook. Sumaría `payment_status` y `mp_preference_id` a `orders`. ¿Va en esta primera versión o arrancamos con "te mandamos el link por WhatsApp"?
5. **Spam:** cualquiera puede llamar a `create_order` y reservar stock con pedidos falsos. Ya hay un límite de 30 items y 99 cajas por item. ¿Sumamos Cloudflare Turnstile (captcha invisible y gratis) en el checkout?
6. **¿Horario de corte o días de entrega?** Por ejemplo "pedí hasta el jueves y llega el sábado". Si existe, se agrega como campo de la zona o como configuración general.
