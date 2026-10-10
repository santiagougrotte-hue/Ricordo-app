// Geocodificación de direcciones vía Nominatim (OpenStreetMap), sin API key — usada al cargar la
// dirección de un pedido o cliente (Ventas, Configuración) para tener lat/lng y mostrar un pin.
//
// El servidor público de Nominatim es gratuito pero de uso limitado (pensado para pruebas, no para
// volumen alto) y no tiene garantía de disponibilidad — si falla o no responde, la función de acá
// devuelve null en vez de inventar una coordenada.

export interface Coordenadas {
  lat: number;
  lng: number;
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
