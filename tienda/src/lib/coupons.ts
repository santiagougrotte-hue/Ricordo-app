// Reglas de cupones en TypeScript: las usa el modo demo (en la tienda real las aplica la base, cupon_evaluar()).
import { money } from './money';

export interface Coupon {
  id: number;
  code: string;
  type: 'porcentaje' | 'monto';
  value: number;
  minPurchase: number | null;
  /** "2026-10-31": válido hasta ese día inclusive. */
  expiresOn: string | null;
  maxUses: number | null;
  uses: number;
  onePerCustomer: boolean;
  /** Cupón personal: solo para este celular (normalizado). */
  customerPhone: string | null;
  active: boolean;
  createdAt: string;
  /** Total descontado con este cupón (panel). */
  totalDiscounted: number;
}

export interface CouponUse { couponId: number; date: string; phone: string; discount: number; orderNumber: number; customerName: string; total: number }

/** Igual que normalize_ar_phone(): solo dígitos, sin 54/9, sin 0 ni 15. */
export function normalizePhone(p: string): string {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === '15') { d = d.slice(0, a) + d.slice(a + 2); break; }
  }
  return d;
}

const todayAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/** Igual que cupon_evaluar(): { discount } si vale, { message } si no. */
export function evaluateCoupon(c: Coupon | undefined, phone: string, subtotal: number, base: number, uses: CouponUse[]): { discount: number } | { message: string } {
  const tel = normalizePhone(phone);
  if (!c || !c.active) return { message: 'Ese cupón no existe o ya no está activo.' };
  if (c.expiresOn && todayAR() > c.expiresOn) return { message: 'Este cupón venció.' };
  if (c.maxUses !== null && c.uses >= c.maxUses) return { message: 'Este cupón ya no tiene usos disponibles.' };
  if ((c.customerPhone || c.onePerCustomer) && tel.length < 8) return { message: 'Poné tu celular para usar este cupón.' };
  if (c.customerPhone && c.customerPhone !== tel) return { message: 'Este cupón es personal y no corresponde a este celular.' };
  if (c.onePerCustomer && uses.some((u) => u.couponId === c.id && u.phone === tel)) return { message: 'Ya usaste este cupón.' };
  if (c.minPurchase !== null && subtotal < c.minPurchase) return { message: `La compra mínima es ${money(c.minPurchase)}.` };
  const discount = c.type === 'porcentaje' ? Math.round((base * c.value) / 100) : Math.min(c.value, base);
  if (discount <= 0) return { message: 'Este cupón no aplica a los productos con precio especial.' };
  return { discount };
}
