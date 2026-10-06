/** Link a WhatsApp con mensaje precargado. phone en formato internacional sin "+": 5491155551234. */
export function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Celular argentino → formato wa.me (549 + área + número, sin 0 ni 15). */
export function arWhatsapp(phone: string): string | null {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  // 11 15 5555 1234 → 11 5555 1234 (el 15 va después del código de área)
  for (const area of [2, 3, 4]) {
    if (d.length === 12 && d.slice(area, area + 2) === '15') {
      d = d.slice(0, area) + d.slice(area + 2);
      break;
    }
  }
  return d.length === 10 ? '549' + d : null;
}
