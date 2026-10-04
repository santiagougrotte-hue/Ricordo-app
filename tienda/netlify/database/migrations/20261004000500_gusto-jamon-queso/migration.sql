-- Cuarto gusto real: Sorrentinos de jamón y queso.
insert into products (id, slug, name, pasta_type, filling, description, price, stock, low_stock_threshold, featured, active, sort_order) values
  ('00000000-0000-4000-8000-000000000013', 'sorrentinos-jamon-queso', 'Jamón y queso', 'sorrentinos',
   'Jamón cocido, muzzarella y queso sardo',
   'Sorrentinos de jamón cocido, muzzarella y queso sardo. Cada caja trae 12 sorrentinos.',
   11000, 20, 4, true, true, 4);

insert into product_media (product_id, url, kind, alt, sort_order, is_cover) values
  ('00000000-0000-4000-8000-000000000013', '/fotos/jamon-queso-mano.webp', 'photo', 'Sorrentino de jamón y queso en la mano, sobre la bandeja enharinada', 0, true),
  ('00000000-0000-4000-8000-000000000013', '/fotos/jamon-queso-ingredientes.webp', 'photo', 'Lo que lleva: jamón cocido y muzzarella, alrededor de un sorrentino', 1, false);
