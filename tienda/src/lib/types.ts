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
  sortOrder: number;
  media: ProductMedia[];
  /** Pedido para la sesión de fotos mientras no haya fotos reales. */
  shotNote?: string;
}

export interface ShippingZone {
  id: string;
  name: string;
  postalCodes: string[];
  shippingCost: number;
  minOrder: number;
  freeShippingFrom: number | null;
}

export interface StoreSettings {
  pickupEnabled: boolean;
  pickupMinOrder: number;
  pickupAddress: string;
  whatsappPhone: string;
  transferInfo: string;
}

export interface DeliverySlot {
  windowId: string;
  date: string; // YYYY-MM-DD (hora de Buenos Aires)
  label: string; // "Viernes a la noche"
  startsAt: string; // HH:MM
  endsAt: string;
  closesAt: string; // ISO
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
  notes: string;
  paymentMethod: PaymentMethod;
  deliveryDate: string;
  deliveryWindowId: string;
  items: CartLine[];
  turnstileToken?: string;
}

export interface OrderReceipt {
  orderId: string;
  number: number;
  subtotal: number;
  shippingCost: number;
  total: number;
  deliveryMethod: DeliveryMethod;
  windowLabel: string;
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
  | { code: 'RC003'; message: string; minOrder: number; missing: number }
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
