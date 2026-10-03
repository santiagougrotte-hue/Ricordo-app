const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** $9.800 — pesos enteros, punto de miles. */
export function money(n: number): string {
  return '$' + fmt.format(Math.round(n));
}
