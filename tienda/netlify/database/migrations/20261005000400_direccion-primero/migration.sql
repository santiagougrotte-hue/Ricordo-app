-- El cliente escribe su dirección: las sugerencias ya traen la ubicación, así que se guarda el punto
-- y los km se calculan recién cuando la elige (km_round_trip null = falta medir la ruta).
alter table geo_cache alter column km_round_trip drop not null;
