import type { DeliveryMethod, Locality, PastaType, PaymentMethod, Product, ShippingZone, StoreSettings } from '../types';

export type OrderStatus = 'new' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export const STATUS_FLOW: OrderStatus[] = ['new', 'confirmed', 'preparing', 'shipped', 'delivered'];
export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Nuevo', confirmed: 'Confirmado', preparing: 'En preparación', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
};

export interface AdminOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface AdminOrder {
  id: string;
  number: number;
  createdAt: string; // ISO
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  deliveryMethod: DeliveryMethod;
  address: string | null;
  postalCode: string | null;
  zoneName: string | null;
  locality: string | null;
  partido?: string | null;
  /** Km ida y vuelta (cálculo por distancia) y ubicación de la dirección. */
  km?: number | null;
  lat?: number | null;
  lng?: number | null;
  /** El envío salió del cálculo por distancia. */
  distancePriced?: boolean;
  /** Cajas que cuentan (sin salsas ni complementos). */
  boxCount: number;
  /** Fecha prevista (null en retiros: se coordina por WhatsApp). */
  deliveryDate: string | null;
  /** Fecha real de entrega, la carga el admin. */
  deliveredOn: string | null;
  /** Acepta que se lo lleven otro día si pasan antes por la zona. */
  flexibleDelivery: boolean;
  windowLabel: string;
  notes: string | null;
  subtotal: number;
  discount: number;
  discountPct: number;
  shippingCost: number;
  total: number;
  paymentMethod: PaymentMethod | 'mercadopago';
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  items: AdminOrderItem[];
}

export interface AdminSettings extends StoreSettings {
  notifyEmail: string;
}

export interface AdminProduct extends Product {
  active: boolean;
}

export interface ProductDraft {
  id?: string;
  slug: string;
  name: string;
  pastaType: PastaType;
  filling: string;
  description: string;
  price: number;
  stock: number;
  lowStockThreshold: number;
  featured: boolean;
  countsAsBox: boolean;
  active: boolean;
  sortOrder: number;
}

export type OrderEvent = { type: 'insert' | 'update'; order: AdminOrder };

export interface AdminApi {
  mode: 'demo' | 'live';
  getSession(): Promise<{ email: string } | null>;
  signIn(email: string, password: string): Promise<string | null>; // devuelve mensaje de error o null
  signOut(): Promise<void>;

  listOrders(sinceIso: string): Promise<AdminOrder[]>;
  subscribeOrders(fn: (e: OrderEvent) => void): () => void;
  setOrderStatus(id: string, status: OrderStatus): Promise<void>;
  setPaymentStatus(id: string, status: PaymentStatus): Promise<void>;
  /** Fecha real de entrega (YYYY-MM-DD) o null para borrarla. */
  setDeliveredOn(id: string, date: string | null): Promise<void>;

  listProducts(): Promise<AdminProduct[]>;
  saveProduct(d: ProductDraft): Promise<string>; // id
  updateStock(id: string, patch: { stock?: number; lowStockThreshold?: number; active?: boolean }): Promise<void>;
  uploadMedia(productId: string, file: Blob, kind: 'photo' | 'video', alt: string): Promise<void>;
  deleteMedia(productId: string, mediaId: string): Promise<void>;
  /** Solo productos ocultos y sin pedidos. */
  deleteProduct(productId: string): Promise<void>;
  setCover(productId: string, mediaId: string): Promise<void>;
  moveMedia(productId: string, mediaId: string, dir: -1 | 1): Promise<void>;

  listZones(): Promise<(ShippingZone & { active: boolean })[]>;
  saveZone(z: Omit<ShippingZone, 'id'> & { active: boolean; id: string | null }): Promise<void>;
  deleteZone(id: string): Promise<void>;

  listLocalities(): Promise<(Locality & { active: boolean })[]>;
  saveLocality(l: Omit<Locality, 'id'> & { id: number | null; active: boolean }): Promise<void>;
  deleteLocality(id: number): Promise<void>;
  /** enabled = hay clave de OpenRouteService en el servidor. */
  getShippingConfig(): Promise<ShippingConfig & { enabled?: boolean }>;
  saveShippingConfig(c: ShippingConfig): Promise<void>;

  getSettings(): Promise<AdminSettings>;
  saveSettings(s: AdminSettings): Promise<void>;
  /** Manda un WhatsApp de prueba al número de avisos. Devuelve el resultado legible. */
  testWhatsapp(): Promise<string>;
  /** Avisos push al celular: clave pública y cuántos celulares los tienen activados. */
  getPush(): Promise<{ publicKey: string; devices: number }>;
  subscribePush(subscription: PushSubscriptionJSON, label: string): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;
  testPush(): Promise<string>;
}

/** Cálculo del envío por distancia (privado: tiene la ubicación de origen). */
export interface ShippingConfig {
  originLat: number;
  originLng: number;
  /** 'bands' = escalones por km · 'fuel' = nafta + peaje · 'boxes' = viaje menos lo que absorbe cada caja. */
  pricingMode: 'bands' | 'fuel' | 'boxes';
  /** Modo por cajas: cuánto del margen de cada caja va a pagar el viaje. */
  absorbPerBox?: number;
  /** Modo por localidad: margen de las cajas (después de insumos y mano de obra) y margen mínimo por pedido. */
  productMarginPct?: number;
  minMarginPct?: number;
  /** Tope de envío (0 = sin tope). */
  maxShipping?: number;
  /** Escalones: hasta X km de ida, $precio. upToKm null = "más lejos". */
  bands?: { upToKm: number | null; price: number }[];
  fuelPrice: number;
  consumption100km: number;
  rounding: number;
}
