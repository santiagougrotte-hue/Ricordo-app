-- Centro de cada localidad (se completa solo, la primera vez que hace falta, con OpenRouteService).
-- Sirve cuando la dirección trae solo el partido: se elige la localidad más cercana dentro de ese partido.
alter table localities add column lat numeric(9,6), add column lng numeric(9,6);
