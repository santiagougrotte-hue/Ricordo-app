// Esquema V2 de Ricordo — mismo documento único por negocio (una fila en Supabase, `app_state`),
// reordenado en forma normalizada (arrays de registros que se referencian por id, sin tablas
// Postgres reales). Reemplaza gradualmente `RicordoData` (./types.ts): ver `lib/migration/v2.ts`
// para el motor que transforma el esquema viejo a este, y el plan de refactor para el contexto
// completo de por qué (nombres duplicados que eran variantes de un solo producto, dos fuentes de
// receta desincronizadas, costos fijos/indirectos/operativos que eran la misma cosa clasificada
// distinto, saldos "de arrastre" sueltos por toda la app).

import type { Adjunto, Cliente, Proveedor, CajaInteligente } from "./types";

export type Canal = "Minorista" | "Mayorista";
export type EstadoPedido = "Confirmado" | "Produccion" | "Entregado" | "Cancelado";
export type TipoInsumo = "ingrediente" | "packaging";
export type EtapaReceta = "masa" | "relleno" | "salsa" | "terminacion" | "packaging";
export type TipoInventarioMovimiento = "compra" | "produccion" | "consumo" | "venta" | "conteo" | "ajuste" | "merma";
export type TipoMovimientoFinanciero = "ingreso" | "egreso" | "transferencia";
export type EstadoMovimientoFinanciero = "confirmado" | "pendiente";
export type OperacionAjusteReceta = "sumar" | "restar" | "reemplazar";
export type EstadoPagoCompra = "pagado" | "pendiente";
export type AmbitoCategoria = "producto" | "insumo" | "financiero";

/** Vocabulario controlado nuevo — reemplaza los strings libres de categoría que hoy tiene cada
 * entidad (Producto.categoria, Ingrediente.categoria, CostoFijo/CostoIndirecto/GastoOperativo
 * .categoria), unificados detrás de un id en vez de repetir el texto en cada registro. */
export interface Categoria {
  id: string;
  nombre: string;
  ambito: AmbitoCategoria;
  activo: boolean;
}

// --- Ventas -----------------------------------------------------------------------------------

/** Cabecera del pedido — antes cada línea de detalle duplicaba fecha/cliente/canal/método de
 * pago; ahora esos datos viven una sola vez por pedido. */
export interface Pedido {
  id: string;
  fecha: string;
  cliente_id: string;
  estado: EstadoPedido;
  canal: Canal;
  metodo_pago?: string;
  descuento: number;
  costo_envio: number;
  total: number;
  notas?: string;
  adjunto?: Adjunto;
}

/** Línea de un pedido. `producto_variante_id` puede ser null si la línea vieja no matcheaba
 * ningún producto vigente al migrar (queda marcada en `datos_pendientes_revision`, nunca se
 * inventa una referencia). `nombre_historico`/`precio_unitario` se preservan tal como estaban en
 * el momento de la venta aunque el producto cambie de nombre o precio después. */
export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_variante_id: string | null;
  nombre_historico: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
}

// --- Productos --------------------------------------------------------------------------------

/** Producto base (el "sabor"/familia) — dueño de la receta compartida. Reemplaza el uso de
 * `Producto.id === Producto.id_base` del esquema viejo como forma implícita de marcar "soy la
 * base de mi familia". */
export interface Producto {
  id: string;
  nombre: string;
  categoria_id?: string;
  activo: boolean;
  foto?: Adjunto;
}

/** Presentación comercial de un producto base — antes era "otro Producto más" con su propia
 * receta que se desincronizaba de las demás variantes; ahora solo guarda cómo difiere del
 * envase/canal, y hereda la receta de `producto_id` vía `recetas`/`receta_items` +
 * `ajustes_receta_variante`. */
export interface ProductoVariante {
  id: string;
  producto_id: string;
  nombre: string;
  canal?: Canal;
  presentacion?: string;
  incluye_salsa?: boolean;
  unidades_por_paquete?: number;
  precio_venta: number;
  activo: boolean;
  gramos_masa_por_caja?: number;
  gramos_relleno_por_caja?: number;
}

// --- Recetas ------------------------------------------------------------------------------------

/** Una sola receta por producto base — reemplaza la coexistencia de `receta_masa_unidad` /
 * `receta_relleno_unidad` (modelo nuevo) y `RecetaLinea` por producto (modelo viejo) como dos
 * fuentes que podían contradecirse. */
export interface Receta {
  id: string;
  producto_id: string;
  nombre: string;
  rendimiento?: number;
  unidad_rendimiento?: string;
  activa: boolean;
}

export interface RecetaItem {
  id: string;
  receta_id: string;
  insumo_id: string;
  etapa: EtapaReceta;
  cantidad: number;
  unidad?: string;
}

/** Override puntual de una variante sobre la receta heredada del producto base — reemplaza
 * `ExcepcionLinea` (que reemplaza la cantidad calculada de esa línea). `operacion: "reemplazar"`
 * es el caso de uso principal (equivalente a la excepción vieja); "sumar"/"restar" quedan
 * disponibles para ajustes aditivos que hoy no existen pero el nuevo modelo ya soporta sin
 * cambios de esquema. */
