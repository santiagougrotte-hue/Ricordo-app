-- Borra los productos inactivos (ocultos), pedido del dueño.
-- Los que ya tienen pedidos no se pueden borrar sin perder el historial: esos quedan ocultos.
-- Sus fotos y videos se borran solos (product_media → on delete cascade).
delete from products p
where not p.active
  and not exists (select 1 from order_items i where i.product_id = p.id);
