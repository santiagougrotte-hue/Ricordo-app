// Canonical data model for ricordo_data (localStorage)

export type Canal = "Minorista" | "Mayorista";
export type EstadoPedido = "Confirmado" | "Produccion" | "Entregado" | "Cancelado";
export type EstadoPago = "Pendiente" | "Parcial" | "Pagado" | "Reembolsado";
export type TipoRecetaLinea = "Ingrediente" | "Packaging" | "CostoFijo";
export type TipoMovCaja = "ingreso" | "egreso";

export interface Ingrediente {
  id: string;
  nombre: string;
  unidad: string;
  categoria?: string;
  precio_ref: number;
  precio_vigente: number | null;
  seguimiento_stock: boolean;
  stock_minimo?: number;
  /** Solo tiene sentido si el insumo se compra por unidad pero participa por peso en alguna
   * receta (ej. huevo ≈ 50g) — usado por Planificación de Producción para escalar por peso. */
  peso_unitario_g?: number;
}

export interface Adjunto {
  nombre: string;
  tipo: string;
  tamano: number;
  data: string; // data URL (base64)
}

export interface Producto {
  id: string;
  id_base: string;
  nombre: string;
  categoria?: string;
  precio_venta: number;
  activo: boolean;
  foto?: Adjunto;
  /** Gramaje por caja para Planificación de Producción — derivado inicialmente de la receta
   * clasificada (masa/relleno) y editable. Editarlo reescala proporcionalmente las líneas de
   * receta de ese componente, por eso siempre pasa por confirmación (cambia costo/margen). */
  gramos_masa_por_caja?: number;
  gramos_relleno_por_caja?: number;
  /** Receta por unidad de producción (la pieza física: un raviol, un sorrentino). Solo tiene
   * sentido si este producto actúa como "producto base" de su familia — nunca se infiere de
   * las recetas viejas por variante, se carga a mano. */
  receta_masa_unidad?: RecetaUnidadLinea[];
  receta_relleno_unidad?: RecetaUnidadLinea[];
  /** Cuántas unidades del producto base entran en este paquete — el campo que activa la
   * migración de este producto de venta al modelo de receta derivada. Se carga a mano. */
  unidades_por_paquete?: number;
  /** Canal de venta de esta presentación (minorista, mayorista) — propio del producto de venta,
   * no del producto base. */
  canal?: Canal;
  /** Cosas que se agregan al paquete con una cantidad propia, independiente de
   * unidades_por_paquete (ej. una porción de salsa, sin importar cuántos raviolis tenga el
   * paquete) — apuntan a otro producto base para no duplicar su receta acá. */
  complementos?: ComplementoVenta[];
  /** Overrides puntuales de la receta derivada (ej. "lleva más aceite") — cada uno reemplaza
   * la cantidad calculada de esa línea, nunca se suma. Deben verse marcados en la pantalla del
   * producto y listarse en el panel global de excepciones. */
  excepciones?: ExcepcionLinea[];
}

export interface RecetaUnidadLinea {
  id: string;
  id_ingrediente: string;
  cantidad: number;
}

export interface ComplementoVenta {
  id: string;
  id_base: string;
  cantidad: number;
}

export type GrupoRecetaDerivada = "masa" | "relleno" | "complementos" | "packaging";

export interface ExcepcionLinea {
  id: string;
  grupo: GrupoRecetaDerivada;
  tipo: "Ingrediente" | "Packaging";
  concepto: string;
  cantidad: number;
}

export interface Cliente {
  id: string;
  nombre: string;
  canal: Canal;
  direccion?: string;
  telefono?: string;
  email?: string;
  notas?: string;
  fecha_alta?: string;
  /** Soft-delete: false = dado de baja, se excluye de las pantallas pero conserva su historial
   * de pedidos intacto (nunca se borra físicamente un cliente con ventas asociadas). Ausente o
   * true = activo, el estado de siempre. */
  activo?: boolean;
}

