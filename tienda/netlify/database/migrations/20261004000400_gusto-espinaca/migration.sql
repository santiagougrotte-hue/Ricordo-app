-- Tercer gusto real: Raviolones de espinaca.
insert into products (id, slug, name, pasta_type, filling, description, price, stock, low_stock_threshold, featured, active, sort_order) values
  ('00000000-0000-4000-8000-000000000012', 'raviolones-espinaca', 'Espinaca', 'ravioles',
   'Espinaca, ricotta, sardo, muzzarella, cebolla caramelizada y nueces picadas',
   'Raviolones de espinaca, ricotta, queso sardo, muzzarella, cebolla caramelizada y nueces picadas. Cada caja trae 12 raviolones.',
   13000, 20, 4, true, true, 3);

insert into product_media (product_id, url, kind, alt, sort_order, is_cover) values
  ('00000000-0000-4000-8000-000000000012', '/fotos/espinaca-mano.webp', 'photo', 'Raviolón de espinaca en la mano, sobre la bandeja con el resto de la tanda', 0, true),
  ('00000000-0000-4000-8000-000000000012', '/fotos/espinaca-ingredientes.webp', 'photo', 'Lo que lleva: espinaca, ricotta, sardo, muzzarella y nueces, alrededor de un raviolón', 1, false);
