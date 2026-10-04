-- Segundo gusto real: Sorrentinos de osobuco.
insert into products (id, slug, name, pasta_type, filling, description, price, stock, low_stock_threshold, featured, active, sort_order) values
  ('00000000-0000-4000-8000-000000000011', 'sorrentinos-osobuco', 'Osobuco', 'sorrentinos',
   'Osobuco braseado 4 horas al vino tinto y vermut, con zanahoria, apio y cebolla',
   'Osobuco braseado durante 4 horas al vino tinto y vermut, con zanahoria, apio y cebolla. Cada caja trae 12 sorrentinos.',
   14000, 20, 4, true, true, 2);

insert into product_media (product_id, url, kind, alt, sort_order, is_cover) values
  ('00000000-0000-4000-8000-000000000011', '/fotos/osobuco-mano.webp', 'photo', 'Sorrentino de osobuco en la mano, sobre la bandeja con el resto de la tanda', 0, true),
  ('00000000-0000-4000-8000-000000000011', '/fotos/osobuco-ingredientes.webp', 'photo', 'Lo que lleva: osobuco, zanahoria, apio, vino tinto, vermut y cebolla, alrededor de un sorrentino', 1, false),
  -- Con más de un gusto, el collage de la cabutia pasa a su galería.
  ('00000000-0000-4000-8000-000000000010', '/fotos/cabutia-ingredientes.webp', 'photo', 'Lo que lleva: cabutia asada, sardo, almendras, muzzarella y ajo asado, alrededor de un sorrentino de masa nero', 4, false);
