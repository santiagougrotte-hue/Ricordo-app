// Motor de migración del esquema viejo (RicordoData, ./lib/types.ts) al esquema V2
// (RicordoDataV2, ./lib/types-v2.ts). Transform puro: no toca Supabase ni localStorage — recibe
// los datos ya cargados y devuelve el documento nuevo + un reporte. Se usa desde:
//  - la pantalla de reporte de migración (Configuración → Migración), que lo corre en modo
//    "solo mostrar" sobre los datos reales sin guardar nada;
//  - `lib/store.tsx`, que lo aplica de verdad al cargar datos (mismo mecanismo que
//    `repararConceptoPackagingEnRecetas`: transformar al leer, dejar que el guardado automático
//    persista el resultado).
//
// Regla general de todo este archivo: nunca se inventa un valor. Cuando una fuente es ambigua o
// dos fuentes se contradicen, el dato dudoso se preserva tal cual (o de ambas formas) y se agrega
// una entrada a `datos_pendientes_revision` explicando por qué — nunca se "corrige solo".

import type { RicordoData, Pedido as PedidoV1, Amortizacion } from "../types";
import {
  emptyDataV2,
  type RicordoDataV2,
  type RicordoDocument,
  type Categoria,
  type AmbitoCategoria,
  type Insumo,
  type ProductoVariante,
  type RevisionItem,
  type EtapaReceta,
  type MovimientoFinanciero,
} from "../types-v2";
import { uid } from "../id";

// --- Redondeo monetario ------------------------------------------------------------------------
// Todos los montos del esquema nuevo se guardan redondeados a peso entero (no centavos: no hay
// ningún caso de negocio con centavos hoy, y separar a centavos multiplicaría el alcance del
// cambio sin beneficio real). Esto también corrige de raíz bugs de punto flotante del import
// legacy (ej. `5000.099999999999`).
function money(n: number | null | undefined): number {
  return Math.round(n ?? 0);
}

// --- Reporte de migración ------------------------------------------------------------------------

export interface ReporteMigracion {
  /** Por sección: cuántos registros nuevos se generaron y cuántos registros viejos se
   * fusionaron en uno solo (ej. varias líneas de un mismo pedido → un pedido + N items). */
  conteos: Record<string, { migrados: number; fusionados: number }>;
  conflictos: RevisionItem[];
  referencias_faltantes: RevisionItem[];
  revision_manual: RevisionItem[];
  /** Total de datos_pendientes_revision (conflictos + faltantes + revision_manual juntos, en el
   * mismo formato en que quedan guardados en el documento). */
  todas: RevisionItem[];
}

function crearReporte(): {
  reporte: ReporteMigracion;
  contar: (seccion: string, migrados: number, fusionados?: number) => void;
  agregar: (lista: "conflictos" | "referencias_faltantes" | "revision_manual", item: Omit<RevisionItem, "id">) => void;
} {
  const reporte: ReporteMigracion = {
    conteos: {},
    conflictos: [],
    referencias_faltantes: [],
    revision_manual: [],
    todas: [],
  };
  return {
    reporte,
    contar(seccion, migrados, fusionados = 0) {
      reporte.conteos[seccion] = { migrados, fusionados };
    },
    agregar(lista, item) {
      const conId: RevisionItem = { id: uid("REV"), ...item };
      reporte[lista].push(conId);
      reporte.todas.push(conId);
    },
  };
}

// --- Categorías (vocabulario controlado nuevo) --------------------------------------------------
// Antes cada entidad repetía su categoría como texto libre (Producto.categoria,
// Ingrediente.categoria, CostoFijo.categoria, etc.) — acá se centraliza detrás de un id,
// memoizado por (nombre normalizado, ámbito) para no crear duplicados como "Verduras"/"verduras".

function crearFabricaCategorias() {
  const categorias: Categoria[] = [];
  const porClave = new Map<string, string>();
  function obtener(nombre: string | undefined | null, ambito: AmbitoCategoria): string | undefined {
    const limpio = (nombre ?? "").trim();
    if (!limpio) return undefined;
    const clave = `${ambito}:${limpio.toLowerCase()}`;
    const existente = porClave.get(clave);
    if (existente) return existente;
    const id = uid("CAT");
    categorias.push({ id, nombre: limpio, ambito, activo: true });
    porClave.set(clave, id);
    return id;
  }
  return { categorias, obtener };
}

// --- 1. Insumos = ingredientes ∪ packaging -------------------------------------------------------
// pvr() vive en lib/calc.ts pero es un solo `||` — se repite acá para no crear una dependencia
// circular (calc.ts va a pasar a depender del esquema V2 en la etapa 5).
function precioVigente(precio_vigente: number | null, precio_ref: number): number {
  return precio_vigente || precio_ref || 0;
}

