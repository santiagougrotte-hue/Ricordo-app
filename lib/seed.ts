/* eslint-disable @typescript-eslint/no-explicit-any -- adapter for loosely-typed legacy export data */
import { emptyData } from "./types";
import type { RicordoData } from "./types";
import { uid } from "./id";

/**
 * Maps the legacy Ricordo backup export (field names differ slightly from the
 * canonical ricordo_data schema) into RicordoData. Used to seed a fresh
 * install with the user's real historical data.
 */
export function mapBackupToRicordoData(backup: any): RicordoData {
  const d = emptyData();
  if (!backup) return d;

  const toBool = (v: any) => v === true || v === "Si" || v === "si";

  d.ingredientes = (backup.ingredientes ?? []).map((i: any) => ({
    id: i.id,
    nombre: i.nombre,
    unidad: i.unidad,
    categoria: i.categoria,
    precio_ref: i.precio_ref ?? 0,
    precio_vigente: i.precio_vigente ?? null,
    seguimiento_stock: false,
  }));

  d.packaging = (backup.packaging ?? []).map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    unidad: p.unidad,
    precio_ref: p.precio_ref ?? 0,
    precio_vigente: p.precio_vigente ?? null,
  }));

  d.productos = (backup.productos ?? []).map((p: any) => ({
    id: p.id,
    id_base: p.producto_base ?? p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    precio_venta: p.precio_venta ?? 0,
    activo: toBool(p.activo),
  }));

  // gustos: invert {gustoKey:{productos:[ids]}} plus each producto.gusto -> per-product array
  const gustos: Record<string, string[]> = {};
  for (const p of backup.productos ?? []) {
    if (p.gusto) {
      const g = backup.gustos?.[p.gusto]?.nombre ?? p.gusto;
      gustos[p.id] = [g];
    }
  }
  d.gustos = gustos;

  d.clientes = (backup.clientes ?? []).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    canal: (c.tipo ?? c.canal) === "Mayorista" ? "Mayorista" : "Minorista",
    direccion: c.direccion,
    telefono: c.telefono,
    email: c.email,
  }));

  d.proveedores = (backup.proveedores ?? []).map((p: any) => ({
    id: p.id,
    nombre: p.nombre,
    contacto: p.contacto,
    telefono: p.telefono,
    email: p.email,
    notas: p.rubro,
  }));

  // Algunos exports guardan, en las líneas de Packaging, el NOMBRE del packaging en vez de
  // su id (a diferencia de Ingrediente, que sí usa id) — sin esto, cada línea de Packaging
  // queda huérfana (no matchea contra ningún d.packaging.id) y su costo calcula siempre $0.
  const idPackagingPorNombre = new Map((backup.packaging ?? []).map((p: any) => [p.nombre, p.id]));
  const resolverConceptoPackaging = (r: any) =>
    r.tipo === "Packaging" && idPackagingPorNombre.has(r.concepto) ? idPackagingPorNombre.get(r.concepto) : r.concepto;

  // id_receta groups all lines of one producto's recipe under a single id in
  // some exports — generate a per-line id instead so each row stays unique.
  d.recetas = (backup.recetas ?? []).map((r: any) => ({
    id: uid("REC"),
    id_producto: r.id_producto,
    tipo: r.tipo,
    concepto: resolverConceptoPackaging(r),
    cantidad: r.cantidad ?? 0,
  }));

  const productoNombre = (id: string) =>
    (backup.productos ?? []).find((p: any) => p.id === id)?.nombre ?? id;
  const productoGusto = (id: string) =>
    (backup.productos ?? []).find((p: any) => p.id === id)?.gusto ?? undefined;

  d.pedidos = (backup.pedidos ?? []).map((p: any) => {
    // Two record shapes coexist in real exports: legacy (precio/subtotal/descuento/envio)
    // and canonical-ish (precio_unitario/precio_total/descuento_monto/precio_neto/km_envio).
    const esNuevoFormato = p.precio_unitario !== undefined || p.precio_total !== undefined;
    const precioUnitario = esNuevoFormato ? p.precio_unitario ?? 0 : p.precio ?? 0;
    const total = esNuevoFormato ? p.precio_total ?? precioUnitario * (p.cantidad ?? 0) : p.subtotal ?? p.precio * p.cantidad;
    const descuento = esNuevoFormato ? p.descuento_monto ?? 0 : p.descuento ?? 0;
    const neto = esNuevoFormato ? p.precio_neto ?? total - descuento : total - descuento;
    return {
      id_pedido: p.id_pedido,
      id_detalle: p.id_detalle ?? p.id_pedido,
      id_cliente: p.id_cliente,
      id_producto: p.id_producto,
      nombre_producto: p.nombre_producto ?? productoNombre(p.id_producto),
      gusto: p.gusto || productoGusto(p.id_producto),
      cantidad: p.cantidad ?? 0,
      precio_unitario: precioUnitario,
      precio_total: total,
      descuento_monto: descuento,
      precio_neto: neto,
      fecha: p.fecha,
      estado: p.estado ?? "Confirmado",
      canal: p.canal === "Mayorista" ? "Mayorista" : "Minorista",
      km_envio: p.km_envio ?? 0,
      costo_envio: p.envio ?? 0,
      metodo_pago: p.metodo_pago ?? p.metodoPago ?? p.medio_pago,
      notas: p.notas ?? p.observaciones,
    };
  });

  d.produccion = (backup.produccion ?? []).map((p: any) => ({
    id: p.id ?? uid("PRODLOG"),
    id_producto: p.id_producto,
    nombre_producto: productoNombre(p.id_producto),
    cantidad: p.cantidad ?? 0,
    fecha: p.fecha,
    notas: p.observacion ?? p.observaciones,
  }));

  // Backup stores 1 line-item per compra row; group into 1 Compra per row (single-line)
  const proveedorPorNombre = (nombre: string) =>
    (backup.proveedores ?? []).find((p: any) => p.nombre === nombre)?.id ?? "";

  d.compras = (backup.compras ?? []).map((c: any) => {
    // Some exports already group multiple line items per compra (lineas/lineasPkg),
    // others store one legacy row per line item (tipo/id_item/precio/cantidad).
    if (c.lineas || c.lineasPkg) {
      return {
        id: c.id,
        fecha: c.fecha,
        id_proveedor: c.id_proveedor ?? "",
        descripcion: c.descripcion,
        total: c.total ?? 0,
        total_manual: true,
        metodo_pago: c.metodo_pago,
        notas: c.notas,
        lineas: (c.lineas ?? []).map((l: any) => ({
          id_ingrediente: l.id_ingrediente,
          cantidad: l.cantidad ?? 0,
          precio_unitario: l.precio_unitario ?? 0,
        })),
        lineasPkg: (c.lineasPkg ?? []).map((l: any) => ({
          id_packaging: l.id_packaging,
          cantidad: l.cantidad ?? 0,
          precio_unitario: l.precio_unitario ?? 0,
        })),
        registrar_caja: false,
      };
    }
    const esIngrediente = c.tipo === "Ingrediente";
    return {
      id: c.id,
      fecha: c.fecha,
      id_proveedor: c.proveedor ? proveedorPorNombre(c.proveedor) : "",
      descripcion: c.item_nombre,
      total: c.subtotal ?? c.precio * c.cantidad,
      total_manual: false,
      metodo_pago: c.metodo_pago,
      notas: c.notas,
      lineas: esIngrediente
        ? [{ id_ingrediente: c.id_item, cantidad: c.cantidad ?? 0, precio_unitario: c.precio ?? 0 }]
        : [],
      lineasPkg: !esIngrediente
        ? [{ id_packaging: c.id_item, cantidad: c.cantidad ?? 0, precio_unitario: c.precio ?? 0 }]
        : [],
      registrar_caja: false,
    };
  });

  // precio_vigente on ingredientes/packaging = latest compra price for that item
  for (const c of d.compras) {
    for (const l of c.lineas) {
      const ing = d.ingredientes.find((i) => i.id === l.id_ingrediente);
      if (ing) ing.precio_vigente = l.precio_unitario;
    }
    for (const l of c.lineasPkg) {
      const pkg = d.packaging.find((p) => p.id === l.id_packaging);
      if (pkg) pkg.precio_vigente = l.precio_unitario;
    }
  }

  d.costos_fijos = (backup.costos_fijos ?? []).map((c: any) => ({
    id: c.id,
    descripcion: c.concepto ?? c.descripcion ?? "",
    monto: c.monto ?? 0,
    categoria: c.categoria ?? "General",
    activo: toBool(c.activo),
  }));

  d.costos_indirectos = (backup.costos_indirectos ?? []).map((c: any) => {
    const fecha = c.fecha ? new Date(c.fecha) : null;
    return {
      id: c.id,
      descripcion: c.descripcion ?? c.desc ?? c.sub ?? "",
      monto: c.monto ?? 0,
      mes: c.mes ?? (fecha ? fecha.getMonth() + 1 : new Date().getMonth() + 1),
      anio: c.anio ?? (fecha ? fecha.getFullYear() : new Date().getFullYear()),
      categoria: c.categoria ?? c.sub ?? "General",
      tipo_costo: c.tipo_costo === "Variable" ? "Variable" : "Fijo",
    };
  });

  d.gastos_operativos = (backup.gastos_operativos ?? []).map((g: any) => ({
    id: g.id,
    fecha: g.fecha,
    descripcion: g.descripcion,
    monto: g.monto ?? 0,
    categoria: g.categoria ?? "General",
  }));

  d.gastos_inversion = (backup.gastos_inversion ?? []).map((g: any) => ({
    id: g.id,
    fecha: g.fecha,
    descripcion: g.descripcion,
    monto: g.monto ?? 0,
    categoria: g.proveedor ?? "General",
  }));

  // Some exports reuse the same movement id across several line items (one per
  // ref) — disambiguate so React keys and lookups stay unique.
  const seenCajaIds = new Set<string>();
  d.caja_movimientos = (backup.caja_movimientos ?? []).map((m: any) => {
    let id = m.id ?? uid("CAJ");
    if (seenCajaIds.has(id)) id = `${id}-${m.ref ?? uid("X")}`;
    seenCajaIds.add(id);
    return {
      id,
      fecha: m.fecha,
      tipo: m.tipo,
      concepto: m.concepto ?? m.descripcion ?? m.categoria ?? "",
      monto: m.monto ?? 0,
      metodo: m.metodo ?? "Efectivo",
      ref: m.ref,
    };
  });

  d.transferencias_internas = (backup.transferencias_internas ?? []).map((t: any) => ({
    id: t.id ?? uid("TRF"),
    fecha: t.fecha,
    origen: t.origen,
    destino: t.destino,
    monto: t.monto ?? 0,
    descripcion: t.descripcion,
  }));

  d.historial_precios = (backup.historial_precios ?? []).map((h: any) => ({
    id: uid("HIST"),
    id_insumo: h.id_insumo ?? "",
    insumo: h.insumo ?? "",
    precio_anterior: h.precio_anterior ?? 0,
    precio_nuevo: h.precio_nuevo ?? 0,
    fecha: h.fecha,
  }));

  d.conteos_ingredientes = (backup.conteos_ingredientes ?? []).map((c: any) => ({
    id: c.id,
    id_ingrediente: c.id_ingrediente,
    cantidad: c.cantidad ?? 0,
    fecha: c.fecha,
    notas: c.observaciones,
  }));
  for (const c of d.conteos_ingredientes) {
    const ing = d.ingredientes.find((i) => i.id === c.id_ingrediente);
    if (ing) ing.seguimiento_stock = true;
  }

  const seenConteoIds = new Set<string>();
  d.conteos_stock = (backup.conteos_stock ?? []).map((c: any) => {
    let id = c.id ?? uid("CTK");
    if (seenConteoIds.has(id)) id = `${id}-${c.id_producto}`;
    seenConteoIds.add(id);
    return { id, id_producto: c.id_producto, cantidad: c.cantidad ?? 0, fecha: c.fecha };
  });

  // stock_manual: backup mixes {gusto: cantidad, gusto_fecha: date} pairs -> take most recent product per gusto match
  const stockManual: Record<string, number> = {};
  if (backup.stock_manual) {
    for (const [key, val] of Object.entries(backup.stock_manual)) {
      if (key.endsWith("_fecha")) continue;
      const prod = (backup.productos ?? []).find((p: any) => p.gusto === key && !p.producto_base);
      if (prod) stockManual[prod.id] = val as number;
    }
  }
  d.stock_manual = stockManual;

  d.saldo_anterior_caja = { valor: 0 };
  d.tipo_cambio = {
    valor: backup.tipo_cambio?.valor ?? 1000,
    fuente: backup.tipo_cambio?.fuente ?? "manual",
  };
  d.efectivo_en_mano = backup.efectivo_en_mano ?? 0;
  d.saldo_cmv_anterior = backup.saldo_cmv_anterior ?? 0;
  d.saldo_compras_anterior = backup.saldo_compras_anterior ?? 0;
  d.fecha_corte_cmv = backup.fecha_corte_cmv ?? null;
  d.fecha_corte_compras = backup.fecha_corte_compras ?? null;

  d.config_envios = {
    litro_nafta: backup.config_envios?.litro_nafta ?? 1200,
    consumo_100km: backup.config_envios?.consumo_100km ?? 7,
    margen_gratis: backup.config_envios?.margen_gratis ?? 65,
    margen_fijo: backup.config_envios?.margen_fijo ?? 60,
    margen_exacto: backup.config_envios?.margen_exacto ?? 55,
    precio_envio_fijo: backup.config_envios?.precio_envio_fijo ?? 2000,
  };

  if (backup.caja_inteligente) {
    d.caja_inteligente = {
      porcentaje_reinversion: backup.caja_inteligente.porcentaje_reinversion ?? 70,
      porcentaje_seguridad: backup.caja_inteligente.porcentaje_seguridad ?? 30,
      asignaciones: backup.caja_inteligente.asignaciones ?? [],
      usos_reinversion: backup.caja_inteligente.usos_reinversion ?? [],
      usos_seguridad: backup.caja_inteligente.usos_seguridad ?? [],
    };
  }

  return d;
}

/**
 * Repara datos ya guardados (locales o en Supabase) que vengan de una importación vieja con el
 * bug de arriba: líneas de receta de tipo Packaging cuyo concepto quedó como el NOMBRE del
 * packaging en vez de su id, y por lo tanto nunca matchean contra ningún Packaging real (el
 * costo de esa línea calcula siempre $0 sin importar qué precio tenga cargado el packaging).
 * Idempotente: si ya están todas con id, no cambia nada.
 */
export function repararConceptoPackagingEnRecetas(data: RicordoData): RicordoData {
  const idPorNombre = new Map(data.packaging.map((p) => [p.nombre, p.id]));
  const idsValidos = new Set(data.packaging.map((p) => p.id));
  let cambio = false;
  const recetas = data.recetas.map((r) => {
    if (r.tipo === "Packaging" && !idsValidos.has(r.concepto) && idPorNombre.has(r.concepto)) {
      cambio = true;
      return { ...r, concepto: idPorNombre.get(r.concepto)! };
    }
    return r;
  });
  return cambio ? { ...data, recetas } : data;
}
