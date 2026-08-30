// Lógica del módulo de Planificación de Producción. Vive separado de calc.ts a propósito:
// nada de acá interviene en el costeo — calcCosto() sigue leyendo únicamente
// tipo/concepto/cantidad de cada RecetaLinea, nunca el campo `componente`. La única excepción es
// de solo lectura: calcularComposicionGusto() sabe leer la receta derivada de un producto ya
// migrado al modelo base/venta (ver estaMigrado/recetaDerivada en calc.ts) para no marcarlo como
// "sin composición" apenas se migra — pero reescalarLineasComponente() (Bloque 3, que sí escribe)
// sigue siendo exclusivamente para productos no migrados, con RecetaLinea.componente propia.

import type { RicordoData, ComponenteReceta, Ingrediente, RecetaLinea, Producto } from "./types";
import { gustosActivos, inPeriod, pvr, estaMigrado, recetaDerivada } from "./calc";

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
  id_base: string;
  nombre: string;
  /** ids de todas las fichas de canal (minorista, mayorista, etc.) que se suman bajo este gusto. */
  idsVariantes: string[];
  /** Del más viejo al más nuevo, longitud = ventana de meses configurada. */
  historicoMeses: number[];
  promedioMes: number;
  promedioSemana: number;
  ultimoMesCerrado: number;
  tendencia: TendenciaVentas;
}

/** Bloque 1: referencia de ventas por gusto (producto base) — suma las ventas de todas sus
 * variantes de canal (minorista, mayorista, sellado al vacío, etc.), ya que todas salen de la
 * misma masa/relleno física. Promedio de una ventana de meses cerrados (el mes en curso no
 * cuenta, todavía no terminó), el último mes cerrado, y la tendencia de ese último mes contra
 * el promedio. Un gusto sin ventas en la ventana aparece en cero, nunca se oculta. */