function migrarInsumos(
  data: RicordoData,
  categorias: ReturnType<typeof crearFabricaCategorias>,
  agregar: ReturnType<typeof crearReporte>["agregar"]
): Insumo[] {
  const insumos: Insumo[] = [];

  for (const i of data.ingredientes) {
    const categoriaEsPackaging = (i.categoria ?? "").trim().toLowerCase() === "packaging";
    if (categoriaEsPackaging) {
      agregar("revision_manual", {
        seccion: "insumos",
        entidad_id: i.id,
        motivo: `Ingrediente "${i.nombre}" tenía categoría "Packaging" — se reclasificó a tipo packaging en vez de quedar como categoría de un ingrediente.`,
      });
    }
    insumos.push({
      id: i.id,
      nombre: i.nombre,
      tipo: categoriaEsPackaging ? "packaging" : "ingrediente",
      categoria_id: categoriaEsPackaging ? undefined : categorias.obtener(i.categoria, "insumo"),
      unidad: i.unidad,
      precio_actual: money(precioVigente(i.precio_vigente, i.precio_ref)),
      controla_stock: i.seguimiento_stock,
      stock_minimo: i.stock_minimo,
      peso_unitario_g: i.peso_unitario_g,
      activo: true,
    });
  }

  for (const p of data.packaging) {
    insumos.push({
      id: p.id,
      nombre: p.nombre,
      tipo: "packaging",
      unidad: p.unidad,
      precio_actual: money(precioVigente(p.precio_vigente, p.precio_ref)),
      controla_stock: false,
      activo: true,
    });
  }

  return insumos;
}

// --- 2. Historial de precios unificado -----------------------------------------------------------
// Se agrega una entrada inicial por insumo (su precio_ref original) + se preservan todas las
// entradas ya existentes. Se marca para revisión cualquier salto > 300% o < -70% entre dos
// entradas consecutivas del mismo insumo (heurística — nunca certeza; el pedido menciona
// huevos/puerro/psyllium/tinta de calamar como sospechosos, si el salto real es tan grande como
// parece, va a caer acá solo).
const SALTO_PRECIO_SOSPECHOSO_ARRIBA_PCT = 300;
const SALTO_PRECIO_SOSPECHOSO_ABAJO_PCT = -70;

function migrarHistorialPrecios(
  data: RicordoData,
  insumos: Insumo[],
  agregar: ReturnType<typeof crearReporte>["agregar"]
): RicordoDataV2["historial_precios"] {
  const historial: RicordoDataV2["historial_precios"] = [];
  const unidadPorInsumo = new Map(insumos.map((i) => [i.id, i.unidad]));

  for (const i of data.ingredientes) {
    historial.push({ id: uid("HIST"), insumo_id: i.id, fecha: data.fecha_corte_cmv ?? "", precio: money(i.precio_ref), unidad: i.unidad, origen_tipo: "importacion_inicial" });
  }
  for (const p of data.packaging) {
    historial.push({ id: uid("HIST"), insumo_id: p.id, fecha: data.fecha_corte_cmv ?? "", precio: money(p.precio_ref), unidad: p.unidad, origen_tipo: "importacion_inicial" });
  }
  for (const h of data.historial_precios) {
    historial.push({
      id: h.id,
      insumo_id: h.id_insumo,
      fecha: h.fecha,
      precio: money(h.precio_nuevo),
      unidad: unidadPorInsumo.get(h.id_insumo),
      origen_tipo: h.origen ?? "ajuste",
    });
  }

  const porInsumo = new Map<string, typeof historial>();
  for (const h of historial) {
    if (!h.fecha) continue;
    const lista = porInsumo.get(h.insumo_id) ?? [];
    lista.push(h);
    porInsumo.set(h.insumo_id, lista);
  }
  for (const [insumoId, entradas] of porInsumo) {
    entradas.sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (let idx = 1; idx < entradas.length; idx++) {
      const anterior = entradas[idx - 1].precio;
      const nuevo = entradas[idx].precio;
      if (anterior <= 0) continue;
      const variacionPct = ((nuevo - anterior) / anterior) * 100;
      if (variacionPct > SALTO_PRECIO_SOSPECHOSO_ARRIBA_PCT || variacionPct < SALTO_PRECIO_SOSPECHOSO_ABAJO_PCT) {
        agregar("revision_manual", {
          seccion: "historial_precios",
          entidad_id: insumoId,
          motivo: `Salto de precio de ${anterior} a ${nuevo} (${variacionPct.toFixed(0)}%) el ${entradas[idx].fecha} — puede ser un error de unidad, revisar a mano.`,
          detalle: { anterior, nuevo, fecha: entradas[idx].fecha },
        });
      }
    }
  }

  return historial;
}

// --- 3. Productos + producto_variantes -----------------------------------------------------------
// Parseo de nombre → canal/presentación/salsa: solo cubre los patrones que ya vimos en los datos
// de ejemplo. Cualquier nombre que no matchee queda con su texto tal cual en `presentacion` y
// entra a revisión — nunca se inventa una taxonomía nueva.
function derivarPresentacion(nombreVariante: string, nombreBase: string): { presentacion?: string; incluyeSalsa?: boolean; reconocido: boolean } {
  let resto = nombreVariante;
  if (resto.toLowerCase().startsWith(nombreBase.toLowerCase())) {
    resto = resto.slice(nombreBase.length).trim();
  }
  let incluyeSalsa: boolean | undefined;
  const sinSalsaMatch = /\bsin salsa\b/i;
  const conSalsaMatch = /\bcon salsa\b/i;
  if (sinSalsaMatch.test(resto)) {
    incluyeSalsa = false;
    resto = resto.replace(sinSalsaMatch, "").trim();
  } else if (conSalsaMatch.test(resto)) {
    incluyeSalsa = true;
    resto = resto.replace(conSalsaMatch, "").trim();
  }
  for (const palabra of [/\bminorista\b/i, /\bmayorista\b/i]) {
    resto = resto.replace(palabra, "").trim();
  }
  resto = resto.replace(/^[-—,\s]+|[-—,\s]+$/g, "").trim();
  const reconocido = resto === "" || /al vac[ií]o/i.test(nombreVariante) || incluyeSalsa !== undefined;
  return { presentacion: resto || undefined, incluyeSalsa, reconocido };
}

