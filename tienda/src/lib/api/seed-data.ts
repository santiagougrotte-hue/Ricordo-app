import type { Locality, Product, ShippingZone, StoreSettings } from '../types';
import fotoMano from '../../assets/fotos/cabutia-mano.webp';
import fotoCorte from '../../assets/fotos/cabutia-corte.webp';
import videoAmasado from '../../assets/fotos/amasado-masa-nero.mp4';
import fotoCabutiaIng from '../../assets/fotos/cabutia-ingredientes.webp';
import fotoOsobuco from '../../assets/fotos/osobuco-mano.webp';
import fotoOsobucoIng from '../../assets/fotos/osobuco-ingredientes.webp';
import fotoEspinaca from '../../assets/fotos/espinaca-mano.webp';
import fotoEspinacaIng from '../../assets/fotos/espinaca-ingredientes.webp';
import fotoJyq from '../../assets/fotos/jamon-queso-mano.webp';
import fotoJyqIng from '../../assets/fotos/jamon-queso-ingredientes.webp';

// Datos de ejemplo — los mismos que netlify/database/migrations/*_example-data. Precios, rellenos y CPs son ilustrativos.
// Gusto real (igual que netlify/database/migrations/*_gusto-cabutia).
export const CABUTIA: Product = {
  id: '00000000-0000-4000-8000-000000000010',
  slug: 'sorrentinos-cabutia',
  name: 'Cabutia',
  pastaType: 'sorrentinos',
  filling: 'Cabutia asada, ajo asado, muzzarella, sardo y almendras picadas',
  description: 'Nueva masa nero: negra por fuera, naranja por dentro. Cada caja trae 12 sorrentinos.',
  unitsPerBox: 12,
  price: 11500,
  stock: 20,
  lowStockThreshold: 4,
  featured: true,
  countsAsBox: true,
  sortOrder: 1,
  media: [
    { id: 'm-cab-1', url: fotoMano, kind: 'photo', alt: 'Sorrentino de masa nero en la mano, sobre la bandeja enharinada', isCover: true, sortOrder: 0 },
    { id: 'm-cab-2', url: fotoCorte, kind: 'photo', alt: 'Sorrentino de cabutia cortado al medio, con el relleno naranja a la vista', isCover: false, sortOrder: 1 },
    { id: 'm-cab-4', url: videoAmasado, kind: 'video', alt: 'Amasando la masa nero y sorrentinos recién hechos', isCover: false, sortOrder: 3 },
    { id: 'm-cab-5', url: fotoCabutiaIng, kind: 'photo', alt: 'Lo que lleva: cabutia asada, sardo, almendras, muzzarella y ajo asado, alrededor de un sorrentino de masa nero', isCover: false, sortOrder: 4 },
  ],
};

// Igual que netlify/database/migrations/*_gusto-osobuco.
export const OSOBUCO: Product = {
  id: '00000000-0000-4000-8000-000000000011',
  slug: 'sorrentinos-osobuco',
  name: 'Osobuco',
  pastaType: 'sorrentinos',
  filling: 'Osobuco braseado 4 horas al vino tinto y vermut, con zanahoria, apio y cebolla',
  description: 'Osobuco braseado durante 4 horas al vino tinto y vermut, con zanahoria, apio y cebolla. Cada caja trae 12 sorrentinos.',
  unitsPerBox: 12,
  price: 14000,
  stock: 20,
  lowStockThreshold: 4,
  featured: true,
  countsAsBox: true,
  sortOrder: 2,
  media: [
    { id: 'm-oso-1', url: fotoOsobuco, kind: 'photo', alt: 'Sorrentino de osobuco en la mano, sobre la bandeja con el resto de la tanda', isCover: true, sortOrder: 0 },
    { id: 'm-oso-2', url: fotoOsobucoIng, kind: 'photo', alt: 'Lo que lleva: osobuco, zanahoria, apio, vino tinto, vermut y cebolla, alrededor de un sorrentino', isCover: false, sortOrder: 1 },
  ],
};

