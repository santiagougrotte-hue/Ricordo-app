/** Link a WhatsApp con mensaje precargado. phone en formato internacional sin "+": 5491155551234. */
export function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
