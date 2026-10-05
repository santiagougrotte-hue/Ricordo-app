export type PastaType = 'ravioles' | 'sorrentinos' | 'cappellacci';
export type DeliveryMethod = 'delivery' | 'pickup';
export type PaymentMethod = 'transfer' | 'cash';

export interface ProductMedia {
  id: string;
  url: string;
  kind: 'photo' | 'video';
  alt: string;
  isCover: boolean;
  sortOrder: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  pastaType: PastaType;
  filling: string;
  description: string;
  unitsPerBox: number;
  price: number;
  stock: number;
  lowStockThreshold: number;
  featured: boolean;
  /** Cuenta para mínimos, envío gratis y descuentos. Las salsas y complementos no. */
  countsAsBox: boolean;
  sortOrder: number;
  media: ProductMedia[];
  /** Pedido para la sesión de fotos mientras no haya fotos reales. */
  shotNote?: string;
}

export interface ShippingZone {
  id: string;
  name: string;
  /** Costo fijo: se usa en zonas sin cálculo por distancia o si no se pudo ubicar la dirección. */
  shippingCost: number;
  minBoxes: number;
  freeFromBoxes: number | null;
  deliveryWeekday: number; // 0 = domingo … 6 = sábado
  deliveryMoment: string; // 'a la mañana', 'a la noche' o ''
  /** % de descuento por cada caja que pasa el umbral de envío gratis. */
  discountPerBox: number;
  discountMax: number;
  /** El envío sale del cálculo por distancia (nafta + peaje). */
  distancePricing: boolean;
  tollRoundTrip: number;
  avgOrdersPerRoute: number;
}

/** La zona la define la localidad (los CP se superponen entre localidades). */
export interface Locality {
  id: number;
  name: string;
  partido: string;
  zoneId: string;
}

/** Sugerencia del buscador de direcciones. */
export interface AddressSuggestion {
  /** Lo que se muestra: "Calle 14 1234, Ranelagh, Berazategui". */
  label: string;
  /** Calle y número, lo que se guarda en el pedido. */
  address: string;
  postalCode: string | null;
  /** Tiene altura (número): sin número el envío se calcula a la calle. */
  hasNumber: boolean;
  /** unknown = la dirección no trae localidad ni partido: el cliente la escribe. */
  match: { status: 'found'; localityId: number } | { status: 'confirm'; options: number[] } | { status: 'not_found' } | { status: 'unknown' };
}

/** Envío calculado por distancia para una dirección (null = no se pudo, se usa el costo fijo). */
export interface DistanceQuote {
  distanceCost: number | null;
  km: number | null;
}

export interface StoreSettings {
  pickupEnabled: boolean;
  pickupMinBoxes: number;
  pickupAddress: string;
  whatsappPhone: string;
  transferInfo: string;
  /** Cierre semanal de pedidos (hora de Buenos Aires). */
  cutoffWeekday: number;
  cutoffTime: string; // HH:MM
  /** El servidor puede calcular el envío por distancia (hay clave de OpenRouteService). */
  distanceEnabled?: boolean;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface OrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryMethod: DeliveryMethod;
  address: string;
  postalCode: string;
  localityId: number | null;
  notes: string;
  paymentMethod: PaymentMethod;
  /** "Si pasamos por tu zona antes, ¿te lo podemos llevar otro día?" */
  flexibleDelivery: boolean;
  items: CartLine[];
  turnstileToken?: string;
}

export interface OrderReceipt {
  orderId: string;
  number: number;
  subtotal: number;
  discount: number;
  discountPct: number;
  shippingCost: number;
  total: number;
  boxCount: number;
  deliveryMethod: DeliveryMethod;
  deliveryDate: string | null;
  windowLabel: string;
  locality?: string | null;
  paymentMethod: PaymentMethod;
  lines: { name: string; quantity: number; unitPrice: number }[];
  customerName: string;
}

export interface ShortItem {
  product_id: string;
  name: string | null;
  requested: number;
  available: number;
}

/** Mismos códigos que create_order() en la base. */
export type OrderError =
  | { code: 'RC001'; message: string; short: ShortItem[] }
  | { code: 'RC002'; message: string }
  | { code: 'RC003'; message: string; minBoxes: number; missing: number; pickupMinBoxes: number | null }
  | { code: 'RC004'; message: string }
  | { code: 'RC005'; message: string }
  | { code: 'RC006'; message: string }
  | { code: 'NETWORK'; message: string }
  | { code: 'CAPTCHA'; message: string };

export type OrderResult = { ok: true; receipt: OrderReceipt } | { ok: false; error: OrderError };

export const PASTA_LABEL: Record<PastaType, string> = {
  ravioles: 'Raviolones',  // los ravioles de Ricordo son raviolones
  sorrentinos: 'Sorrentinos',
  cappellacci: 'Cappellacci',
};
