-- Lasaña de ragú ($18.000): bandeja de 800 g para 2 personas. Cuenta como caja (mínimos, envío gratis y promo).
-- Arranca oculta y sin stock: se activa desde el panel cuando tenga fotos.
alter table products drop constraint if exists products_pasta_type;
alter table products add constraint products_pasta_type check (pasta_type in ('ravioles', 'sorrentinos', 'cappellacci', 'salsa', 'lasagna'));
-- Hasta ahora todo venía en cajas de 12; la lasaña es una bandeja (1 unidad).
alter table products drop constraint if exists products_units_per_box_check;
alter table products add constraint products_units_per_box_check check (units_per_box between 1 and 100);

insert into products (id, slug, name, pasta_type, filling, description, units_per_box, price, stock, low_stock_threshold, featured, active, sort_order, counts_as_box)
values ('00000000-0000-4000-8000-000000000021', 'lasana-de-ragu', 'Lasaña de ragú', 'lasagna',
        'Ragú de bondiola y roast beef, zanahoria, cebolla, apio, vino tinto, salsa de tomate casera, muzzarella y sardo',
        'Bandeja de 800 g, para 2 personas. Ragú de bondiola y roast beef cocinado lento con zanahoria, cebolla, apio y vino tinto, salsa de tomate casera, muzzarella y sardo.',
        1, 18000, 0, 3, false, false, 15, true)
on conflict (slug) do nothing;
