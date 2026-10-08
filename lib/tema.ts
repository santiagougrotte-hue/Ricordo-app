// Personalización de apariencia (Sección 34 del pedido de evolución) — capa pura: presets de
// color de acento y las funciones para derivar sus variantes (hover, "dim"). Nunca toca los
// colores semánticos (verde/rojo/naranja de éxito/error/atención), que son variables CSS
// separadas en app/globals.css y no se leen ni se escriben desde acá.

export interface PresetAcento {
  id: string;
  nombre: string;
  hex: string;
}

/** Deliberadamente en tonos distintos de los colores semánticos (--green/--red/--orange en
 * globals.css) para que un acento "Verde" o "Rojo" no se confunda visualmente con un estado de
 * éxito/error — son paletas separadas a propósito. */
export const PRESETS_ACENTO: PresetAcento[] = [
  { id: "violeta", nombre: "Violeta (original)", hex: "#8b5cf6" },
  { id: "azul", nombre: "Azul", hex: "#2563eb" },
  { id: "verde", nombre: "Verde", hex: "#16a34a" },
  { id: "naranja", nombre: "Naranja", hex: "#c2410c" },
  { id: "rojo", nombre: "Rojo", hex: "#b91c1c" },
];

export function hexValido(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

function hexARgb(hex: string): { r: number; g: number; b: number } {
  const limpio = hex.replace("#", "");
  return {
    r: parseInt(limpio.slice(0, 2), 16),
    g: parseInt(limpio.slice(2, 4), 16),
    b: parseInt(limpio.slice(4, 6), 16),
  };
}

function componenteAHex(c: number): string {
  return Math.max(0, Math.min(255, Math.round(c)))
    .toString(16)
    .padStart(2, "0");
}

/** Mezcla el color con blanco — usado para el "hover"/variante clara del acento
 * (equivalente a --accent2 en globals.css). `cantidad` va de 0 (igual) a 1 (blanco puro). */
export function aclararHex(hex: string, cantidad: number): string {
  if (!hexValido(hex)) return hex;
  const { r, g, b } = hexARgb(hex);
  const mezclar = (c: number) => c + (255 - c) * cantidad;
  return `#${componenteAHex(mezclar(r))}${componenteAHex(mezclar(g))}${componenteAHex(mezclar(b))}`;
}

/** rgba() del color a una opacidad dada — usado para el fondo "dim" (equivalente a --accent-dim). */
export function hexARgba(hex: string, alpha: number): string {
  if (!hexValido(hex)) return hex;
  const { r, g, b } = hexARgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Luminancia relativa (WCAG) — usada para advertir si un acento personalizado queda con muy
 * poco contraste contra el fondo oscuro/claro, sin bloquear la elección (es una decisión del
 * usuario, solo se lo avisa). */
export function luminanciaRelativa(hex: string): number {
  if (!hexValido(hex)) return 0;
  const { r, g, b } = hexARgb(hex);
  const canal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export interface VariantesAcento {
  accent: string;
  accent2: string;
  accentDim: string;
}

export function derivarVariantesAcento(hex: string): VariantesAcento {
  return { accent: hex, accent2: aclararHex(hex, 0.18), accentDim: hexARgba(hex, 0.14) };
}
