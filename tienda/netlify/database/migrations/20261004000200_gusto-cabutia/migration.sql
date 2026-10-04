-- Primer gusto real: Sorrentinos de cabutia, masa nero.
-- Los productos de ejemplo quedan ocultos (no se borran: sirven de modelo en el panel).
update products set active = false, featured = false where id in (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005');

insert into products (id, slug, name, pasta_type, filling, description, price, stock, low_stock_threshold, featured, active, sort_order) values
  ('00000000-0000-4000-8000-000000000010', 'sorrentinos-cabutia', 'Cabutia', 'sorrentinos',
   'Cabutia asada, ajo asado, muzzarella, sardo y almendras picadas',
   'Nueva masa nero: negra por fuera, naranja por dentro. Cada caja trae 12 sorrentinos.',
   11500, 20, 4, true, true, 1);

-- Fotos y video servidos como archivos estáticos del sitio (/fotos/...). Las que se suban desde el panel van a Netlify Blobs.
insert into product_media (product_id, url, kind, alt, sort_order, is_cover) values
  ('00000000-0000-4000-8000-000000000010', '/fotos/cabutia-mano.webp', 'photo', 'Sorrentino de masa nero en la mano, sobre la bandeja enharinada', 0, true),
  ('00000000-0000-4000-8000-000000000010', '/fotos/cabutia-corte.webp', 'photo', 'Sorrentino de cabutia cortado al medio, con el relleno naranja a la vista', 1, false),
  ('00000000-0000-4000-8000-000000000010', '/fotos/cabutia-masa-nero.webp', 'photo', 'Sorrentinos de masa nero enharinados sobre la mesada', 2, false),
  ('00000000-0000-4000-8000-000000000010', '/fotos/amasado-masa-nero.mp4', 'video', 'Amasando la masa nero y sorrentinos recién hechos', 3, false);
