-- Salsa de tomate casera ($4.500): tomate, albahaca, ajo, laurel y aceite de oliva.
-- No cuenta como caja (no suma para mínimos, envío gratis ni descuentos). Arranca sin stock: se carga en el panel.
-- Las salsas son un tipo más de producto (antes el tipo solo admitía pastas).
alter table products alter column pasta_type type text using pasta_type::text;
alter table products add constraint products_pasta_type check (pasta_type in ('ravioles', 'sorrentinos', 'cappellacci', 'salsa'));

insert into products (id, slug, name, pasta_type, filling, description, price, stock, low_stock_threshold, featured, active, sort_order, counts_as_box)
values ('00000000-0000-4000-8000-000000000020', 'salsa-de-tomate', 'Salsa de tomate', 'salsa',
        'Tomate, albahaca, ajo, laurel y aceite de oliva',
        'Salsa de tomate casera para acompañar tus pastas.',
        4500, 0, 3, false, true, 20, false)
on conflict (slug) do nothing;

insert into product_media (product_id, url, kind, alt, sort_order, is_cover)
select '00000000-0000-4000-8000-000000000020', v.url, 'photo', v.alt, v.ord, v.cover
from (values
  ('/fotos/salsa-potes.webp', 'Potes de salsa de tomate Ricordo: tomate, albahaca, ajo, laurel y aceite de oliva', 0, true),
  ('/fotos/salsa-casera.webp', 'Salsa de tomate casera, $4.500', 1, false)
) as v(url, alt, ord, cover)
where exists (select 1 from products where id = '00000000-0000-4000-8000-000000000020');
