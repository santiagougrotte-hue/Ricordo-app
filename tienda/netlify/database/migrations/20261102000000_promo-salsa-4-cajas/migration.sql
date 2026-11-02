-- Promo "¡Aprovechá el descuento!" (hasta el lunes 9/11): la salsa de regalo había quedado en la opción de 1 caja.
-- Queda: desde 1 caja 10 % · desde 4 cajas 10 % + 1 salsa de tomate. Solo toca esa promo (la que termina el 9/11).
update store_settings
set promo_tiers = '[{"minBoxes":1,"pct":10,"gifts":0},{"minBoxes":4,"pct":10,"gifts":1}]',
    promo_gift_product_id = coalesce(promo_gift_product_id,
      (select id from products where id = '00000000-0000-4000-8000-000000000020'))
where promo_ends_at between '2026-11-09 12:00-03' and '2026-11-11 00:00-03';