function migrarProductos(
  data: RicordoData,
  categorias: ReturnType<typeof crearFabricaCategorias>,
  agregar: ReturnType<typeof crearReporte>["agregar"]
): { productos: RicordoDataV2["productos"]; variantes: ProductoVariante[] } {
  const productos: RicordoDataV2["productos"] = [];
  const variantes: ProductoVariante[] = [];
  const idsBase = [...new Set(data.productos.map((p) => p.id_base))];

  for (const idBase of idsBase) {
    const baseOriginal = data.productos.find((p) => p.id === idBase);
    const variantesDelGrupo = data.productos.filter((p) => p.id_base === idBase);
    const nombreBase = baseOriginal?.nombre ?? variantesDelGrupo[0]?.nombre ?? idBase;
    if (!baseOriginal) {
      agregar("revision_manual", {
        seccion: "productos",
        entidad_id: idBase,
        motivo: `Ningún producto tiene id "${idBase}" pero es id_base de ${variantesDelGrupo.length} variante(s) — se usó el nombre de la primera variante ("${nombreBase}") como nombre del producto base.`,
      });
    }
    productos.push({
      id: idBase,
      nombre: nombreBase,
      categoria_id: categorias.obtener(baseOriginal?.categoria, "producto"),
      activo: baseOriginal?.activo ?? variantesDelGrupo.some((v) => v.activo),
    });

    for (const p of variantesDelGrupo) {
      const { presentacion, incluyeSalsa, reconocido } = derivarPresentacion(p.nombre, nombreBase);
      if (!reconocido) {
        agregar("revision_manual", {
          seccion: "producto_variantes",
          entidad_id: p.id,
          motivo: `No se pudo interpretar la presentación de "${p.nombre}" a partir de patrones conocidos (minorista/mayorista, con/sin salsa, al vacío) — quedó el texto tal cual en "presentacion".`,
        });
      }
      variantes.push({
        id: p.id,
        producto_id: idBase,
        nombre: p.nombre,
        canal: p.canal,
        presentacion,
        incluye_salsa: incluyeSalsa,
        unidades_por_paquete: p.unidades_por_paquete,
        precio_venta: money(p.precio_venta),
        activo: p.activo,
        gramos_masa_por_caja: p.gramos_masa_por_caja,
        gramos_relleno_por_caja: p.gramos_relleno_por_caja,
      });
    }
  }

  return { productos, variantes };
}

// --- 4. Recetas + receta_items + ajustes_receta_variante + complementos_variante -----------------

const ETAPA_POR_COMPONENTE: Record<string, EtapaReceta> = { masa: "masa", relleno: "relleno", packaging: "packaging" };

