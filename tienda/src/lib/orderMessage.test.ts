import { describe, expect, it } from 'vitest';
import { orderDateTime, orderMessage, prettyPhone } from './orderMessage';
import type { OrderReceipt } from './types';

const R: OrderReceipt = {
  orderId: 'x', number: 1042, subtotal: 66000, discount: 550, discountPct: 5, shippingCost: 0, total: 65450, boxCount: 5,
  deliveryMethod: 'delivery', deliveryDate: '2026-10-10', windowLabel: 'Sábado 10/10 a la mañana', locality: 'Juan María Gutiérrez',
  paymentMethod: 'transfer', customerName: 'Santiago', customerPhone: '1152590251', address: 'Calle 63 2289', postalCode: '1889',
  notes: 'Fincas de Iraola 1, lote 150', flexibleDelivery: true, lat: -34.83, lng: -58.18, createdAt: '2026-09-19T21:39:00Z',
  lines: [{ name: 'Sorrentinos de calabaza', quantity: 4, unitPrice: 11000 }, { name: 'Raviolones de osobuco', quantity: 1, unitPrice: 14000 }, { name: 'Salsa fileto', quantity: 1, unitPrice: 8000 }],
};

describe('resumen de WhatsApp', () => {
  it('fecha y hora de Argentina, teléfono legible', () => {
    expect(orderDateTime('2026-09-19T21:39:00Z')).toBe('19/09/26 · 18:39 h');
    expect(prettyPhone('5491152590251')).toBe('11 5259-0251');
    expect(prettyPhone('2214567890')).toBe('221456-7890');
  });
  it('el del cliente: saludo, secciones, descuento, envío gratis, alias y cierre', () => {
    const t = orderMessage(R, { to: 'cliente', transferInfo: 'Alias: ricordo.pastas' });
    expect(t.startsWith('¡Hola Ricordo! 👋 Te paso el resumen de mi pedido')).toBe(true);
    for (const s of [
      '🧾 *Pedido #1042*', '📅 19/09/26 · 18:39 h', '📱 11 5259-0251', '🥟 *Mi pedido*', '▪️ *4 ×* Sorrentinos de calabaza', '$11.000 c/u · $44.000',
      '▪️ *1 ×* Raviolones de osobuco · $14.000', '📍 Calle 63 2289, Juan María Gutiérrez · CP 1889', 'https://www.google.com/maps?q=-34.83,-58.18',
      '📝 *Nota:* Fincas de Iraola 1, lote 150', 'me lo pueden llevar otro día', 'Descuento 5% en cajas extra: −$550', 'Envío: ¡gratis! 🎉',
      '*TOTAL: $65.450*', '► Alias: ricordo.pastas', 'Espero tu respuesta para confirmar mi pedido',
    ]) expect(t).toContain(s);
    expect(t).not.toContain('wa.me');
    expect(t).not.toMatch(/\n{3,}/);
  });
  it('retiro con efectivo: sin dirección ni envío', () => {
    const t = orderMessage({ ...R, deliveryMethod: 'pickup', shippingCost: 0, address: null, lat: null, lng: null, paymentMethod: 'cash' }, { to: 'cliente' });
    expect(t).toContain('🏠 *Retiro en Berazategui*');
    expect(t).toContain('💵 *Pago:* Efectivo al recibir');
    expect(t).not.toContain('Envío:');
    expect(t).not.toContain('📍');
  });
});
