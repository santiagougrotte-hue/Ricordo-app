// Canonical data model for personal_app_data (localStorage / Supabase)

export type CategoriaEvento = "Trabajo" | "Facultad" | "Personal";

export interface Evento {
  id: string;
  titulo: string;
  fecha: string; // YYYY-MM-DD
  hora?: string; // HH:MM, opcional
  categoria: CategoriaEvento;
  notas?: string;
}

export interface IngresoAdicional {
  id: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  descripcion: string;
  categoria: string;
}

export interface GastoUnico {
  id: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  descripcion: string;
  categoria: string;
}

export interface GastoCuota {
  id: string;
  descripcion: string;
  montoTotal: number;
  cantidadCuotas: number;
  fechaInicio: string; // YYYY-MM-DD, mes de la primera cuota
  categoria: string;
}

// Plata destinada a invertir: es un movimiento aparte, no un gasto — no se
// resta del balance de ingresos/egresos, se acumula en su propio contador.
export interface Inversion {
  id: string;
  fecha: string; // YYYY-MM-DD
  monto: number;
  descripcion: string;
}

export interface AppData {
  sueldoFijo: number;
  ingresosAdicionales: IngresoAdicional[];
  gastosUnicos: GastoUnico[];
  gastosCuotas: GastoCuota[];
  inversiones: Inversion[];
  eventos: Evento[];
}

export const STORAGE_KEY = "personal_app_data";

export function emptyData(): AppData {
  return {
    sueldoFijo: 0,
    ingresosAdicionales: [],
    gastosUnicos: [],
    gastosCuotas: [],
    inversiones: [],
    eventos: [],
  };
}