function migrarRecetas(
  data: RicordoData,
  productosV2: RicordoDataV2["productos"],
  agregar: ReturnType<typeof crearReporte>["agregar"]
): {
  recetas: RicordoDataV2["recetas"];
  receta_items: RicordoDataV2["receta_items"];
  ajustes_receta_variante: RicordoDataV2["ajustes_receta_variante"];
  complementos_variante: RicordoDataV2["complementos_variante"];
} {
  const recetas: RicordoDataV2["recetas"] = [];
  const receta_items: RicordoDataV2["receta_items"] = [];
  const ajustes_receta_variante: RicordoDataV2["ajustes_receta_variante"] = [];
  const complementos_variante: RicordoDataV2["complementos_variante"] = [];
  const insumoIds = new Set([...data.ingredientes.map((i) => i.id), ...data.packaging.map((p) => p.id)]);

  for (const productoV2 of productosV2) {
    const base = data.productos.find((p) => p.id === productoV2.id);
    const tieneRecetaBase = (base?.receta_masa_unidad?.length ?? 0) > 0 || (base?.receta_relleno_unidad?.length ?? 0) > 0;
    if (!base || !tieneRecetaBase) continue;

    const recetaId = uid("REC");
    recetas.push({ id: recetaId, producto_id: productoV2.id, nombre: `Receta de ${productoV2.nombre}`, activa: true });

    for (const linea of base.receta_masa_unidad ?? []) {
      if (!insumoIds.has(linea.id_ingrediente)) {
        agregar("referencias_faltantes", {
          seccion: "receta_items",
          entidad_id: linea.id,
          motivo: `Línea de masa de "${productoV2.nombre}" apunta al ingrediente "${linea.id_ingrediente}", que no existe en el catálogo actual.`,
        });
      }
      receta_items.push({ id: uid("RECI"), receta_id: recetaId, insumo_id: linea.id_ingrediente, etapa: "masa", cantidad: linea.cantidad });
    }
    for (const linea of base.receta_relleno_unidad ?? []) {
      if (!insumoIds.has(linea.id_ingrediente)) {
        agregar("referencias_faltantes", {
          seccion: "receta_items",
          entidad_id: linea.id,
          motivo: `Línea de relleno de "${productoV2.nombre}" apunta al ingrediente "${linea.id_ingrediente}", que no existe en el catálogo actual.`,
        });
      }
      receta_items.push({ id: uid("RECI"), receta_id: recetaId, insumo_id: linea.id_ingrediente, etapa: "relleno", cantidad: linea.cantidad });
    }

    // Variantes de esta familia: su RecetaLinea propia (modelo viejo) se trata distinto según el
    // tipo. Packaging (y Costo Fijo) siempre fueron propios de cada variante en la app vieja —
    // ni siquiera "conflictan", el modelo derivado nunca los incluía — así que se migran directo.
    // Ingrediente sí es la fuente vieja que la receta derivada reemplaza: si la variante ya está
    // migrada al modelo base/venta (tiene unidades_por_paquete), esas líneas son historial que
    // contradice la fuente nueva y se registra como conflicto en vez de fusionarlas a ciegas.
    const variantesDeEstaFamilia = data.productos.filter((p) => p.id_base === productoV2.id);
    for (const variante of variantesDeEstaFamilia) {
      const lineasViejas = data.recetas.filter((r) => r.id_producto === variante.id);
      if (lineasViejas.length === 0) continue;
      const estaMigrada = variante.unidades_por_paquete != null;
      const lineasIngrediente = lineasViejas.filter((l) => l.tipo === "Ingrediente");
      const lineasPackaging = lineasViejas.filter((l) => l.tipo === "Packaging");
      const lineasCostoFijo = lineasViejas.filter((l) => l.tipo === "CostoFijo");

      if (estaMigrada && lineasIngrediente.length > 0) {
        agregar("conflictos", {
          seccion: "recetas",
          entidad_id: variante.id,
          motivo: `"${variante.nombre}" tiene recetas de ingredientes por las dos vías: la derivada del producto base y ${lineasIngrediente.length} línea(s) de receta propia (modelo viejo). Se adoptó la receta derivada como la vigente en el esquema nuevo — revisar si las líneas viejas representan un ajuste real (cargarlo como ajuste_receta_variante) o son solo historial que ya no aplica.`,
          detalle: { lineas_viejas: lineasIngrediente.map((l) => ({ tipo: l.tipo, concepto: l.concepto, cantidad: l.cantidad })) },
        });
      }
      for (const linea of lineasPackaging) {
        if (!insumoIds.has(linea.concepto)) {
          agregar("referencias_faltantes", {
            seccion: "ajustes_receta_variante",
            entidad_id: linea.id,
            motivo: `Línea de packaging propia de "${variante.nombre}" apunta a "${linea.concepto}", que no existe en el catálogo actual.`,
          });
        }
        ajustes_receta_variante.push({ id: uid("AJR"), variante_id: variante.id, insumo_id: linea.concepto, operacion: "sumar", cantidad: linea.cantidad, etapa: "packaging" });
      }
      for (const linea of lineasCostoFijo) {
        agregar("revision_manual", {
          seccion: "receta_items",
          entidad_id: linea.id,
          motivo: `Línea de receta de "${variante.nombre}" es de tipo CostoFijo (${linea.concepto}) — el esquema nuevo no tiene un lugar directo para un costo fijo dentro de una receta; no se migró. Cargar manualmente como categoría en Finanzas si sigue aplicando.`,
        });
      }
    }

    for (const c of base.complementos ?? []) {
      complementos_variante.push({ id: uid("COMPV"), variante_id: base.id, producto_id: c.id_base, cantidad: c.cantidad });
    }
    for (const e of base.excepciones ?? []) {
      if (!insumoIds.has(e.concepto)) {
        agregar("referencias_faltantes", {
          seccion: "ajustes_receta_variante",
          entidad_id: e.id,
          motivo: `Excepción de "${productoV2.nombre}" apunta a "${e.concepto}", que no existe en el catálogo actual.`,
        });
      }
      ajustes_receta_variante.push({
        id: uid("AJR"),
        variante_id: base.id,
        insumo_id: e.concepto,
        operacion: "reemplazar",
        cantidad: e.cantidad,
        etapa: ETAPA_POR_COMPONENTE[e.grupo] ?? undefined,
      });
    }
  }

  // Variantes que NUNCA tuvieron receta derivada (no migradas al modelo base/venta en la app
  // vieja) — su RecetaLinea es la única fuente que existe, se migra como receta propia de esa
  // variante (Receta.producto_id acá referencia el id de la variante, no el del producto base:
  // es una receta que no se comparte con nadie más de la familia).
  const productoIdsConReceta = new Set(recetas.map((r) => r.producto_id));
  for (const variante of data.productos) {
    if (productoIdsConReceta.has(variante.id_base) && variante.id_base === variante.id) continue;
    const lineasPropias = data.recetas.filter((r) => r.id_producto === variante.id);
    if (lineasPropias.length === 0) continue;
    if (variante.unidades_por_paquete != null && productoIdsConReceta.has(variante.id_base)) continue; // ya cubierto arriba como conflicto

    const recetaId = uid("REC");
    recetas.push({ id: recetaId, producto_id: variante.id, nombre: `Receta de ${variante.nombre}`, activa: true });
    for (const linea of lineasPropias) {
      if (linea.tipo === "CostoFijo") {
        agregar("revision_manual", {
          seccion: "receta_items",
          entidad_id: linea.id,
          motivo: `Línea de receta de "${variante.nombre}" es de tipo CostoFijo (${linea.concepto}) — el esquema nuevo no tiene un lugar directo para un costo fijo dentro de una receta; no se migró. Cargar manualmente como categoría en Finanzas si sigue aplicando.`,
        });
        continue;
      }
      const insumoId = linea.concepto;
      if (!insumoIds.has(insumoId)) {
        agregar("referencias_faltantes", {
          seccion: "receta_items",
          entidad_id: linea.id,
          motivo: `Línea de receta de "${variante.nombre}" apunta a "${insumoId}", que no existe en el catálogo actual.`,
        });
      }
      const etapa: EtapaReceta = linea.componente ? ETAPA_POR_COMPONENTE[linea.componente] ?? "masa" : linea.tipo === "Packaging" ? "packaging" : "masa";
      receta_items.push({ id: uid("RECI"), receta_id: recetaId, insumo_id: insumoId, etapa, cantidad: linea.cantidad });
    }
  }

  return { recetas, receta_items, ajustes_receta_variante, complementos_variante };
}

