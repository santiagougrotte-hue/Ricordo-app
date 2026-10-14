import type { AddressSuggestion, CouponCheck, DistanceQuote, LoyaltyStatus, Locality, OrderInput, OrderResult, Product, ShippingZone, StoreSettings } from '../types';

export interface StoreApi {
  mode: 'demo' | 'live';
  listProducts(): Promise<Product[]>;
  listZones(): Promise<ShippingZone[]>;
  listLocalities(): Promise<Locality[]>;
  /** Envío por distancia para una dirección (informativo; el pedido lo recalcula). */
  quoteShipping(localityId: number, address: string): Promise<DistanceQuote>;
  /** Sugerencias de direcciones (vacío si no hay buscador disponible). */
  searchAddress(text: string): Promise<AddressSuggestion[]>;
  getSettings(): Promise<StoreSettings>;
  createOrder(input: OrderInput): Promise<OrderResult>;
  /** Valida un cupón con el carrito y el teléfono (lo decide el servidor). */
  checkCoupon(code: string, phone: string, items: { productId: string; quantity: number }[]): Promise<CouponCheck>;
  /** Cliente frecuente para un celular (null si no se pudo consultar). */
  checkLoyalty(phone: string): Promise<LoyaltyStatus | null>;
}