// Igual que netlify/database/migrations/*_gusto-espinaca.
export const ESPINACA: Product = {
  id: '00000000-0000-4000-8000-000000000012',
  slug: 'raviolones-espinaca',
  name: 'Espinaca',
  pastaType: 'ravioles',
  filling: 'Espinaca, ricotta, sardo, muzzarella y nueces picadas',
  description: 'Raviolones de espinaca, ricotta, queso sardo, muzzarella y nueces picadas. Cada caja trae 12 raviolones.',
  unitsPerBox: 12,
  price: 13000,
  stock: 20,
  lowStockThreshold: 4,
  featured: true,
  countsAsBox: true,
  sortOrder: 3,
  media: [
    { id: 'm-esp-1', url: fotoEspinaca, kind: 'photo', alt: 'Raviolón de espinaca en la mano, sobre la bandeja con el resto de la tanda', isCover: true, sortOrder: 0 },
    { id: 'm-esp-2', url: fotoEspinacaIng, kind: 'photo', alt: 'Lo que lleva: espinaca, ricotta, sardo, muzzarella y nueces, alrededor de un raviolón', isCover: false, sortOrder: 1 },
  ],
};

// Igual que netlify/database/migrations/*_gusto-jamon-queso.
export const JAMON_QUESO: Product = {
  id: '00000000-0000-4000-8000-000000000013',
  slug: 'sorrentinos-jamon-queso',
  name: 'Jamón y queso',
  pastaType: 'sorrentinos',
  filling: 'Jamón cocido, muzzarella y queso sardo',
  description: 'Sorrentinos de jamón cocido, muzzarella y queso sardo. Cada caja trae 12 sorrentinos.',
  unitsPerBox: 12,
  price: 11000,
  stock: 20,
  lowStockThreshold: 4,
  featured: true,
  countsAsBox: true,
  sortOrder: 4,
  media: [
    { id: 'm-jyq-1', url: fotoJyq, kind: 'photo', alt: 'Sorrentino de jamón y queso en la mano, sobre la bandeja enharinada', isCover: true, sortOrder: 0 },
    { id: 'm-jyq-2', url: fotoJyqIng, kind: 'photo', alt: 'Lo que lleva: jamón cocido y muzzarella, alrededor de un sorrentino', isCover: false, sortOrder: 1 },
  ],
};

/** Productos de ejemplo: ocultos en la tienda (sirven de modelo en el panel). */
export const EXAMPLE_IDS = [1, 2, 3, 4, 5].map((n) => `00000000-0000-4000-8000-00000000000${n}`);

export const SEED_PRODUCTS: Product[] = [
  CABUTIA,
  OSOBUCO,
  ESPINACA,
  JAMON_QUESO,
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'sorrentinos-jamon-muzza-nuez',
    name: 'Jamón, muzza y nuez',
    pastaType: 'sorrentinos',
    filling: 'Jamón cocido, muzzarella y nuez',
    description: 'Los más pedidos. Masa fina de arroz y mandioca, relleno cremoso con nuez picada a cuchillo.',
    unitsPerBox: 12,
    price: 9800,
    stock: 14,
    lowStockThreshold: 3,
    featured: true,
  countsAsBox: true,
    sortOrder: 1,
    media: [],
    shotNote: 'sorrentinos en la tabla, enharinados, ¾ desde arriba',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'ravioles-ricota-espinaca',
    name: 'Ricota y espinaca',
    pastaType: 'ravioles',
    filling: 'Ricota, espinaca y parmesano',
    description: 'El clásico de los domingos. Ricota bien escurrida, espinaca salteada y un toque de nuez moscada.',
    unitsPerBox: 12,
    price: 8500,
    stock: 2,
    lowStockThreshold: 3,
    featured: true,
  countsAsBox: true,
    sortOrder: 2,
    media: [],
    shotNote: 'ravioles crudos en la caja abierta, cenital',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    slug: 'cappellacci-zapallo',
    name: 'Zapallo y nuez moscada',
    pastaType: 'cappellacci',
    filling: 'Zapallo asado, queso y nuez moscada',
    description: 'Zapallo asado al horno hasta que se carameliza. Van perfectos con manteca y salvia.',
    unitsPerBox: 12,
    price: 10200,
    stock: 9,
    lowStockThreshold: 3,
    featured: true,
  countsAsBox: true,
    sortOrder: 3,
    media: [],
    shotNote: 'cappellacci cerrados en fila, luz de ventana',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    slug: 'sorrentinos-calabaza-queso-azul',
    name: 'Calabaza y queso azul',
    pastaType: 'sorrentinos',
    filling: 'Calabaza, queso azul y cebolla caramelizada',
    description: 'Para los que se animan: dulce de la calabaza, fuerte del azul.',
    unitsPerBox: 12,
    price: 10500,
    stock: 0,
    lowStockThreshold: 3,
    featured: false,
  countsAsBox: true,
    sortOrder: 4,
    media: [],
    shotNote: 'sorrentino cortado al medio mostrando el relleno',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    slug: 'ravioles-verdura-pollo',
    name: 'Verdura y pollo',
    pastaType: 'ravioles',
    filling: 'Pollo, acelga y queso',
    description: 'Suaves, para toda la familia. Pollo desmenuzado a mano con acelga.',
    unitsPerBox: 12,
    price: 8900,
    stock: 20,
    lowStockThreshold: 3,
    featured: false,
  countsAsBox: true,
    sortOrder: 5,
    media: [],
    shotNote: 'plato servido con salsa fileto, mesa de madera',
  },
];

