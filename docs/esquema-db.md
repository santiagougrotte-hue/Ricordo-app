# Esquema de base de datos — propuesta v3

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
| Todas las cajas son de 12 | `units_per_box` vale 12 por defecto y la base no acepta otro valor. El panel no lo pide. |
| Gustos fijos | Ravioles, sorrentinos y cappellacci quedan como `enum`. |
| Entregas viernes a la noche y sábado a la mañana | Tabla `delivery_windows`, editable desde el panel. El cliente elige turno en el checkout y el servidor valida que siga abierto. |

## Tablas

| Tabla | Para qué | Campos clave |
|---|---|---|
| `products` | Catálogo | `slug`, `featured` (destacados del Home), `stock` **en cajas**, `low_stock_threshold`, `price` en pesos enteros |
| `product_media` | Fotos y videos | `kind` photo/video, `alt`, **una sola portada por producto** |
| `shipping_zones` | Envío por CP | `postal_codes text[]` de 4 dígitos (validado), `min_order`, `free_shipping_from` opcional |
| `delivery_windows` | Turnos de entrega | día de la semana, horario, `cutoff_hours` (hasta cuántas horas antes se puede pedir), si vale para envío y/o retiro |
| `orders` | Pedidos | `number` desde **1001**, `delivery_method`, `delivery_date` + `delivery_window_label` ("Viernes a la noche 09/10 · 20 a 23 h"), `postal_code_raw`, `zone_name` (copia), `payment_status`, `stock_returned` |
| `order_items` | Líneas | copia de `product_name` y `units_per_box`, `unit_price` al momento, `line_total` calculado |
| `store_settings` | Configuración (una sola fila) | retiro on/off y mínimo, dirección del local, WhatsApp, alias de transferencia, email de aviso (privado), MP on/off |
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
- `RC006`: el turno de entrega ya cerró o no existe. Por ejemplo, si el cliente dejó el checkout abierto y pasó el corte.

## Otras funciones

- **`normalize_postal_code`**: `1884`, `B1884ABC`, `b 1884 abc` y `1884-ABC` dan `1884`.
- **`quote_shipping(cp, subtotal)`**: la cotización del carrito, es pública. Si el CP no está devuelve `found = false`, nunca un error.
- **`available_delivery_slots(método, días)`**: los próximos turnos que siguen abiertos, para elegir en el checkout. Usa la hora de Buenos Aires.
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
| Caja de 48 | Rechazada por la base |
| Turnos el sábado 3/10 a las 19 h | Ofrece vie 9/10 noche, sáb 10/10 mañana, vie 16 y sáb 17 |
| Pedido con turno válido | Guarda "Viernes a la noche 09/10 · 20 a 23 h" |
| Turno en día equivocado / vencido / desactivado | `RC006` en los tres casos |

## Preguntas que siguen abiertas

1. **Horarios exactos de los turnos.** Puse viernes de 20 a 23 h y sábado de 9 a 13 h. ¿Cuáles son los reales?
2. **Hasta cuándo se puede pedir.** Puse hasta 24 h antes de cada turno: para el viernes 20 h, hasta el jueves 20 h. ¿Te sirve o necesitás más tiempo para producir?
3. **Retiro en el local.** ¿Se retira en los mismos turnos o en otros días y horarios?
