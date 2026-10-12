-- Promociones generales (además del Día de la Madre): una promo a la vez, con su estilo y el texto del cartel de arriba.
--   promo_theme 'madre' = corazones y frases para mamá · 'general' = cartel y sección sin decoración temática.
--   promo_message = texto del cartel (vacío = se arma solo con el % y los regalos).
-- Un % sobre toda la compra es una promo con una sola opción "desde 1 caja".
alter table store_settings
  add column promo_theme text not null default 'madre' check (promo_theme in ('madre', 'general')),
  add column promo_message text not null default '';
