import type { DeliveryMethod, PastaType, PaymentMethod, Product, ShippingZone, StoreSettings } from '../types';
import type { DeliveryWindow } from '../slots';

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
  deliveryDate: string;
  windowLabel: string;
  notes: string | null;
  subtotal: number;
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

  listProducts(): Promise<AdminProduct[]>;
  saveProduct(d: ProductDraft): Promise<string>; // id
  updateStock(id: string, patch: { stock?: number; lowStockThreshold?: number; active?: boolean }): Promise<void>;
  uploadMedia(productId: string, file: Blob, kind: 'photo' | 'video', alt: string): Promise<void>;
  deleteMedia(productId: string, mediaId: string): Promise<void>;
  setCover(productId: string, mediaId: string): Promise<void>;
  moveMedia(productId: string, mediaId: string, dir: -1 | 1): Promise<void>;

  listZones(): Promise<(ShippingZone & { active: boolean })[]>;
  saveZone(z: Omit<ShippingZone, 'id'> & { active: boolean; id: string | null }): Promise<void>;
  deleteZone(id: string): Promise<void>;

  getSettings(): Promise<AdminSettings>;
  saveSettings(s: AdminSettings): Promise<void>;
  listWindows(): Promise<DeliveryWindow[]>;
  saveWindow(w: Omit<DeliveryWindow, 'id'> & { id: string | null }): Promise<void>;
}