// --- 5. Pedidos + pedido_items ---------------------------------------------------------------------

function migrarPedidos(
  data: RicordoData,
  variantesIds: Set<string>,
  agregar: ReturnType<typeof crearReporte>["agregar"]
): { pedidos: RicordoDataV2["pedidos"]; items: RicordoDataV2["pedido_items"] } {
  const pedidos: RicordoDataV2["pedidos"] = [];
  const items: RicordoDataV2["pedido_items"] = [];
  const porPedido = new Map<string, PedidoV1[]>();
  for (const linea of data.pedidos) {
    const grupo = porPedido.get(linea.id_pedido) ?? [];
    grupo.push(linea);
    porPedido.set(linea.id_pedido, grupo);
  }

  for (const [idPedido, lineas] of porPedido) {
    const primera = lineas[0];
    const camposCabecera: (keyof PedidoV1)[] = ["fecha", "id_cliente", "canal", "metodo_pago", "estado", "costo_envio"];
    for (const campo of camposCabecera) {
      const distintos = new Set(lineas.map((l) => JSON.stringify(l[campo] ?? null)));
      if (distintos.size > 1) {
        agregar("conflictos", {
          seccion: "pedidos",
          entidad_id: idPedido,
          motivo: `Las líneas del pedido ${idPedido} no coinciden en "${campo}" — se usó el valor de la primera línea.`,
          detalle: { valores: lineas.map((l) => l[campo]) },
        });
      }
    }
    if (!primera.metodo_pago) {
      agregar("revision_manual", { seccion: "pedidos", entidad_id: idPedido, motivo: `Pedido ${idPedido} sin método de pago cargado.` });
    }

    let totalDescuento = 0;
    let totalNeto = 0;
    for (const l of lineas) {
      if (!variantesIds.has(l.id_producto)) {
        agregar("referencias_faltantes", {
          seccion: "pedido_items",
          entidad_id: l.id_detalle,
          motivo: `Línea ${l.id_detalle} del pedido ${idPedido} apunta al producto "${l.id_producto}" (${l.nombre_producto}), que no existe en el catálogo actual.`,
        });
      }
      if (l.precio_total === 0) {
        agregar("revision_manual", { seccion: "pedido_items", entidad_id: l.id_detalle, motivo: `Línea ${l.id_detalle} del pedido ${idPedido} tiene importe $0.` });
      }
      if (l.precio_neto < 0) {
        agregar("revision_manual", { seccion: "pedido_items", entidad_id: l.id_detalle, motivo: `Línea ${l.id_detalle} del pedido ${idPedido} tiene neto negativo ($${l.precio_neto}).` });
      }
      if (money(l.precio_total) !== money(l.descuento_monto) + money(l.precio_neto)) {
        agregar("conflictos", {
          seccion: "pedido_items",
          entidad_id: l.id_detalle,
          motivo: `Línea ${l.id_detalle}: total (${l.precio_total}) no coincide con descuento + neto (${l.descuento_monto} + ${l.precio_neto}).`,
        });
      }
      totalDescuento += l.descuento_monto;
      totalNeto += l.precio_neto;
      items.push({
        id: l.id_detalle,
        pedido_id: idPedido,
        producto_variante_id: variantesIds.has(l.id_producto) ? l.id_producto : null,
        nombre_historico: l.nombre_producto,
        cantidad: l.cantidad,
        precio_unitario: money(l.precio_unitario),
        descuento: money(l.descuento_monto),
        subtotal: money(l.precio_neto),
      });
    }

    pedidos.push({
      id: idPedido,
      fecha: primera.fecha,
      cliente_id: primera.id_cliente,
      estado: primera.estado,
      canal: primera.canal,
      metodo_pago: primera.metodo_pago,
      descuento: money(totalDescuento),
      costo_envio: money(primera.costo_envio),
      total: money(totalNeto),
      notas: lineas.map((l) => l.notas).filter(Boolean).join(" · ") || undefined,
      adjunto: primera.adjunto,
    });
  }

  return { pedidos, items };
}

// --- 6. Compras + compra_items -----------------------------------------------------------------