export interface AjusteRecetaVariante {
  id: string;
  variante_id: string;
  insumo_id: string;
  operacion: OperacionAjusteReceta;
  cantidad: number;
  etapa?: EtapaReceta;
}

/** Complementos (ej. una porción de salsa de OTRO producto base, con su propia cantidad,
 * independiente de `unidades_por_paquete`) no son un ajuste a nivel insumo — apuntan a la receta
 * completa de otro producto. Se modelan aparte de `AjusteRecetaVariante` (que es insumo a
 * insumo) para no forzar una relación producto→insumo donde no la hay. Decisión de diseño, no de
 * negocio: no estaba explícito en el pedido original, se agrega para no perder este caso. */
export interface ComplementoVariante {
  id: string;
  variante_id: string;
  producto_id: string;
  cantidad: number;
}

// --- Insumos / Inventario ------------------------------------------------------------------------

/** Fusión de Ingrediente + Packaging — mismo campo de precio (precio_actual, con historial en
 * `historial_precios`), distinguidos por `tipo`. */
export interface Insumo {
  id: string;
  nombre: string;
  tipo: TipoInsumo;
  categoria_id?: string;
  unidad: string;
  precio_actual: number;
  controla_stock: boolean;
  stock_minimo?: number;
  /** Solo aplica a insumos comprados por unidad que pesan (ej. huevo) — igual que en el esquema
   * viejo, usado por Planificación para escalar por peso. */
  peso_unitario_g?: number;
  activo: boolean;
}

/** Libro único de movimientos de inventario — el stock de cualquier insumo o producto terminado
 * se calcula sumando estos movimientos, nunca se guarda como saldo aparte. Un ajuste manual es
 * un movimiento tipo "ajuste", auditable, no un número suelto tipo `stock_manual`. */
export interface InventarioMovimiento {
  id: string;
  fecha: string;
  tipo: TipoInventarioMovimiento;
  /** Qué operación generó este movimiento (compra, produccion, pedido, conteo, manual) — junto
   * con `origen_id` da trazabilidad completa hacia el registro que lo originó. */
  origen_tipo?: string;
  origen_id?: string;
  item_tipo: "insumo" | "producto_variante";
  item_id: string;
  /** Signo: positivo entra al stock, negativo sale. */
  cantidad: number;
  unidad?: string;
  notas?: string;
}

export interface HistorialPrecio {
  id: string;
  insumo_id: string;
  fecha: string;
  precio: number;
  unidad?: string;
  origen_tipo?: string;
  origen_id?: string;
}

// --- Operaciones: Compras / Proveedores / Producción --------------------------------------------

export interface CompraItem {
  id: string;
  compra_id: string;
  insumo_id: string;
  cantidad: number;
  unidad?: string;
  precio_unitario: number;
  subtotal: number;
}

export interface Compra {
  id: string;
  fecha: string;
  proveedor_id: string;
  descripcion?: string;
  estado_pago: EstadoPagoCompra;
  metodo_pago?: string;
  total: number;
  notas?: string;
  adjunto?: Adjunto;
}

export interface Produccion {
  id: string;
  producto_variante_id: string;
  cantidad: number;
  fecha: string;
  notas?: string;
}

export interface PlanProduccionMes {
  id: string;
  mes: number;
  anio: number;
  producto_id: string;
  cajas_mes: number;
  cajas_semana: number;
  fecha_guardado: string;
}

// --- Finanzas -------------------------------------------------------------------------------------

/** Unifica caja_movimientos, transferencias_internas, costos_fijos, costos_indirectos y
 * gastos_operativos: todos son, en el fondo, un movimiento de plata con tipo + categoría, no
 * módulos de datos separados. Un costo fijo recurrente se migra a un movimiento por cada mes en
 * que estuvo activo (ver `lib/migration/v2.ts`), no a un registro "vivo" que se recalcula. */
export interface MovimientoFinanciero {
  id: string;
  fecha: string;
  tipo: TipoMovimientoFinanciero;
  categoria_id?: string;
  concepto: string;
  monto: number;
  metodo_pago?: string;
  /** Solo tienen sentido para tipo "transferencia" (entre cuentas propias). */
  cuenta_origen_id?: string;
  cuenta_destino_id?: string;
  origen_tipo?: string;
  origen_id?: string;
  estado: EstadoMovimientoFinanciero;
  notas?: string;
}

/** Fusiona Amortizacion + GastoInversion (este último nunca tuvo pantalla ni lógica que lo
 * leyera — ver reporte de migración). */
export interface Activo {
  id: string;
  nombre: string;
  categoria_id?: string;
  fecha_compra: string;
  costo: number;
  vida_util_meses: number;
  amortizacion_mensual: number;
  activo: boolean;
}

// --- Configuración ---------------------------------------------------------------------------------

