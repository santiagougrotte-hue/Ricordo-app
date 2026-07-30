// Lógica del módulo de Planificación de Producción. Vive separado de calc.ts a propósito:
// nada de acá interviene en el costeo — calcCosto() sigue leyendo únicamente
// tipo/concepto/cantidad de cada RecetaLinea, nunca el campo `componente`.

import type { RicordoData, ComponenteReceta } from "./types";

// Palabras reconocidas con confianza — todo lo que no matchea ninguna de las dos listas
// queda sin propuesta a propósito (null), para que el usuario lo revise y elija a mano
// en vez de que el sistema adivine con poca confianza.
const PALABRAS_MASA = ["harina", "premezcla", "huevo", "curcuma", "gluten", "semola"];
const PALABRAS_RELLENO = [
  "espinaca",
  "ricotta",
  "sardo",
  "mozzarella",
  "jamon",
  "queso",
  "osobuco",
  "carne",
  "puerro",
  "calabaza",
  "esparrago",
  "verdeo",
  "cebolla",
  "zapallo",
  "pollo",
  "roquefort",
  "provolone",
  "panceta",
  "choclo",
  "hongo",
  "champin",
];

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function coincide(nombre: string, palabras: string[]): boolean {
  const n = normalizar(nombre);
  return palabras.some((p) => n.includes(p));
}

export interface PropuestaClasificacion {
  id: string; // id de la línea de receta (RecetaLinea.id)
  id_producto: string;
  /** null = ambiguo o desconocido, el usuario tiene que elegir a mano antes de confirmar. */
  componente: ComponenteReceta | null;
}

/** Propone (sin escribir nada en data.recetas) cómo clasificar cada línea de receta existente.
 * Packaging siempre se propone "packaging" — no hay ambigüedad posible ahí. Los renglones de
 * tipo CostoFijo no tienen un componente físico natural, quedan sin propuesta. Los ingredientes
 * se matchean por nombre contra dos listas de palabras conocidas; si no coincide con ninguna
 * (o coincide con las dos, lo cual no debería pasar pero se cubre igual), queda sin propuesta. */
export function proponerClasificacionRecetas(data: RicordoData): PropuestaClasificacion[] {
  return data.recetas.map((linea): PropuestaClasificacion => {
    if (linea.tipo === "Packaging") {
      return { id: linea.id, id_producto: linea.id_producto, componente: "packaging" };
    }
    if (linea.tipo === "CostoFijo") {
      return { id: linea.id, id_producto: linea.id_producto, componente: null };
    }
    const ingrediente = data.ingredientes.find((i) => i.id === linea.concepto);
    const nombre = ingrediente?.nombre ?? "";
    const esMasa = coincide(nombre, PALABRAS_MASA);
    const esRelleno = coincide(nombre, PALABRAS_RELLENO);
    if (esMasa && !esRelleno) return { id: linea.id, id_producto: linea.id_producto, componente: "masa" };
    if (esRelleno && !esMasa) return { id: linea.id, id_producto: linea.id_producto, componente: "relleno" };
    return { id: linea.id, id_producto: linea.id_producto, componente: null };
  });
}
