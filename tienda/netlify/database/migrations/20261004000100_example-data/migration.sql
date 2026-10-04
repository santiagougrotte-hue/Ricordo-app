-- Datos de ejemplo para probar todo: 5 productos y 3 zonas (los mismos que el modo demo).
-- Precios, rellenos, CPs y alias son ILUSTRATIVOS: reemplazalos desde el panel.
insert into products (id, slug, name, pasta_type, filling, description, price, stock, featured, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'sorrentinos-jamon-muzza-nuez', 'Jamón, muzza y nuez', 'sorrentinos', 'Jamón cocido, muzzarella y nuez',
   'Los más pedidos. Masa fina de arroz y mandioca, relleno cremoso con nuez picada a cuchillo.', 9800, 14, true, 1),
  ('00000000-0000-4000-8000-000000000002', 'ravioles-ricota-espinaca', 'Ricota y espinaca', 'ravioles', 'Ricota, espinaca y parmesano',
   'El clásico de los domingos. Ricota bien escurrida, espinaca salteada y un toque de nuez moscada.', 8500, 2, true, 2),
  ('00000000-0000-4000-8000-000000000003', 'cappellacci-zapallo', 'Zapallo y nuez moscada', 'cappellacci', 'Zapallo asado, queso y nuez moscada',
   'Zapallo asado al horno hasta que se carameliza. Van perfectos con manteca y salvia.', 10200, 9, true, 3),
  ('00000000-0000-4000-8000-000000000004', 'sorrentinos-calabaza-queso-azul', 'Calabaza y queso azul', 'sorrentinos', 'Calabaza, queso azul y cebolla caramelizada',
   'Para los que se animan: dulce de la calabaza, fuerte del azul.', 10500, 0, false, 4),
  ('00000000-0000-4000-8000-000000000005', 'ravioles-verdura-pollo', 'Verdura y pollo', 'ravioles', 'Pollo, acelga y queso',
   'Suaves, para toda la familia. Pollo desmenuzado a mano con acelga.', 8900, 20, false, 5);

insert into shipping_zones (name, postal_codes, shipping_cost, min_order, free_shipping_from, sort_order) values
  ('Berazategui',       '{1884,1885,1886}',           1500, 15000, 30000, 1),
  ('Quilmes y Bernal',  '{1876,1878,1879,1881,1882}', 2500, 20000, 40000, 2),
  ('Florencio Varela',  '{1888,1889,1891}',           3000, 20000, null,  3);

update store_settings set
  pickup_address = 'Berazategui (te pasamos la dirección por WhatsApp)',
  whatsapp_phone = '5491100000000',
  transfer_info  = 'Alias: RICORDO.PASTAS (dato de ejemplo)';
