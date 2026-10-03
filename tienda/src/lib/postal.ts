/**
 * Normaliza un código postal argentino a sus 4 dígitos.
 * Acepta "1884", "B1884ABC", "b 1884 abc", "1884-ABC". Cualquier otra cosa → null.
 * Mismo criterio que normalize_postal_code() en la base.
 */
export function normalizePostalCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s.-]/g, '');
  const m = /^[A-Z]?(\d{4})(?:[A-Z]{3})?$/.exec(s);
  return m ? m[1] : null;
}