// Igual que netlify/database/migrations/*_localidades-distancia. Costos fijos de ejemplo.
const Z = { discountPerBox: 5, discountMax: 10, tollRoundTrip: 0, avgOrdersPerRoute: 1 };
export const SEED_ZONES: ShippingZone[] = [
  // Igual que la migración envio-por-cajas: Hudson y Berazategui fijo; el resto, por cajas ($ = envío con el pedido mínimo).
  { id: 'zone-0', name: 'Hudson / Plátanos / Ranelagh', shippingCost: 2000, minBoxes: 3, freeFromBoxes: 4, deliveryWeekday: 5, deliveryMoment: 'a la noche', distancePricing: false, ...Z },
  { id: 'zone-1', name: 'Berazategui', shippingCost: 1500, minBoxes: 3, freeFromBoxes: 4, deliveryWeekday: 6, deliveryMoment: 'a la mañana', distancePricing: false, ...Z },
  { id: 'zone-2', name: 'Quilmes / Bernal / Wilde', shippingCost: 6000, minBoxes: 4, freeFromBoxes: 6, deliveryWeekday: 6, deliveryMoment: 'a la mañana', distancePricing: true, ...Z, tollRoundTrip: 16000 },
  { id: 'zone-3', name: 'CABA', shippingCost: 7500, minBoxes: 5, freeFromBoxes: 8, deliveryWeekday: 6, deliveryMoment: 'a la mañana', distancePricing: true, ...Z, tollRoundTrip: 16000 },
  { id: 'zone-4', name: 'City Bell / La Plata', shippingCost: 9000, minBoxes: 5, freeFromBoxes: 8, deliveryWeekday: 0, deliveryMoment: '', distancePricing: true, ...Z, tollRoundTrip: 16000 },
];

const LOC: [string, string, string][] = [
  ['Guillermo E. Hudson', 'Berazategui', 'zone-0'], ['Plátanos', 'Berazategui', 'zone-0'], ['Ranelagh', 'Berazategui', 'zone-0'], ['Juan María Gutiérrez', 'Berazategui', 'zone-0'],
  ['Berazategui', 'Berazategui', 'zone-1'], ['Berazategui Oeste', 'Berazategui', 'zone-1'], ['Villa España', 'Berazategui', 'zone-1'], ['Sourigues', 'Berazategui', 'zone-1'],
  ['Quilmes', 'Quilmes', 'zone-2'], ['Quilmes Oeste', 'Quilmes', 'zone-2'], ['Bernal', 'Quilmes', 'zone-2'], ['Bernal Oeste', 'Quilmes', 'zone-2'],
  ['Don Bosco', 'Quilmes', 'zone-2'], ['Ezpeleta', 'Quilmes', 'zone-2'], ['Ezpeleta Oeste', 'Quilmes', 'zone-2'], ['Wilde', 'Avellaneda', 'zone-2'],
  ['CABA', 'CABA', 'zone-3'],
  ['City Bell', 'La Plata', 'zone-4'], ['Gonnet', 'La Plata', 'zone-4'], ['La Plata', 'La Plata', 'zone-4'],
];
export const SEED_LOCALITIES: Locality[] = LOC.map(([name, partido, zoneId], i) => ({ id: i + 1, name, partido, zoneId }));

export const SEED_SETTINGS: StoreSettings = {
  pickupEnabled: true,
  pickupMinBoxes: 2,
  pickupAddress: 'Berazategui (te pasamos la dirección por WhatsApp)',
  whatsappPhone: '5491100000000',
  transferInfo: 'Alias: RICORDO.PASTAS (dato de ejemplo)',
  cutoffWeekday: 4,
  cutoffTime: '13:00',
};
