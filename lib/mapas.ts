// Capa de mapas — abstracta a propósito (Sección 24 del pedido de evolución): ningún módulo de
// UI llama directo a Google Maps/Mapbox/OSRM. Hoy solo hay un proveedor implementado
// ("haversine": distancia en línea recta, sin necesidad de API key ni credenciales) porque este
// entorno no tiene acceso a un proveedor real configurado — pero cualquier otro proveedor se
// agrega implementando la misma interfaz `MapProvider`, sin tocar Operaciones ni Configuración.

import type { ProveedorMapa } from "./types-v2";

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface TramoCalculado {
  distancia_km: number;
  duracion_min: number;
}

export interface MapProvider {
  id: ProveedorMapa;
  nombre: string;
  /** true si de verdad calcula una ruta (calles, sentido, tránsito); false si es una
   * aproximación (línea recta) — la UI debe dejarlo explícito, nunca mostrarlo como un dato exacto. */
  esEstimacion: boolean;
  calcularTramo(origen: Coordenadas, destino: Coordenadas): TramoCalculado;
}

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180;
}

/** Distancia en línea recta entre dos coordenadas (fórmula de Haversine) — no es la distancia real
 * por calles, siempre subestima la distancia de manejo real. Se usa solo como estimación cuando no
 * hay un proveedor de rutas real conectado. */
export function distanciaHaversineKm(a: Coordenadas, b: Coordenadas): number {
  const R = 6371;
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const senoLat = Math.sin(dLat / 2);
  const senoLng = Math.sin(dLng / 2);
  const h = senoLat * senoLat + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * senoLng * senoLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Velocidad promedio asumida para estimar tiempo de viaje urbano — solo se usa junto con la
 * distancia en línea recta del proveedor "haversine"; un proveedor de rutas real reemplaza esto
 * por su propio cálculo de tránsito. */
export const VELOCIDAD_ESTIMADA_KMH = 30;

export const haversineProvider: MapProvider = {
  id: "haversine",
  nombre: "Estimación en línea recta",
  esEstimacion: true,
  calcularTramo(origen, destino) {
    const distancia_km = distanciaHaversineKm(origen, destino);
    return { distancia_km, duracion_min: (distancia_km / VELOCIDAD_ESTIMADA_KMH) * 60 };
  },
};

/** "ninguno" (o cualquier proveedor futuro todavía no implementado acá) devuelve null a
 * propósito — nunca se inventa una distancia sin un proveedor real detrás. */
export function obtenerProveedorMapa(id: ProveedorMapa | undefined): MapProvider | null {
  if (id === "haversine") return haversineProvider;
  return null;
}

/** Arma un link de Google Maps con origen, paradas intermedias y destino — no requiere API key
 * para simplemente abrir la app de navegación del usuario (a diferencia de MapProvider, que sí
 * necesitaría credenciales para calcular la ruta programáticamente). */
export function urlNavegacionMultiparada(puntos: Coordenadas[]): string | null {
  if (puntos.length < 2) return null;
  const origen = puntos[0];
  const destino = puntos[puntos.length - 1];
  const waypoints = puntos.slice(1, -1);
  const params = new URLSearchParams({
    api: "1",
    origin: `${origen.lat},${origen.lng}`,
    destination: `${destino.lat},${destino.lng}`,
  });
  if (waypoints.length > 0) params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