export function referenciaVentasPorGusto(data: RicordoData, hoy: Date = new Date()): ReferenciaVentasGusto[] {
  const ventana = data.config_planificacion.ventana_meses_referencia;
  return gustosActivos(data).map((g): ReferenciaVentasGusto => {
    const idsVariantes = g.variantes.map((v) => v.id);
    const idsSet = new Set(idsVariantes);
    const historicoMeses: number[] = [];
    for (let i = ventana; i >= 1; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const cajas = data.pedidos
        .filter((pe) => idsSet.has(pe.id_producto) && pe.estado !== "Cancelado" && inPeriod(pe.fecha, d.getMonth() + 1, d.getFullYear()))
        .reduce((acc, pe) => acc + pe.cantidad, 0);
      historicoMeses.push(cajas);
    }
    const promedioMes = historicoMeses.reduce((a, b) => a + b, 0) / ventana;
    const promedioSemana = promedioMes / CAJAS_POR_SEMANA_DIVISOR;
    const ultimoMesCerrado = historicoMeses[historicoMeses.length - 1] ?? 0;
    const tendencia: TendenciaVentas = ultimoMesCerrado > promedioMes ? "up" : ultimoMesCerrado < promedioMes ? "down" : "flat";
    return { id_base: g.id_base, nombre: g.nombre, idsVariantes, historicoMeses, promedioMes, promedioSemana, ultimoMesCerrado, tendencia };
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

// --- Bloques 3 y 4: composición de masa/relleno y cuadros de necesidad ------------------

/** Todos los ingredientes escalan por peso, incluidos los que se compran por unidad (vía
 * peso_unitario_g). Litros/ml se tratan como equivalentes a gramos (densidad ~1, razonable
 * para los líquidos de estas recetas: agua, leche, aceite). Si un ingrediente "unidad" no
 * tiene peso_unitario_g configurado, no se puede escalar por peso — se devuelve 0 y se avisa. */
function gramosEfectivos(ingrediente: Ingrediente, cantidad: number): { gramos: number; sinPeso: boolean } {
  const unidad = normalizar(ingrediente.unidad);
  if (unidad === "kg") return { gramos: cantidad * 1000, sinPeso: false };
  if (unidad === "litro" || unidad === "l") return { gramos: cantidad * 1000, sinPeso: false };
  if (unidad === "g" || unidad === "gr" || unidad === "gramo" || unidad === "gramos") return { gramos: cantidad, sinPeso: false };
  if (unidad === "ml") return { gramos: cantidad, sinPeso: false };
  if (unidad === "unidad") {
    if (!ingrediente.peso_unitario_g) return { gramos: 0, sinPeso: true };
    return { gramos: cantidad * ingrediente.peso_unitario_g, sinPeso: false };
  }
  return { gramos: 0, sinPeso: true };
}

export interface ComposicionIngrediente {
  id_ingrediente: string;
  nombre: string;
  unidad: string;
  pctComposicion: number; // 0-100
}

export interface ComposicionGusto {
  id_producto: string;
  componente: "masa" | "relleno";
  /** Total de gramos de la receta clasificada tal como está hoy — es el valor sugerido para
   * Producto.gramos_masa_por_caja / gramos_relleno_por_caja mientras no se haya editado. */
  totalGramosPorCaja: number;
  ingredientes: ComposicionIngrediente[];
  /** Nombres de ingredientes "unidad" sin peso_unitario_g configurado — no aportan al total
   * hasta que se cargue ese dato (Insumos > Peso unitario). */
  ingredientesSinPesoConfigurado: string[];
}

/** Líneas de ingrediente de un componente (masa/relleno) para un producto de venta — receta
 * derivada si el producto ya está migrado al modelo base/venta, RecetaLinea.componente propia si
 * no. Mismo despacho que calcCosto()/calcStockIngrediente(), pero de solo lectura. */
function lineasIngredienteDelComponente(
  data: RicordoData,
  producto: Producto | undefined,
  idProducto: string,
  componente: "masa" | "relleno"
): { id_ingrediente: string; cantidad: number }[] {
  if (estaMigrado(data, producto)) {
    return recetaDerivada(data, producto)
      .filter((l) => l.tipo === "Ingrediente" && l.grupo === componente)
      .map((l) => ({ id_ingrediente: l.concepto, cantidad: l.cantidad }));
  }
  return data.recetas
    .filter((r) => r.id_producto === idProducto && r.tipo === "Ingrediente" && r.componente === componente)
    .map((r) => ({ id_ingrediente: r.concepto, cantidad: r.cantidad }));
}

/** Deriva la composición % de masa o relleno de un gusto a partir de sus líneas de receta ya
 * clasificadas (RecetaLinea.componente), o de la receta derivada si el producto está migrado.
 * Pura — no lee ni escribe Producto.gramos_*_por_caja. */
export function calcularComposicionGusto(
  data: RicordoData,
  idProducto: string,
  componente: "masa" | "relleno"
): ComposicionGusto {
  const producto = data.productos.find((p) => p.id === idProducto);
  const lineas = lineasIngredienteDelComponente(data, producto, idProducto, componente);
  const detalle: { id_ingrediente: string; nombre: string; unidad: string; gramos: number }[] = [];
  const sinPeso: string[] = [];
  for (const linea of lineas) {
    const ing = data.ingredientes.find((i) => i.id === linea.id_ingrediente);
    if (!ing) continue;
    const { gramos, sinPeso: falta } = gramosEfectivos(ing, linea.cantidad);
    if (falta) sinPeso.push(ing.nombre);
    detalle.push({ id_ingrediente: ing.id, nombre: ing.nombre, unidad: ing.unidad, gramos });
  }
  const totalGramos = detalle.reduce((acc, d) => acc + d.gramos, 0);
  const ingredientes: ComposicionIngrediente[] = detalle.map((d) => ({
    id_ingrediente: d.id_ingrediente,
    nombre: d.nombre,
    unidad: d.unidad,
    pctComposicion: totalGramos > 0 ? (d.gramos / totalGramos) * 100 : 0,
  }));
  return { id_producto: idProducto, componente, totalGramosPorCaja: totalGramos, ingredientes, ingredientesSinPesoConfigurado: sinPeso };
}

/** Reescala proporcionalmente las líneas de receta de un componente (masa o relleno) de un
 * gusto por un factor — usado cuando el usuario edita gramos_masa/relleno_por_caja en el
 * Bloque 3. Devuelve el array completo de recetas (no muta), para que quien lo llame pueda
 * simular el costo nuevo con calcCosto() antes de decidir si confirma el cambio. */
export function reescalarLineasComponente(
  data: RicordoData,
  idProducto: string,
  componente: "masa" | "relleno",
  factor: number
): RecetaLinea[] {
  return data.recetas.map((r) =>
    r.id_producto === idProducto && r.tipo === "Ingrediente" && r.componente === componente
      ? { ...r, cantidad: r.cantidad * factor }
      : r
  );
}

function cantidadNativaDeGramos(unidad: string, gramos: number): number {
  const u = normalizar(unidad);
  if (u === "kg" || u === "litro" || u === "l") return gramos / 1000;
  return gramos; // g/ml/unidad — se muestra tal cual (unidad tiene su propia conversión aparte)
}

/** Redondea a 3 decimales antes de aplicar ceil, para no llevar un 2,9999999 de punto flotante
 * a 3 cuando en realidad son exactamente 3 — "para arriba" porque siempre es mejor comprar de
 * más que quedarse corto en un ingrediente. */
export function redondearArribaPractico(cantidad: number): number {
  return Math.ceil(Math.round(cantidad * 1000) / 1000);
}

export interface NecesidadIngredienteDetalleGusto {
  id_producto: string;
  nombreProducto: string;
  gramosNecesarios: number;
}

export interface NecesidadIngredienteConsolidada {
  id_ingrediente: string;
  nombre: string;
  unidad: string;
  gramosTotales: number;
  /** Cantidad exacta (3 decimales) en la unidad propia del ingrediente. */
  cantidadNativa: number;
  /** "A comprar" — redondeada hacia arriba a la unidad entera práctica. */
  cantidadNativaRedondeada: number;
  /** Solo si la unidad es "unidad" y tiene peso_unitario_g: conversión gramos → unidades,
   * redondeada hacia arriba (ej. huevo). */
  unidadesConversion?: number;
  costoEstimado: number;
  detallePorGusto: NecesidadIngredienteDetalleGusto[];
}

export interface CuadroNecesidad {
  ingredientes: NecesidadIngredienteConsolidada[];
  costoTotal: number;
  /** Gustos con cajas planificadas > 0 pero sin ninguna línea clasificada de este componente
   * (ej. "Salsa" no tiene relleno clasificado todavía, o un gusto sin receta cargada). */
  gustosSinComposicion: string[];
}

/** Bloque 4: arma la Tabla A (masa/semana) o Tabla B (relleno/mes) según `componente`, a partir
 * de las cajas planificadas por gusto (ya sea cajas_semana o cajas_mes del plan guardado). */
export function calcularCuadroNecesidad(
  data: RicordoData,
  componente: "masa" | "relleno",
  cajasPorGusto: Map<string, number>
): CuadroNecesidad {
  const consolidado = new Map<string, NecesidadIngredienteConsolidada>();
  const gustosSinComposicion: string[] = [];

  for (const [idProducto, cajas] of cajasPorGusto) {
    if (cajas <= 0) continue;
    const producto = data.productos.find((p) => p.id === idProducto);
    if (!producto) continue;
    const composicion = calcularComposicionGusto(data, idProducto, componente);
    if (composicion.ingredientes.length === 0) {
      gustosSinComposicion.push(producto.nombre);
      continue;
    }
    const gramosPorCajaConfigurados = componente === "masa" ? producto.gramos_masa_por_caja : producto.gramos_relleno_por_caja;
    const gramosPorCaja = gramosPorCajaConfigurados ?? composicion.totalGramosPorCaja;
    const gramosNecesariosTotal = cajas * gramosPorCaja;

    for (const ing of composicion.ingredientes) {
      const gramosIngrediente = gramosNecesariosTotal * (ing.pctComposicion / 100);
      const existente = consolidado.get(ing.id_ingrediente);
      if (existente) {
        existente.gramosTotales += gramosIngrediente;
        existente.detallePorGusto.push({ id_producto: idProducto, nombreProducto: producto.nombre, gramosNecesarios: gramosIngrediente });
      } else {
        consolidado.set(ing.id_ingrediente, {
          id_ingrediente: ing.id_ingrediente,
          nombre: ing.nombre,
          unidad: ing.unidad,
          gramosTotales: gramosIngrediente,
          cantidadNativa: 0,
          cantidadNativaRedondeada: 0,
          costoEstimado: 0,
          detallePorGusto: [{ id_producto: idProducto, nombreProducto: producto.nombre, gramosNecesarios: gramosIngrediente }],
        });
      }
    }
  }

  const ingredientes: NecesidadIngredienteConsolidada[] = [];
  let costoTotal = 0;
  for (const item of consolidado.values()) {
    const ingredienteData = data.ingredientes.find((i) => i.id === item.id_ingrediente);
    const unidad = ingredienteData?.unidad ?? item.unidad;
    const cantidadNativa = Math.round(cantidadNativaDeGramos(unidad, item.gramosTotales) * 1000) / 1000;
    const esUnidad = normalizar(unidad) === "unidad";
    const unidadesConversion =
      esUnidad && ingredienteData?.peso_unitario_g ? Math.ceil(item.gramosTotales / ingredienteData.peso_unitario_g) : undefined;
    const cantidadNativaRedondeada = redondearArribaPractico(cantidadNativa);
    const costoEstimado = cantidadNativa * pvr(ingredienteData);
    costoTotal += costoEstimado;
    ingredientes.push({ ...item, cantidadNativa, cantidadNativaRedondeada, unidadesConversion, costoEstimado });
  }
  ingredientes.sort((a, b) => b.gramosTotales - a.gramosTotales);

  return { ingredientes, costoTotal, gustosSinComposicion };
}

/** Reparte las cajas planificadas de un gusto entre sus variantes de canal, según el peso de
 * ventas históricas de cada una (misma ventana de meses que el Bloque 1) — cada variante tiene
 * su propia receta, así que hace falta saber cuánto de la producción total corresponde a cada
 * una antes de calcular ingredientes. Si el gusto no tiene ventas históricas en ninguna
 * variante, todo se asigna al producto base (el canal por defecto). */
export function distribuirCajasPorVariante(
  data: RicordoData,
  idBase: string,
  cajasTotal: number,
  hoy: Date = new Date()
): Map<string, number> {
  const ventana = data.config_planificacion.ventana_meses_referencia;
  const variantes = data.productos.filter((p) => p.id_base === idBase && p.activo);
  const resultado = new Map<string, number>();
  if (variantes.length === 0) return resultado;

  const ventasPorVariante = variantes.map((v) => {
    let ventas = 0;
    for (let i = ventana; i >= 1; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      ventas += data.pedidos
        .filter((pe) => pe.id_producto === v.id && pe.estado !== "Cancelado" && inPeriod(pe.fecha, d.getMonth() + 1, d.getFullYear()))
        .reduce((acc, pe) => acc + pe.cantidad, 0);
    }
    return { id: v.id, ventas };
  });
  const totalVentas = ventasPorVariante.reduce((acc, v) => acc + v.ventas, 0);

  if (totalVentas <= 0) {
    const base = variantes.find((v) => v.id === idBase) ?? variantes[0];
    resultado.set(base.id, cajasTotal);
    return resultado;
  }
  for (const v of ventasPorVariante) {
    if (v.ventas <= 0) continue;
    resultado.set(v.id, cajasTotal * (v.ventas / totalVentas));
  }
  return resultado;
}

/** Envuelve calcularCuadroNecesidad() expandiendo las cajas planificadas por gusto (id_base) a
 * cajas por variante de canal antes de calcular — así cada variante sigue usando su propia
 * receta/composición, pero el plan se carga una sola vez por gusto (Bloque 2). */
export function calcularCuadroNecesidadPorGusto(
  data: RicordoData,
  componente: "masa" | "relleno",
  cajasPorGustoBase: Map<string, number>,
  hoy: Date = new Date()
): CuadroNecesidad {
  const cajasPorVariante = new Map<string, number>();
  for (const [idBase, cajas] of cajasPorGustoBase) {
    if (cajas <= 0) continue;
    for (const [idProducto, cajasVariante] of distribuirCajasPorVariante(data, idBase, cajas, hoy)) {
      cajasPorVariante.set(idProducto, (cajasPorVariante.get(idProducto) ?? 0) + cajasVariante);
    }
  }
  return calcularCuadroNecesidad(data, componente, cajasPorVariante);
}