export type ComponenteReceta = "masa" | "relleno" | "packaging";

export interface RecetaLinea {
  id: string;
  id_producto: string;
  tipo: TipoRecetaLinea;
  concepto: string; // id_ingrediente | id_packaging | id_costo_fijo
  cantidad: number;
  /** A qué parte del producto pertenece este renglón (Planificación de Producción). Opcional:
   * el costeo (calcCosto) nunca lee este campo, solo lo usa el módulo de planificación. */
  componente?: ComponenteReceta;
}

export interface Packaging {
  id: string;
  nombre: string;
  unidad: string;
  precio_ref: number;
  precio_vigente: number | null;
}

export interface Pedido {
  id_pedido: string;
  id_detalle: string;
  id_cliente: string;
  id_producto: string;
  nombre_producto: string;
  gusto?: string;
  cantidad: number;
  precio_unitario: number;
  precio_total: number;
  descuento_monto: number;
  precio_neto: number;
  fecha: string;
  /** Fecha comprometida de entrega — distinta de `fecha` (fecha del pedido). Opcional: muchos
   * pedidos minoristas se entregan el mismo día. */
  fecha_entrega?: string;
  estado: EstadoPedido;
  canal: Canal;
  km_envio: number;
  costo_envio: number;
  metodo_pago?: string;
  /** Ausente = "Pagado" (compatibilidad con todo pedido histórico, que asumía cobro completo al
   * entregar). Con "Parcial", `monto_pagado` indica cuánto se cobró; el resto es el saldo
   * pendiente — ver saldoPedido()/montoPagadoPedido() en lib/calc.ts. */
  estado_pago?: EstadoPago;
  monto_pagado?: number;
  /** Fecha límite de cobro (crédito a mayoristas) — usada para "días de atraso" en Cuentas por
   * Cobrar. Sin cargar, esa columna queda vacía en vez de inventar un vencimiento. */
  fecha_vencimiento?: string;
  notas?: string;
  adjunto?: Adjunto;
}

export interface Produccion {
  id: string;
  id_producto: string;
  nombre_producto: string;
  cantidad: number;
  fecha: string;
  notas?: string;
}

export interface CompraLineaIngrediente {
  id_ingrediente: string;
  cantidad: number;
  precio_unitario: number;
}
export interface CompraLineaPackaging {
  id_packaging: string;
  cantidad: number;
  precio_unitario: number;
}

export interface Compra {
  id: string;
  fecha: string;
  id_proveedor: string;
  descripcion?: string;
  total: number;
  total_manual: boolean;
  metodo_pago?: string;
  notas?: string;
  lineas: CompraLineaIngrediente[];
  lineasPkg: CompraLineaPackaging[];
  registrar_caja: boolean;
  adjunto?: Adjunto;
  /** Soft-delete: true = anulada, se excluye de Compras y de todo cálculo (stock, costo
   * vigente, movimiento de caja), pero el registro se conserva para trazabilidad. */
  anulada?: boolean;
}

export interface CostoFijo {
  id: string;
  descripcion: string;
  monto: number;
  categoria: string;
  activo: boolean;
}

export type TipoCosto = "Fijo" | "Variable";

export interface CostoIndirecto {
  id: string;
  descripcion: string;
  monto: number;
  mes: number;
  anio: number;
  categoria: string;
  tipo_costo: TipoCosto;
  /** Soft-delete: true = anulado. Ausente o false = vigente. */
  anulado?: boolean;
}

export interface Amortizacion {
  id: string;
  nombre: string;
  precio_total: number;
  fecha_inicio: string;
  meses_totales: number;
  /** Valor estimado de reventa al cabo de la vida útil — ausente o 0 = se amortiza el 100% del
   * precio (el comportamiento de siempre). */
  valor_residual?: number;
  /** Soft-delete: true = dado de baja (venta, rotura, etc.). Ausente o false = vigente. */
  anulado?: boolean;
}

export interface GastoOperativo {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: string;
}

export interface GastoInversion {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  categoria: string;
}

