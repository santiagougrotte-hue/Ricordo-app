# Esquema de base de datos — propuesta v2

> **Estado: propuesta para aprobar.** No se creó nada en Supabase todavía.
> SQL completo: [`esquema-propuesto.sql`](./esquema-propuesto.sql) (probado contra Postgres 16 con stubs de `auth`/`storage`).

## Decisiones incorporadas en la v2

| Decisión | Cómo quedó |
|---|---|
| Retiro en local sin compra mínima | `store_settings.pickup_min_order = 0`. Se puede cambiar desde el panel sin tocar código. |
| Mercado Pago en la v2, no en la v1 | Checkout solo con transferencia y efectivo. `mercadopago_enabled = false` y `create_order` rechaza MP (`RC005`). Ya están las columnas `payment_status`, `mp_preference_id` y `mp_payment_id` para sumarlo después. |
| Confirmar pagos a mano | Todo pedido entra `new` con `payment_status = pending`. El admin lo marca pagado. |
| Turnstile | El navegador **no** puede crear pedidos. Los crea una función de Netlify que primero valida el token de Turnstile con Cloudflare y después llama a `create_order` con la service key. |
| Alerta de stock bajo | `products.low_stock_threshold` por producto (por defecto 3). |

## Tablas

| Tabla | Para qué | Campos clave |
|---|---|---|
| `products` | Catálogo | `slug`, `featured` (destacados del Home), `stock` **en cajas**, `low_stock_threshold`, `price` en pesos enteros |
| `product_media` | Fotos y videos | `kind` photo/video, `alt`, **una sola portada por producto** |
| `shipping_zones` | Envío por CP | `postal_codes text[]` de 4 dígitos (validado), `min_order`, `free_shipping_from` opcional |
| `orders` | Pedidos | `number` desde **1001**, `delivery_method`, `postal_code_raw`, `zone_name` (copia), `payment_status`, `stock_returned` |
| `order_items` | Líneas | copia de `product_name` y `units_per_box`, `unit_price` al momento, `line_total` calculado |
| `store_settings` | Configuración (una sola fila) | retiro on/off y mínimo, dirección del local, WhatsApp, email de aviso (privado), MP on/off |
| `admins` | Quién es admin | `user_id` de Supabase Auth |

## Cómo se crea un pedido

```
Navegador ── checkout + token Turnstile ──▶ Netlify Function /api/create-order
                                              1. valida el token con Cloudflare (secret en Netlify)
                                              2. llama create_order() con la service key
                                                 └─ en una transacción, en Postgres:
                                                    bloquea stock → valida → recalcula precios,
                                                    envío y total → crea pedido + items → descuenta stock
                                              3. dispara el aviso al dueño (email; Telegram opcional)
Navegador ◀── nº de pedido / error traducido ──┘
```

Si algo falla, no se crea nada y el error trae un código para mostrar un mensaje claro:
- `RC001`: sin stock. Dice qué producto y cuántas cajas quedan.
- `RC002`: CP fuera de zona. Ofrece retiro en el local y WhatsApp.
- `RC003`: no llega al mínimo. Dice cuánto falta.
- `RC004`: datos inválidos.
- `RC005`: método de pago o retiro no disponible.

## Otras funciones

- **`normalize_postal_code`**: `1884`, `B1884ABC`, `b 1884 abc` y `1884-ABC` dan `1884`.
- **`quote_shipping(cp, subtotal)`**: la cotización del carrito, es pública. Si el CP no está devuelve `found = false`, nunca un error.
- **`store_public_settings()`**: datos públicos de la tienda, sin el email de aviso.
- **`set_order_status(id, estado)`**: solo admin. Al cancelar devuelve el stock **una sola vez**. Un pedido cancelado no se reabre.

## Seguridad (RLS)

- **Clientes (anon):** leen solo productos, fotos y zonas **activos**, y los datos públicos de la tienda. No leen pedidos ni pueden crearlos sin pasar por Turnstile.
- **Admin:** acceso total, solo si su `user_id` está en `admins`. Además, **desactivar los registros** en Supabase Auth.
- **Storage:** bucket `product-media` de lectura pública. Solo el admin sube, edita o borra.
- **Realtime:** `orders` está publicado y RLS deja que solo el admin reciba los pedidos nuevos.

## Pruebas (Postgres 16)

| Caso | Resultado |
|---|---|
| Anon llama `create_order` | **Denegado** (solo `service_role`) |
| Anon lee la configuración | Ve los datos públicos. La tabla con el email da 0 filas |
| Pago con Mercado Pago | `RC005`, todavía no disponible |
| Retiro sin mínimo, $8.500 | Pedido #1001, envío $0 |
| Retiro con mínimo de $20.000 configurado | `RC003` |
| Envío a `B1884ABC`, 2 cajas de $9.800, transferencia | #1002, total $22.100, pago `pending` |
| Producto sin stock | `RC001` con el detalle. **No se creó nada** |
| CP 1900 / bajo el mínimo de la zona | `RC002` / `RC003` (faltan $6.500) |
| Admin cancela dos veces | Stock devuelto una sola vez |
| Stock ≤ umbral | `alerta = true` (para el panel) |

## Preguntas que siguen abiertas

1. **¿El stock se cuenta en cajas?** Así está propuesto: "quedan 3 cajas". La otra opción sería contar unidades sueltas, que complica todo.
2. **¿Los tipos de pasta son fijos?** Ravioles, sorrentinos y cappellacci están en un `enum`. Si piensan sumar ñoquis, lasagna u otros, conviene una tabla editable desde el panel. ¿Fijo o editable?
3. **¿Hay días de entrega u horario de corte?** Por ejemplo "pedí hasta el jueves a las 20 y llega el sábado". Si existe, lo agrego a `store_settings` o a cada zona y la tienda lo muestra en el carrito y en la confirmación.