function migrarCompras(
  data: RicordoData,
  insumoIds: Set<string>,
  agregar: ReturnType<typeof crearReporte>["agregar"]
): { compras: RicordoDataV2["compras"]; items: RicordoDataV2["compra_items"] } {
  const compras: RicordoDataV2["compras"] = [];
  const items: RicordoDataV2["compra_items"] = [];

  for (const c of data.compras) {
    compras.push({
      id: c.id,
      fecha: c.fecha,
      proveedor_id: c.id_proveedor,
      descripcion: c.descripcion,
      estado_pago: "pagado",
      metodo_pago: c.metodo_pago,
      total: money(c.total),
      notas: c.notas,
      adjunto: c.adjunto,
    });
    for (const l of c.lineas) {
      if (!insumoIds.has(l.id_ingrediente)) {
        agregar("referencias_faltantes", { seccion: "compra_items", entidad_id: c.id, motivo: `Compra ${c.id} tiene una línea de ingrediente "${l.id_ingrediente}" que no existe en el catálogo actual.` });
      }
      items.push({ id: uid("CI"), compra_id: c.id, insumo_id: l.id_ingrediente, cantidad: l.cantidad, precio_unitario: money(l.precio_unitario), subtotal: money(l.cantidad * l.precio_unitario) });
    }
    for (const l of c.lineasPkg) {
      if (!insumoIds.has(l.id_packaging)) {
        agregar("referencias_faltantes", { seccion: "compra_items", entidad_id: c.id, motivo: `Compra ${c.id} tiene una línea de packaging "${l.id_packaging}" que no existe en el catálogo actual.` });
      }
      items.push({ id: uid("CI"), compra_id: c.id, insumo_id: l.id_packaging, cantidad: l.cantidad, precio_unitario: money(l.precio_unitario), subtotal: money(l.cantidad * l.precio_unitario) });
    }
  }

  return { compras, items };
}

// --- 7. Inventario: libro único de movimientos ---------------------------------------------------
// El stock se reconstruye 100% a partir de este libro (ver `lib/calc.ts` en la etapa 5): un
// movimiento tipo "conteo" resetea el saldo conocido a esa fecha, todo lo demás sirve o resta.

function migrarInventario(data: RicordoData, agregar: ReturnType<typeof crearReporte>["agregar"]): RicordoDataV2["inventario_movimientos"] {
  const movimientos: RicordoDataV2["inventario_movimientos"] = [];

  for (const c of data.compras) {
    for (const l of c.lineas) {
      movimientos.push({ id: uid("MOV"), fecha: c.fecha, tipo: "compra", origen_tipo: "compra", origen_id: c.id, item_tipo: "insumo", item_id: l.id_ingrediente, cantidad: l.cantidad });
    }
    for (const l of c.lineasPkg) {
      movimientos.push({ id: uid("MOV"), fecha: c.fecha, tipo: "compra", origen_tipo: "compra", origen_id: c.id, item_tipo: "insumo", item_id: l.id_packaging, cantidad: l.cantidad });
    }
  }

  for (const prod of data.produccion) {
    movimientos.push({ id: uid("MOV"), fecha: prod.fecha, tipo: "produccion", origen_tipo: "produccion", origen_id: prod.id, item_tipo: "producto_variante", item_id: prod.id_producto, cantidad: prod.cantidad });
    const consumo = data.recetas.filter((r) => r.id_producto === prod.id_producto && r.tipo === "Ingrediente");
    for (const rl of consumo) {
      movimientos.push({
        id: uid("MOV"),
        fecha: prod.fecha,
        tipo: "consumo",
        origen_tipo: "produccion",
        origen_id: prod.id,
        item_tipo: "insumo",
        item_id: rl.concepto,
        cantidad: -(rl.cantidad * prod.cantidad),
      });
    }
  }

  for (const p of data.pedidos) {
    if (p.estado !== "Entregado") continue;
    movimientos.push({ id: uid("MOV"), fecha: p.fecha, tipo: "venta", origen_tipo: "pedido", origen_id: p.id_detalle, item_tipo: "producto_variante", item_id: p.id_producto, cantidad: -p.cantidad });
  }

  for (const c of data.conteos_ingredientes) {
    movimientos.push({ id: uid("MOV"), fecha: c.fecha, tipo: "conteo", origen_tipo: "conteo_manual", origen_id: c.id, item_tipo: "insumo", item_id: c.id_ingrediente, cantidad: c.cantidad, notas: c.notas });
  }
  for (const c of data.conteos_stock) {
    movimientos.push({ id: uid("MOV"), fecha: c.fecha, tipo: "conteo", origen_tipo: "conteo_manual", origen_id: c.id, item_tipo: "producto_variante", item_id: c.id_producto, cantidad: c.cantidad });
  }

  const fechaMigracion = new Date().toISOString().slice(0, 10);
  for (const [idProducto, cantidad] of Object.entries(data.stock_manual)) {
    movimientos.push({ id: uid("MOV"), fecha: fechaMigracion, tipo: "ajuste", origen_tipo: "stock_manual_legacy", item_tipo: "producto_variante", item_id: idProducto, cantidad, notas: "Migrado de stock_manual — el dato viejo no tenía fecha propia, se usó la fecha de migración." });
    agregar("revision_manual", {
      seccion: "inventario_movimientos",
      entidad_id: idProducto,
      motivo: `El stock manual de "${idProducto}" no tenía fecha en el esquema viejo — se registró como ajuste a la fecha de migración (${fechaMigracion}). Revisar si corresponde a otra fecha.`,
    });
  }

  return movimientos;
}

