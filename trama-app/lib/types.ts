// Canonical data model for trama_app_data (localStorage / Supabase)

export type Moneda = "ARS" | "USD";

// ---------- Clientes ----------

export type EstadoCliente =
  | "potencial"
  | "presupuesto_enviado"
  | "negociacion"
  | "activo"
  | "pausado"
  | "finalizado";

export const ESTADOS_CLIENTE: { value: EstadoCliente; label: string }[] = [
  { value: "potencial", label: "Potencial" },
  { value: "presupuesto_enviado", label: "Presupuesto enviado" },
  { value: "negociacion", label: "Negociación" },
  { value: "activo", label: "Activo" },
  { value: "pausado", label: "Pausado" },
  { value: "finalizado", label: "Finalizado" },
];

export interface Cliente {
  id: string;
  marca: string;
  contacto: string;
  telefono: string;
  email: string;
  instagram: string;
  rubro: string;
  fechaInicio: string; // YYYY-MM-DD
  estado: EstadoCliente;
  serviciosContratados: string[]; // Servicio ids
  abonoMensual: number;
  moneda: Moneda;
  fechaPago: string; // día del mes, "1".."31"
  modalidadPago: string;
  observaciones: string;
  equipoAsignado: string[]; // Persona ids
}

// ---------- Servicios ----------

export type UnidadCobro = "hora" | "pieza" | "jornada" | "proyecto" | "mes";

export const UNIDADES_COBRO: { value: UnidadCobro; label: string }[] = [
  { value: "hora", label: "Por hora" },
  { value: "pieza", label: "Por pieza" },
  { value: "jornada", label: "Por jornada" },
  { value: "proyecto", label: "Por proyecto" },
  { value: "mes", label: "Por mes" },
];

export type Complejidad = "baja" | "media" | "alta";

export const NIVELES_COMPLEJIDAD: { value: Complejidad; label: string }[] = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];

export interface Servicio {
  id: string;
  nombre: string;
  categoria: string;
  precioBase: number;
  unidad: UnidadCobro;
  horasEstimadas: number;
  costoInterno: number;
  profesionalResponsable: string;
  margenMinimo: number; // %
  complejidad: Complejidad;
  observaciones: string;
}

// ---------- Equipo ----------

export type TipoContratacion = "mensual" | "hora" | "jornada" | "pieza" | "cliente" | "proyecto";

export const TIPOS_CONTRATACION: { value: TipoContratacion; label: string }[] = [
  { value: "mensual", label: "Mensual" },
  { value: "hora", label: "Por hora" },
  { value: "jornada", label: "Por jornada" },
  { value: "pieza", label: "Por pieza" },
  { value: "cliente", label: "Por cliente" },
  { value: "proyecto", label: "Por proyecto" },
];

export interface Persona {
  id: string;
  nombre: string;
  rol: string;
  esDirectora: boolean;
  tipoContratacion: TipoContratacion;
  sueldoFijo: number;
  valorHora: number;
  valorJornada: number;
  valorPieza: number;
  porcentajeProyecto: number;
  clientesAsignados: string[]; // Cliente ids
  observaciones: string;
  activa: boolean;
}

// ---------- Presupuestos ----------

export interface PresupuestoItem {
  id: string;
  servicioId: string | null;
  nombre: string;
  cantidad: number;
  unidad: UnidadCobro;
  precioUnitario: number; // precio al cliente
  costoUnitario: number; // costo interno
}

export interface CostoAdicional {
  id: string;
  categoria: string;
  descripcion: string;
  monto: number;
}

export const CATEGORIAS_COSTO_ADICIONAL = [
  "Traslados",
  "Viáticos",
  "Equipamiento",
  "Alquiler de locación",
  "Utilería",
  "Modelos",
  "Maquillaje y peinado",
  "Honorarios freelance",
  "Gestión del proyecto",
  "Coordinación y administración",
  "Otros",
];

export type TipoValorDistribucion = "fijo" | "porcentaje";

export interface DistribucionItem {
  id: string;
  categoria: string;
  personaId: string | null;
  tipo: TipoValorDistribucion;
  valor: number; // monto fijo o % según `tipo`
}

export const CATEGORIAS_DISTRIBUCION_SUGERIDAS = [
  "Pago de diseñadora gráfica",
  "Pago de productora",
  "Pago de creadora de contenido",
  "Pago de community manager",
  "Pago de fotógrafa",
  "Pago de editora",
  "Pago de estilista",
  "Pago de otros colaboradores",
  "Costos de producción",
  "Gastos operativos",
  "Impuestos",
  "Mi sueldo como directora",
  "Ganancia de TRAMA",
  "Reinversión",
  "Fondo de emergencia",
];

