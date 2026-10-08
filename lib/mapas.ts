// Capa de mapas — abstracta a propósito (Sección 24 del pedido de evolución): ningún módulo de
// UI llama directo a un proveedor de mapas. Hoy hay dos proveedores reales implementados sin
// necesitar ninguna API key: "haversine" (distancia en línea recta, siempre disponible como
// respaldo) y "osrm" (ruta real por calles, usando el servidor público de demostración de OSRM —
// Open Source Routing Machine, https://project-osrm.org). La geocodificación de direcciones usa
// Nominatim (OpenStreetMap), también sin API key. Cualquier otro proveedor (Google Maps, Mapbox)
// se agrega implementando la misma interfaz `MapProvider`, sin tocar Operaciones ni Configuración.
//
// Los servidores públicos de OSRM/Nominatim son gratuitos pero de uso limitado (pensados para
// pruebas, no para volumen alto) y no tienen garantía de disponibilidad — si fallan o no responden,
// las funciones de acá devuelven null en vez de inventar una distancia o coordenada.

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
  /** null si el proveedor no pudo calcular el tramo (sin red, servidor caído, puntos no
   * ruteables) — nunca inventa un número en ese caso, el llamador decide cómo mostrarlo. */
  calcularTramo(origen: Coordenadas, destino: Coordenadas): Promise<TramoCalculado | null>;
}

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180;
}

/** Distancia en línea recta entre dos coordenadas (fórmula de Haversine) — no es la distancia real
 * por calles, siempre subestima la distancia de manejo real. Se usa como estimación cuando no hay
 * un proveedor de rutas real conectado, o como respaldo si ese proveedor falla. */
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
 * distancia en línea recta del proveedor "haversine"; OSRM calcula su propia duración real. */
export const VELOCIDAD_ESTIMADA_KMH = 30;

export const haversineProvider: MapProvider = {
  id: "haversine",
  nombre: "Estimación en línea recta",
  esEstimacion: true,
  async calcularTramo(origen, destino) {
    const distancia_km = distanciaHaversineKm(origen, destino);
    return { distancia_km, duracion_min: (distancia_km / VELOCIDAD_ESTIMADA_KMH) * 60 };
  },
};

const OSRM_BASE_URL = "https://router.project-osrm.org";

/** Ruta real por calles vía el servidor público de demostración de OSRM — sin API key. Si el
 * servidor no responde o no encuentra una ruta entre los puntos, devuelve null (nunca cae
 * silenciosamente a una estimación en línea recta disfrazada de ruta real). */
export const osrmProvider: MapProvider = {
  id: "osrm",
  nombre: "OSRM (ruta real por calles)",
  esEstimacion: false,
  async calcularTramo(origen, destino) {
    try {
      const url = `${OSRM_BASE_URL}/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=false`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      const ruta = json?.routes?.[0];
      if (!ruta || typeof ruta.distance !== "number" || typeof ruta.duration !== "number") return null;
      return { distancia_km: ruta.distance / 1000, duracion_min: ruta.duration / 60 };
    } catch {
      return null;
    }
  },
};

/** "ninguno" (o cualquier proveedor futuro todavía no implementado acá) devuelve null a
 * propósito — nunca se inventa una distancia sin un proveedor real detrás. */
export function obtenerProveedorMapa(id: ProveedorMapa | undefined): MapProvider | null {
  if (id === "haversine") return haversineProvider;
  if (id === "osrm") return osrmProvider;
  return null;
}

/** Geocodifica una dirección de texto libre a coordenadas usando Nominatim (OpenStreetMap) — sin
 * API key. Devuelve null si no encuentra nada o si el servicio no responde; nunca inventa una
 * coordenada aproximada. Disponible sin importar qué proveedor de rutas esté configurado (la
 * geocodificación y el ruteo son servicios independientes). */
export async function geocodificarDireccion(direccion: string): Promise<Coordenadas | null> {
  const texto = direccion.trim();
  if (texto.length < 3) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(texto)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const resultados = await res.json();
    const primero = resultados?.[0];
    if (!primero || typeof primero.lat !== "string" || typeof primero.lon !== "string") return null;
    const lat = Number(primero.lat);
    const lng = Number(primero.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
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