// --- 8. Finanzas: movimientos_financieros + activos ------------------------------------------------

function migrarFinanzas(
  data: RicordoData,
  categorias: ReturnType<typeof crearFabricaCategorias>,
  agregar: ReturnType<typeof crearReporte>["agregar"]
): { movimientos: MovimientoFinanciero[]; activos: RicordoDataV2["activos"] } {
  const movimientos: MovimientoFinanciero[] = [];

  for (const m of data.caja_movimientos) {
    movimientos.push({ id: m.id, fecha: m.fecha, tipo: m.tipo, concepto: m.concepto, monto: money(m.monto), metodo_pago: m.metodo, origen_tipo: "caja_movimiento_legacy", origen_id: m.ref, estado: "confirmado" });
  }
  for (const t of data.transferencias_internas) {
    movimientos.push({
      id: t.id,
      fecha: t.fecha,
      tipo: "transferencia",
      concepto: t.descripcion || "Transferencia interna",
      monto: money(t.monto),
      cuenta_origen_id: t.origen,
      cuenta_destino_id: t.destino,
      estado: "confirmado",
    });
  }

  if (data.costos_fijos.length > 0) {
    agregar("revision_manual", {
      seccion: "movimientos_financieros",
      motivo: `${data.costos_fijos.length} costo(s) fijo(s) migrado(s) como un solo movimiento cada uno (no una serie mensual histórica): el esquema viejo no guardaba una fecha de alta, así que no hay forma cierta de reconstruir desde cuándo estuvo activo cada uno mes a mes.`,
    });
  }
  for (const cf of data.costos_fijos) {
    movimientos.push({
      id: cf.id,
      fecha: new Date().toISOString().slice(0, 10),
      tipo: "egreso",
      categoria_id: categorias.obtener(`Costo Fijo — ${cf.categoria}`, "financiero"),
      concepto: cf.descripcion,
      monto: money(cf.monto),
      estado: cf.activo ? "confirmado" : "pendiente",
    });
  }

  for (const ci of data.costos_indirectos) {
    const fecha = `${ci.anio}-${String(ci.mes).padStart(2, "0")}-01`;
    movimientos.push({
      id: ci.id,
      fecha,
      tipo: "egreso",
      categoria_id: categorias.obtener(`Costo Indirecto — ${ci.tipo_costo}`, "financiero"),
      concepto: ci.descripcion,
      monto: money(ci.monto),
      estado: "confirmado",
    });
  }

  for (const g of data.gastos_operativos) {
    movimientos.push({
      id: g.id,
      fecha: g.fecha,
      tipo: "egreso",
      categoria_id: categorias.obtener(`Gasto Operativo — ${g.categoria}`, "financiero"),
      concepto: g.descripcion,
      monto: money(g.monto),
      estado: "confirmado",
    });
  }

  const activos: RicordoDataV2["activos"] = [];
  for (const a of data.amortizaciones) {
    activos.push({
      id: a.id,
      nombre: a.nombre,
      categoria_id: categorias.obtener("Amortización", "financiero"),
      fecha_compra: a.fecha_inicio,
      costo: money(a.precio_total),
      vida_util_meses: a.meses_totales,
      amortizacion_mensual: money(cuotaMensual(a)),
      activo: true,
    });
  }
  if (data.gastos_inversion.length > 0) {
    agregar("revision_manual", {
      seccion: "activos",
      motivo: `${data.gastos_inversion.length} registro(s) de "gastos_inversion" migrados a Activos — este campo no tenía ninguna pantalla ni cálculo que lo leyera en la app vieja, revisar si siguen aplicando.`,
    });
    for (const g of data.gastos_inversion) {
      activos.push({ id: g.id, nombre: g.descripcion, categoria_id: categorias.obtener(`Gasto de Inversión (legacy) — ${g.categoria}`, "financiero"), fecha_compra: g.fecha, costo: money(g.monto), vida_util_meses: 0, amortizacion_mensual: 0, activo: false });
    }
  }

  return { movimientos, activos };
}

function cuotaMensual(a: Amortizacion): number {
  return a.meses_totales > 0 ? a.precio_total / a.meses_totales : 0;
}

// --- Función principal ---------------------------------------------------------------------------

