// Lógica del módulo de Planificación de Producción. Vive separado de calc.ts a propósito:
// nada de acá interviene en el costeo — calcCosto() sigue leyendo únicamente
// tipo/concepto/cantidad de cada RecetaLinea, nunca el campo `componente`.

import type { RicordoData, ComponenteReceta } from "./types";
import { inPeriod } from "./calc";

export const CAJAS_POR_SEMANA_DIVISOR = 4.33;

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

export type TendenciaVentas = "up" | "down" | "flat";

export interface ReferenciaVentasGusto {
  id_producto: string;
  nombre: string;
  /** Del más viejo al más nuevo, longitud = ventana de meses configurada. */
  historicoMeses: number[];
  promedioMes: number;
  promedioSemana: number;
  ultimoMesCerrado: number;
  tendencia: TendenciaVentas;
}

/** Bloque 1: referencia de ventas por gusto (producto activo) — promedio de una ventana de
 * meses cerrados (el mes en curso no cuenta, todavía no terminó), el último mes cerrado, y la
 * tendencia de ese último mes contra el promedio. Un gusto sin ventas en la ventana aparece en
 * cero, nunca se oculta. */
export function referenciaVentasPorGusto(data: RicordoData, hoy: Date = new Date()): ReferenciaVentasGusto[] {
  const ventana = data.config_planificacion.ventana_meses_referencia;
  return data.productos
    .filter((p) => p.activo)
    .map((p): ReferenciaVentasGusto => {
      const historicoMeses: number[] = [];
      for (let i = ventana; i >= 1; i--) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const cajas = data.pedidos
          .filter(
            (pe) => pe.id_producto === p.id && pe.estado !== "Cancelado" && inPeriod(pe.fecha, d.getMonth() + 1, d.getFullYear())
          )
          .reduce((acc, pe) => acc + pe.cantidad, 0);
        historicoMeses.push(cajas);
      }
      const promedioMes = historicoMeses.reduce((a, b) => a + b, 0) / ventana;
      const promedioSemana = promedioMes / CAJAS_POR_SEMANA_DIVISOR;
      const ultimoMesCerrado = historicoMeses[historicoMeses.length - 1] ?? 0;
      const tendencia: TendenciaVentas = ultimoMesCerrado > promedioMes ? "up" : ultimoMesCerrado < promedioMes ? "down" : "flat";
      return { id_producto: p.id, nombre: p.nombre, historicoMeses, promedioMes, promedioSemana, ultimoMesCerrado, tendencia };
    });
}

export interface DesvioPlanSemana {
  desviacionPct: number | null; // null si cajas_mes es 0 (no se puede calcular %)
  excedeUmbral: boolean;
}

/** Bloque 2: compara lo cargado en cajas_semana×4,33 contra cajas_mes — no bloquea ni corrige,
 * solo informa si el desvío supera el umbral configurado (para que el usuario decida si es
 * intencional). */
export function desvioPlanSemana(cajasMes: number, cajasSemana: number, umbralPct: number): DesvioPlanSemana {
  if (cajasMes <= 0) return { desviacionPct: null, excedeUmbral: cajasSemana > 0 };
  const desviacionPct = ((cajasSemana * CAJAS_POR_SEMANA_DIVISOR - cajasMes) / cajasMes) * 100;
  return { desviacionPct, excedeUmbral: Math.abs(desviacionPct) > umbralPct };
}
