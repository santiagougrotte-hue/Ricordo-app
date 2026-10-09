-- Todas las cajas son de sorrentinos: Espinaca también (antes figuraba como raviolones).
-- Los textos se cambian solo si siguen siendo los originales (por si ya se editaron en el panel).
update products set pasta_type = 'sorrentinos' where id = '00000000-0000-4000-8000-000000000012';
update products
   set description = 'Sorrentinos de espinaca, ricotta, queso sardo, muzzarella y nueces picadas. Cada caja trae 12 sorrentinos.'
 where id = '00000000-0000-4000-8000-000000000012'
   and description = 'Raviolones de espinaca, ricotta, queso sardo, muzzarella y nueces picadas. Cada caja trae 12 raviolones.';
update product_media set alt = 'Sorrentino de espinaca en la mano, sobre la bandeja con el resto de la tanda'
 where url = '/fotos/espinaca-mano.webp' and alt = 'Raviolón de espinaca en la mano, sobre la bandeja con el resto de la tanda';
update product_media set alt = 'Lo que lleva: espinaca, ricotta, sardo, muzzarella y nueces, alrededor de un sorrentino'
 where url = '/fotos/espinaca-ingredientes.webp' and alt = 'Lo que lleva: espinaca, ricotta, sardo, muzzarella y nueces, alrededor de un raviolón';