export type EstadoPresupuesto =
  | "borrador"
  | "revision"
  | "enviado"
  | "visto"
  | "negociacion"
  | "aprobado"
  | "rechazado"
  | "vencido";

export const ESTADOS_PRESUPUESTO: { value: EstadoPresupuesto; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "revision", label: "En revisión" },
  { value: "enviado", label: "Enviado" },
  { value: "visto", label: "Visto por el cliente" },
  { value: "negociacion", label: "En negociación" },
  { value: "aprobado", label: "Aprobado" },
  { value: "rechazado", label: "Rechazado" },
  { value: "vencido", label: "Vencido" },
];

export interface WizardRespuestas {
  tipoMarca: string;
  redesCantidad: number;
  publicacionesMensuales: number;
  historiasMensuales: number;
  reels: boolean;
  reelsCantidad: number;
  produccionPresencial: boolean;
  jornadas: number;
  horasPorJornada: number;
  fotografia: boolean;
  video: boolean;
  edicion: boolean;
  disenoGrafico: boolean;
  direccionCreativa: boolean;
  estilismo: boolean;
  modelos: boolean;
  locacion: boolean;
  maquillaje: boolean;
  utileria: boolean;
  traslados: boolean;
  communityManagement: boolean;
  respuestaMensajes: boolean;
  estrategiaComunicacion: boolean;
  pautaPublicitaria: boolean;
  coberturaEventos: boolean;
  frecuencia: string;
  modalidadTrabajo: "mensual" | "puntual";
  complejidad: Complejidad;
  urgencia: Complejidad;
  integrantesEquipo: number;
}

export function emptyWizardRespuestas(): WizardRespuestas {
  return {
    tipoMarca: "",
    redesCantidad: 1,
    publicacionesMensuales: 8,
    historiasMensuales: 12,
    reels: true,
    reelsCantidad: 4,
    produccionPresencial: true,
    jornadas: 1,
    horasPorJornada: 4,
    fotografia: true,
    video: false,
    edicion: true,
    disenoGrafico: true,
    direccionCreativa: false,
    estilismo: false,
    modelos: false,
    locacion: false,
    maquillaje: false,
    utileria: false,
    traslados: false,
    communityManagement: true,
    respuestaMensajes: false,
    estrategiaComunicacion: false,
    pautaPublicitaria: false,
    coberturaEventos: false,
    frecuencia: "Mensual",
    modalidadTrabajo: "mensual",
    complejidad: "media",
    urgencia: "baja",
    integrantesEquipo: 2,
  };
}

export type PrecioElegido = "minimo" | "sugerido" | "premium" | "manual";

export interface Presupuesto {
  id: string;
  numero: number;
  clienteId: string | null;
  nombreCliente: string;
  contacto: string;
  fecha: string; // YYYY-MM-DD
  validezDias: number;
  estado: EstadoPresupuesto;
  moneda: Moneda;
  tipoCambio: number;

  respuestas: WizardRespuestas;
  items: PresupuestoItem[];
  costosAdicionales: CostoAdicional[];

  impuestosPct: number;
  comisionesPct: number;
  margenMinimoPct: number;
  margenSugeridoPct: number;
  margenPremiumPct: number;
  fondoImprevistosPct: number;

  precioElegido: PrecioElegido;
  precioManual: number;

  distribucion: DistribucionItem[];

  introduccion: string;
  objetivos: string;
  entregables: string;
  cronograma: string;
  formaPago: string;
  condiciones: string;
  serviciosNoIncluidos: string;
  observaciones: string;
}

// ---------- Finanzas ----------

export type TipoMovimiento =
  | "ingreso_cliente"
  | "adelanto"
  | "saldo_pendiente"
  | "gasto_produccion"
  | "pago_sueldo"
  | "pago_freelance"
  | "suscripcion"
  | "alquiler"
  | "transporte"
  | "publicidad"
  | "equipamiento"
  | "software"
  | "impuestos"
  | "viaticos"
  | "otros_gastos";