export interface CajaMovimiento {
  id: string;
  fecha: string;
  tipo: TipoMovCaja;
  concepto: string;
  monto: number;
  metodo: string;
  ref?: string;
}

export interface TransferenciaInterna {
  id: string;
  fecha: string;
  origen: string;
  destino: string;
  monto: number;
  descripcion?: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  notas?: string;
  documento?: Adjunto;
  /** Soft-delete: false = dado de baja. Ausente o true = activo. */
  activo?: boolean;
}

export interface HistorialPrecio {
  id: string;
  id_insumo: string;
  insumo: string;
  precio_anterior: number;
  precio_nuevo: number;
  fecha: string;
  origen?: string;
}

export interface ConteoIngrediente {
  id: string;
  id_ingrediente: string;
  cantidad: number;
  fecha: string;
  notas?: string;
}

export interface ConteoStock {
  id: string;
  id_producto: string;
  cantidad: number;
  fecha: string;
}

export interface TipoCambio {
  valor: number;
  fuente: string;
}

export interface AfElasticidad {
  p1: number;
  q1: number;
  p2: number;
  q2: number;
  e: number;
  fecha: string;
}

export interface AfCapTrabajoItem {
  nombre: string;
  monto: number;
}

export interface AfCapTrabajo {
  ac_extra: AfCapTrabajoItem[];
  pc_items: AfCapTrabajoItem[];
}

export interface AfPaybackItem {
  id: string;
  nombre: string;
  inversion: number;
  flujo: number;
  tasa: number;
  fecha: string;
}

export interface CajaInteligenteUso {
  id: string;
  fecha: string;
  concepto: string;
  monto: number;
}

export interface CajaInteligente {
  porcentaje_reinversion: number;
  porcentaje_seguridad: number;
  asignaciones: { id: string; fecha: string; monto: number }[];
  usos_reinversion: CajaInteligenteUso[];
  usos_seguridad: CajaInteligenteUso[];
}

export interface ConfigEnvios {
  litro_nafta: number;
  consumo_100km: number;
  margen_gratis: number;
  margen_fijo: number;
  margen_exacto: number;
  precio_envio_fijo: number;
}

/** Plan de producción cargado a mano por gusto (producto base) para un mes de referencia —
 * queda en historial (Bloque 2 de Planificación): se puede consultar en septiembre qué se
 * planificó en agosto. Un gusto agrupa todas sus variantes de canal (minorista, mayorista,
 * etc.), que comparten el mismo lote físico de producción. */
export interface PlanProduccionMes {
  id: string;
  mes: number;
  anio: number;
  id_base: string;
  cajas_mes: number;
  cajas_semana: number;
  fecha_guardado: string;
}

export interface ConfigPlanificacion {
  /** Ventana de meses hacia atrás para el promedio de ventas del Bloque 1. */
  ventana_meses_referencia: number;
  /** % de desvío entre cajas_semana×4,33 y cajas_mes que dispara el aviso ámbar del Bloque 2. */
  umbral_desvio_semana_pct: number;
}

/** Borrador armado desde "Generar orden de compra" (Planificación) para que Compras lo
 * precargue en su modal de Nueva Compra — el usuario siempre revisa y confirma ahí, esto
 * nunca escribe una compra por sí solo. Se limpia apenas Compras lo consume. */
export interface BorradorCompra {
  descripcion: string;
  lineas: { id_ingrediente: string; cantidad: number; precio_unitario: number }[];
}

export interface IaLogEntry {
  fecha: string;
  funcion: string;
  tokens_entrada: number;
  tokens_salida: number;
}

export type SeveridadPulso = "alta" | "media" | "info";

export interface ObservacionPulso {
  titulo: string;
  texto: string;
  severidad: SeveridadPulso;
  modulo: string;
}

export interface PulsoCache {
  fecha: string;
  observaciones: ObservacionPulso[];
}

