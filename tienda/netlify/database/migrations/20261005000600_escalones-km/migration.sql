-- Envío por escalones de km: se mide la distancia real (por calles) desde el origen hasta la dirección
-- y se cobra según la tabla. Cada zona sigue con su día, mínimo y envío gratis.
-- La fórmula de nafta + peaje queda como alternativa (pricing_mode = 'fuel').
alter table shipping_config add column pricing_mode text not null default 'bands' check (pricing_mode in ('bands', 'fuel'));

create table shipping_bands (
  id        smallint generated always as identity primary key,
  up_to_km  numeric(5,1) check (up_to_km is null or up_to_km > 0),  -- km desde el origen (ida); null = "más lejos"
  price     int not null check (price >= 0)
);
create unique index shipping_bands_km on shipping_bands (up_to_km) where up_to_km is not null;
create unique index shipping_bands_last on shipping_bands ((up_to_km is null)) where up_to_km is null;

-- Valores de ejemplo: se editan en el panel (Zonas → Costo por distancia).
insert into shipping_bands (up_to_km, price) values
  (3, 1500), (6, 2000), (10, 2500), (15, 3500), (25, 4500), (40, 6000), (null, 8000);
