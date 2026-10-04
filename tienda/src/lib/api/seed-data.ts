import type { Product, ShippingZone, StoreSettings } from '../types';
import type { DeliveryWindow } from '../slots';
import fotoMano from '../../assets/fotos/cabutia-mano.webp';
import fotoCorte from '../../assets/fotos/cabutia-corte.webp';
import fotoNero from '../../assets/fotos/cabutia-masa-nero.webp';
import videoAmasado from '../../assets/fotos/amasado-masa-nero.mp4';
import fotoCabutiaIng from '../../assets/fotos/cabutia-ingredientes.webp';
import fotoOsobuco from '../../assets/fotos/osobuco-mano.webp';
import fotoOsobucoIng from '../../assets/fotos/osobuco-ingredientes.webp';

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
  sortOrder: 1,
  media: [
    { id: 'm-cab-1', url: fotoMano, kind: 'photo', alt: 'Sorrentino de masa nero en la mano, sobre la bandeja enharinada', isCover: true, sortOrder: 0 },
    { id: 'm-cab-2', url: fotoCorte, kind: 'photo', alt: 'Sorrentino de cabutia cortado al medio, con el relleno naranja a la vista', isCover: false, sortOrder: 1 },
    { id: 'm-cab-3', url: fotoNero, kind: 'photo', alt: 'Sorrentinos de masa nero enharinados sobre la mesada', isCover: false, sortOrder: 2 },
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
  sortOrder: 2,
  media: [
    { id: 'm-oso-1', url: fotoOsobuco, kind: 'photo', alt: 'Sorrentino de osobuco en la mano, sobre la bandeja con el resto de la tanda', isCover: true, sortOrder: 0 },
    { id: 'm-oso-2', url: fotoOsobucoIng, kind: 'photo', alt: 'Lo que lleva: osobuco, zanahoria, apio, vino tinto, vermut y cebolla, alrededor de un sorrentino', isCover: false, sortOrder: 1 },
  ],
};

/** Productos de ejemplo: ocultos en la tienda (sirven de modelo en el panel). */
export const EXAMPLE_IDS = [1, 2, 3, 4, 5].map((n) => `00000000-0000-4000-8000-00000000000${n}`);

export const SEED_PRODUCTS: Product[] = [
  CABUTIA,
  OSOBUCO,
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
    sortOrder: 5,
    media: [],
    shotNote: 'plato servido con salsa fileto, mesa de madera',
  },
];

export const SEED_ZONES: ShippingZone[] = [
  { id: 'zone-bera', name: 'Berazategui', postalCodes: ['1884', '1885', '1886'], shippingCost: 1500, minOrder: 15000, freeShippingFrom: 30000 },
  { id: 'zone-quilmes', name: 'Quilmes y Bernal', postalCodes: ['1876', '1878', '1879', '1881', '1882'], shippingCost: 2500, minOrder: 20000, freeShippingFrom: 40000 },
  { id: 'zone-varela', name: 'Florencio Varela', postalCodes: ['1888', '1889', '1891'], shippingCost: 3000, minOrder: 20000, freeShippingFrom: null },
];

export const SEED_SETTINGS: StoreSettings = {
  pickupEnabled: true,
  pickupMinOrder: 0,
  pickupAddress: 'Berazategui (te pasamos la dirección por WhatsApp)',
  whatsappPhone: '5491100000000',
  transferInfo: 'Alias: RICORDO.PASTAS (dato de ejemplo)',
};

export const SEED_WINDOWS: DeliveryWindow[] = [
  { id: 'win-vie', label: 'Viernes a la noche', weekday: 5, startsAt: '20:00', endsAt: '23:00', cutoffHours: 24, forDelivery: true, forPickup: true, active: true },
  { id: 'win-sab', label: 'Sábado a la mañana', weekday: 6, startsAt: '09:00', endsAt: '13:00', cutoffHours: 24, forDelivery: true, forPickup: true, active: true },
];