export interface RicordoData {
  ingredientes: Ingrediente[];
  productos: Producto[];
  clientes: Cliente[];
  recetas: RecetaLinea[];
  packaging: Packaging[];
  pedidos: Pedido[];
  produccion: Produccion[];
  compras: Compra[];
  costos_fijos: CostoFijo[];
  costos_indirectos: CostoIndirecto[];
  amortizaciones: Amortizacion[];
  gastos_operativos: GastoOperativo[];
  gastos_inversion: GastoInversion[];
  caja_movimientos: CajaMovimiento[];
  transferencias_internas: TransferenciaInterna[];
  proveedores: Proveedor[];
  historial_precios: HistorialPrecio[];
  conteos_ingredientes: ConteoIngrediente[];
  conteos_stock: ConteoStock[];
  stock_manual: Record<string, number>;
  gustos: Record<string, string[]>;
  saldo_anterior_caja: { valor: number };
  tipo_cambio: TipoCambio;
  efectivo_en_mano: number;
  saldo_cmv_anterior: number;
  saldo_compras_anterior: number;
  fecha_corte_cmv: string | null;
  fecha_corte_compras: string | null;
  /** id_detalle de pedidos que se revisaron en la conciliación de Caja y se confirmaron
   * como realmente sin cobrar (no un error) — se excluyen de la lista de discrepancias. */
  conciliacion_ignorados: string[];
  umbral_dias_mayorista_riesgo: number;
  umbral_compras_consumo_amber: number;
  umbral_compras_consumo_red: number;
  umbral_stock_bajo_producto: number;
  af_elasticidades: Record<string, AfElasticidad>;
  af_cap_trabajo: AfCapTrabajo;
  af_payback_items: AfPaybackItem[];
  caja_inteligente: CajaInteligente;
  config_envios: ConfigEnvios;
  ia_log: IaLogEntry[];
  pulso: PulsoCache | null;
  plan_produccion: PlanProduccionMes[];
  config_planificacion: ConfigPlanificacion;
  borrador_compra_pendiente: BorradorCompra | null;
}

export const STORAGE_KEY = "ricordo_data";

export function emptyData(): RicordoData {
  return {
    ingredientes: [],
    productos: [],
    clientes: [],
    recetas: [],
    packaging: [],
    pedidos: [],
    produccion: [],
    compras: [],
    costos_fijos: [],
    costos_indirectos: [],
    amortizaciones: [],
    gastos_operativos: [],
    gastos_inversion: [],
    caja_movimientos: [],
    transferencias_internas: [],
    proveedores: [],
    historial_precios: [],
    conteos_ingredientes: [],
    conteos_stock: [],
    stock_manual: {},
    gustos: {},
    saldo_anterior_caja: { valor: 0 },
    tipo_cambio: { valor: 1000, fuente: "manual" },
    efectivo_en_mano: 0,
    saldo_cmv_anterior: 0,
    saldo_compras_anterior: 0,
    fecha_corte_cmv: null,
    fecha_corte_compras: null,
    conciliacion_ignorados: [],
    umbral_dias_mayorista_riesgo: 45,
    umbral_compras_consumo_amber: 20,
    umbral_compras_consumo_red: 40,
    umbral_stock_bajo_producto: 10,
    af_elasticidades: {},
    af_cap_trabajo: { ac_extra: [], pc_items: [] },
    af_payback_items: [],
    caja_inteligente: {
      porcentaje_reinversion: 70,
      porcentaje_seguridad: 30,
      asignaciones: [],
      usos_reinversion: [],
      usos_seguridad: [],
    },
    config_envios: {
      litro_nafta: 1200,
      consumo_100km: 7,
      margen_gratis: 65,
      margen_fijo: 60,
      margen_exacto: 55,
      precio_envio_fijo: 2000,
    },
    ia_log: [],
    pulso: null,
    plan_produccion: [],
    config_planificacion: { ventana_meses_referencia: 3, umbral_desvio_semana_pct: 15 },
    borrador_compra_pendiente: null,
  };
}