export function migrarAV2(data: RicordoData): { documento: RicordoDocument; reporte: ReporteMigracion } {
  const { reporte, contar, agregar } = crearReporte();
  const categorias = crearFabricaCategorias();

  const insumos = migrarInsumos(data, categorias, agregar);
  contar("insumos", insumos.length, 0);
  const insumoIds = new Set(insumos.map((i) => i.id));

  const historial_precios = migrarHistorialPrecios(data, insumos, agregar);
  contar("historial_precios", historial_precios.length, 0);

  const { productos, variantes } = migrarProductos(data, categorias, agregar);
  contar("productos", productos.length, 0);
  contar("producto_variantes", variantes.length, 0);
  const variantesIds = new Set(variantes.map((v) => v.id));

  const { recetas, receta_items, ajustes_receta_variante, complementos_variante } = migrarRecetas(data, productos, agregar);
  contar("recetas", recetas.length, 0);
  contar("receta_items", receta_items.length, 0);

  const { pedidos, items: pedido_items } = migrarPedidos(data, variantesIds, agregar);
  contar("pedidos", pedidos.length, data.pedidos.length - pedido_items.length);

  const { compras, items: compra_items } = migrarCompras(data, insumoIds, agregar);
  contar("compras", compras.length, 0);
  contar("compra_items", compra_items.length, 0);

  const inventario_movimientos = migrarInventario(data, agregar);
  contar("inventario_movimientos", inventario_movimientos.length, 0);

  const { movimientos: movimientos_financieros, activos } = migrarFinanzas(data, categorias, agregar);
  const fusionadosFinanzas = data.costos_fijos.length + data.costos_indirectos.length + data.gastos_operativos.length + data.caja_movimientos.length + data.transferencias_internas.length;
  contar("movimientos_financieros", movimientos_financieros.length, fusionadosFinanzas > movimientos_financieros.length ? fusionadosFinanzas - movimientos_financieros.length : 0);
  contar("activos", activos.length, 0);

  const produccion: RicordoDataV2["produccion"] = data.produccion.map((p) => {
    if (!variantesIds.has(p.id_producto)) {
      agregar("referencias_faltantes", { seccion: "produccion", entidad_id: p.id, motivo: `Producción ${p.id} apunta al producto "${p.id_producto}" (${p.nombre_producto}), que no existe en el catálogo actual.` });
    }
    return { id: p.id, producto_variante_id: p.id_producto, cantidad: p.cantidad, fecha: p.fecha, notas: p.notas };
  });
  contar("produccion", produccion.length, 0);

  const plan_produccion: RicordoDataV2["plan_produccion"] = data.plan_produccion.map((pp) => ({
    id: pp.id,
    mes: pp.mes,
    anio: pp.anio,
    producto_id: pp.id_base,
    cajas_mes: pp.cajas_mes,
    cajas_semana: pp.cajas_semana,
    fecha_guardado: pp.fecha_guardado,
  }));

  const legacy: Record<string, unknown> = {};
  function esVacio(v: unknown): boolean {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "object") return Object.values(v).every(esVacio);
    return false;
  }
  const camposTemporales: [string, unknown][] = [
    ["af_elasticidades", data.af_elasticidades],
    ["af_cap_trabajo", data.af_cap_trabajo],
    ["af_payback_items", data.af_payback_items],
    ["ia_log", data.ia_log],
    ["pulso", data.pulso],
    ["borrador_compra_pendiente", data.borrador_compra_pendiente],
    ["gustos", data.gustos],
  ];
  for (const [clave, valor] of camposTemporales) {
    if (!esVacio(valor)) legacy[clave] = valor;
  }

  const documento: RicordoDocument = {
    schema_version: 2,
    metadata: { migrado_en: new Date().toISOString(), desde_version: 1 },
    data: {
      ...emptyDataV2(),
      categorias: categorias.categorias,
      clientes: data.clientes,
      pedidos,
      pedido_items,
      productos,
      producto_variantes: variantes,
      recetas,
      receta_items,
      ajustes_receta_variante,
      complementos_variante,
      insumos,
      inventario_movimientos,
      historial_precios,
      compras,
      compra_items,
      proveedores: data.proveedores,
      produccion,
      plan_produccion,
      movimientos_financieros,
      activos,
      configuracion: {
        envios: data.config_envios,
        planificacion: data.config_planificacion,
        umbral_dias_mayorista_riesgo: data.umbral_dias_mayorista_riesgo,
        umbral_compras_consumo_amber: data.umbral_compras_consumo_amber,
        umbral_compras_consumo_red: data.umbral_compras_consumo_red,
        umbral_stock_bajo_producto: data.umbral_stock_bajo_producto,
        tipo_cambio: data.tipo_cambio,
        saldo_inicial_cmv: money(data.saldo_cmv_anterior),
        saldo_inicial_compras: money(data.saldo_compras_anterior),
        fecha_corte_cmv: data.fecha_corte_cmv,
        fecha_corte_compras: data.fecha_corte_compras,
        saldo_inicial_caja: money(data.saldo_anterior_caja?.valor),
        efectivo_en_mano: money(data.efectivo_en_mano),
        conciliacion_ignorados: data.conciliacion_ignorados,
        // `data` puede venir de un backup crudo más viejo que estos dos campos (agregados
        // después) — se completan acá en vez de confiar en que ya estén, ver mismo criterio en
        // store-v2.tsx (comoV2).
        caja_inteligente: { ...data.caja_inteligente, distribuciones: data.caja_inteligente.distribuciones ?? [], cargas_historicas: data.caja_inteligente.cargas_historicas ?? [] },
        // No existía en el esquema v1 — arranca vacío, es una decisión manual del usuario.
        fondo_reposicion: { aportes: [], usos: [] },
      },
      datos_pendientes_revision: reporte.todas,
      legacy,
    },
  };

  // Normaliza a través de un ciclo JSON: garantiza que exportar (stringify) e importar (parse)
  // este documento da exactamente el mismo resultado (sin claves `undefined` que desaparecerían
  // recién en el primer export real, fuera de este módulo).
  return { documento: JSON.parse(JSON.stringify(documento)) as RicordoDocument, reporte };
}
