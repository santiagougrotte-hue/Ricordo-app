import type { DeliveryMethod, DeliverySlot, OrderInput, OrderResult, Product, ShippingZone, StoreSettings } from '../types';

export interface StoreApi {
  mode: 'demo' | 'live';
  listProducts(): Promise<Product[]>;
  listZones(): Promise<ShippingZone[]>;
  getSettings(): Promise<StoreSettings>;
  listSlots(method: DeliveryMethod): Promise<DeliverySlot[]>;
  createOrder(input: OrderInput): Promise<OrderResult>;
}
