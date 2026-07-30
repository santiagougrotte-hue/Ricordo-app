# Hallazgos

Bugs o inconsistencias encontrados de paso mientras se trabajaba en otra cosa, sin arreglar (para no mezclar cambios fuera de lo pedido en cada fase). Anotados acá para revisar cuándo se decida.

## Fase 0.1 — PED-021 (mayo 2026) guardado con precio $0 en sus 4 líneas

Al diagnosticar por qué los movimientos de caja de mayo 2026 estaban en $0, se encontró que el pedido **PED-021** (26/05/2026 según el backup legacy, cliente CLI-014, canal "WhatsApp") tiene sus 4 líneas (`PED-021-A/B/C/D`) guardadas con `precio_unitario: 0`, `precio_total: 0` y `precio_neto: 0` desde el dato original — no es un problema de caja, el pedido mismo nunca tuvo precio cargado. Probablemente una carga rápida desde WhatsApp en la app vieja que no pedía precio.

No se corrigió porque no hay forma de saber cuál era el precio real sin preguntarle al dueño del negocio. Si se quiere reparar, lo más simple es abrir el pedido en Pedidos y cargarle el precio a mano por línea — el resto de la cadena (caja, EERR, etc.) lo va a reflejar bien una vez corregido.