export interface ConfiguracionEnvios {
  litro_nafta: number;
  consumo_100km: number;
  margen_gratis: number;
  margen_fijo: number;
  margen_exacto: number;
  precio_envio_fijo: number;
}

export interface ConfiguracionPlanificacion {
  ventana_meses_referencia: number;
  umbral_desvio_semana_pct: number;
}

/** Agrupa todo lo que hoy vive disperso como campos sueltos de nivel superior: umbrales, tipo de
 * cambio, saldos "de arrastre" (renombrados a "saldo_inicial_*" — mismo valor, nombre que no
 * sugiere que se recalculan solos), config de envíos y planificación. */
export interface Configuracion {
  envios: ConfiguracionEnvios;
  planificacion: ConfiguracionPlanificacion;
  umbral_dias_mayorista_riesgo: number;
  umbral_compras_consumo_amber: number;
  umbral_compras_consumo_red: number;
  umbral_stock_bajo_producto: number;
  tipo_cambio: { valor: number; fuente: string };
  saldo_inicial_cmv: number;
  saldo_inicial_compras: number;
  fecha_corte_cmv: string | null;
  fecha_corte_compras: string | null;
  saldo_inicial_caja: number;
  efectivo_en_mano: number;
  /** `id` de pedido_item confirmados en la conciliación de Caja como intencionalmente sin cobrar. */
  conciliacion_ignorados: string[];
  caja_inteligente: CajaInteligente;
}

// --- Pendientes de revisión / legacy -----------------------------------------------------------

/** Cualquier dato que la migración no pudo resolver con certeza — nunca se corrige ni se
 * inventa un valor, se deja acá con el motivo para revisión humana. */
export interface RevisionItem {
  id: string;
  seccion: string;
  entidad_id?: string;
  motivo: string;
  detalle?: Record<string, unknown>;
}

export interface RicordoDataV2 {
  categorias: Categoria[];
  clientes: Cliente[];
  pedidos: Pedido[];
  pedido_items: PedidoItem[];
  productos: Producto[];
  producto_variantes: ProductoVariante[];
  recetas: Receta[];
  receta_items: RecetaItem[];
  ajustes_receta_variante: AjusteRecetaVariante[];
  complementos_variante: ComplementoVariante[];
  insumos: Insumo[];
  inventario_movimientos: InventarioMovimiento[];
  historial_precios: HistorialPrecio[];
  compras: Compra[];
  compra_items: CompraItem[];
  proveedores: Proveedor[];
  produccion: Produccion[];
  plan_produccion: PlanProduccionMes[];
  movimientos_financieros: MovimientoFinanciero[];
  activos: Activo[];
  configuracion: Configuracion;
  datos_pendientes_revision: RevisionItem[];
  /** Todo lo que no es seguro descartar pero tampoco tiene un lugar claro en el esquema nuevo
   * (af_elasticidades, af_cap_trabajo, af_payback_items, ia_log, pulso,
   * borrador_compra_pendiente) — se preserva tal cual si tenía datos al momento de migrar. */
  legacy: Record<string, unknown>;
}

export interface RicordoDocument {
  schema_version: 2;
  metadata: { migrado_en: string; desde_version: 1 };
  data: RicordoDataV2;
}

export function emptyDataV2(): RicordoDataV2 {
  return {
    categorias: [],
    clientes: [],
    pedidos: [],
    pedido_items: [],
    productos: [],
    producto_variantes: [],
    recetas: [],
    receta_items: [],
    ajustes_receta_variante: [],
    complementos_variante: [],
    insumos: [],
    inventario_movimientos: [],
    historial_precios: [],
    compras: [],
    compra_items: [],
    proveedores: [],
    produccion: [],
    plan_produccion: [],
    movimientos_financieros: [],
    activos: [],
    configuracion: {
      envios: {
        litro_nafta: 1200,
        consumo_100km: 7,
        margen_gratis: 65,
        margen_fijo: 60,
        margen_exacto: 55,
        precio_envio_fijo: 2000,
      },
      planificacion: { ventana_meses_referencia: 3, umbral_desvio_semana_pct: 15 },
      umbral_dias_mayorista_riesgo: 45,
      umbral_compras_consumo_amber: 20,
      umbral_compras_consumo_red: 40,
      umbral_stock_bajo_producto: 10,
      tipo_cambio: { valor: 1000, fuente: "manual" },
      saldo_inicial_cmv: 0,
      saldo_inicial_compras: 0,
      fecha_corte_cmv: null,
      fecha_corte_compras: null,
      saldo_inicial_caja: 0,
      efectivo_en_mano: 0,
      conciliacion_ignorados: [],
      caja_inteligente: {
        porcentaje_reinversion: 70,
        porcentaje_seguridad: 30,
        asignaciones: [],
        usos_reinversion: [],
        usos_seguridad: [],
      },
    },
    datos_pendientes_revision: [],
    legacy: {},
  };
}

export function emptyDocument(): RicordoDocument {
  return {
    schema_version: 2,
    metadata: { migrado_en: new Date().toISOString(), desde_version: 1 },
    data: emptyDataV2(),
  };
}
