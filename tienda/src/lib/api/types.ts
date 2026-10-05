import type { DistanceQuote, Locality, OrderInput, OrderResult, Product, ShippingZone, StoreSettings } from '../types';

export interface StoreApi {
  mode: 'demo' | 'live';
  listProducts(): Promise<Product[]>;
  listZones(): Promise<ShippingZone[]>;
  listLocalities(): Promise<Locality[]>;
  /** Envío por distancia para una dirección (informativo; el pedido lo recalcula). */
  quoteShipping(localityId: number, address: string): Promise<DistanceQuote>;
  getSettings(): Promise<StoreSettings>;
  createOrder(input: OrderInput): Promise<OrderResult>;
}