export const TIPOS_MOVIMIENTO: { value: TipoMovimiento; label: string; ingreso: boolean }[] = [
  { value: "ingreso_cliente", label: "Ingreso de cliente", ingreso: true },
  { value: "adelanto", label: "Adelanto", ingreso: true },
  { value: "saldo_pendiente", label: "Saldo pendiente", ingreso: true },
  { value: "gasto_produccion", label: "Gasto de producción", ingreso: false },
  { value: "pago_sueldo", label: "Pago de sueldo", ingreso: false },
  { value: "pago_freelance", label: "Pago freelance", ingreso: false },
  { value: "suscripcion", label: "Suscripción", ingreso: false },
  { value: "alquiler", label: "Alquiler", ingreso: false },
  { value: "transporte", label: "Transporte", ingreso: false },
  { value: "publicidad", label: "Publicidad", ingreso: false },
  { value: "equipamiento", label: "Equipamiento", ingreso: false },
  { value: "software", label: "Software", ingreso: false },
  { value: "impuestos", label: "Impuestos", ingreso: false },
  { value: "viaticos", label: "Viáticos", ingreso: false },
  { value: "otros_gastos", label: "Otros gastos", ingreso: false },
];

export type EstadoMovimiento = "pendiente" | "pagado" | "cobrado";

export interface Movimiento {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoMovimiento;
  categoria: string;
  descripcion: string;
  clienteId: string | null;
  proyectoId: string | null;
  personaId: string | null;
  monto: number;
  moneda: Moneda;
  tipoCambio: number;
  medioPago: string;
  estado: EstadoMovimiento;
  comprobante: string;
  observaciones: string;
}

// ---------- Configuración ----------

export type ModalidadSueldoDirectora =
  | "fijo"
  | "porcentaje_facturacion"
  | "porcentaje_ganancia"
  | "fijo_mas_porcentaje"
  | "por_proyecto"
  | "retiros";

export const MODALIDADES_SUELDO_DIRECTORA: { value: ModalidadSueldoDirectora; label: string }[] = [
  { value: "fijo", label: "Sueldo fijo mensual" },
  { value: "porcentaje_facturacion", label: "Porcentaje de la facturación" },
  { value: "porcentaje_ganancia", label: "Porcentaje de la ganancia" },
  { value: "fijo_mas_porcentaje", label: "Sueldo fijo más porcentaje" },
  { value: "por_proyecto", label: "Pago por dirección de cada proyecto" },
  { value: "retiros", label: "Retiros personales" },
];

export interface Config {
  nombreEstudio: string;
  nombreDirectora: string;
  monedaPrincipal: Moneda;
  tipoCambioDefault: number;
  porcentajeImpuestos: number;
  comisionesPct: number;
  margenGananciaMinimo: number;
  margenGananciaSugerido: number;
  margenGananciaPremium: number;
  fondoImprevistos: number;
  porcentajeReinversion: number;
  sueldoObjetivoDirectora: number;
  modalidadSueldoDirectora: ModalidadSueldoDirectora;
  sueldoFijoDirectora: number;
  porcentajeSueldoDirectora: number;
  categoriasGastos: string[];
  datosBancarios: string;
  datosFiscales: string;
}

export function defaultConfig(): Config {
  return {
    nombreEstudio: "TRAMA Studio",
    nombreDirectora: "",
    monedaPrincipal: "ARS",
    tipoCambioDefault: 1000,
    porcentajeImpuestos: 10,
    comisionesPct: 3,
    margenGananciaMinimo: 20,
    margenGananciaSugerido: 35,
    margenGananciaPremium: 50,
    fondoImprevistos: 8,
    porcentajeReinversion: 15,
    sueldoObjetivoDirectora: 0,
    modalidadSueldoDirectora: "fijo",
    sueldoFijoDirectora: 0,
    porcentajeSueldoDirectora: 15,
    categoriasGastos: [
      "Producción",
      "Sueldos",
      "Freelance",
      "Suscripciones",
      "Alquiler",
      "Transporte",
      "Publicidad",
      "Equipamiento",
      "Software",
      "Impuestos",
      "Viáticos",
      "Otros",
    ],
    datosBancarios: "",
    datosFiscales: "",
  };
}

// ---------- Root ----------

export interface AppData {
  clientes: Cliente[];
  servicios: Servicio[];
  equipo: Persona[];
  presupuestos: Presupuesto[];
  movimientos: Movimiento[];
  config: Config;
}

export const STORAGE_KEY = "trama_app_data";

export function emptyData(): AppData {
  return {
    clientes: [],
    servicios: [],
    equipo: [],
    presupuestos: [],
    movimientos: [],
    config: defaultConfig(),
  };
}
