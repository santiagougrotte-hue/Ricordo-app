// Planificador de rutas de entrega (Sección 27/28/29 del pedido de evolución) — capa pura: arma
// los tramos de una ruta usando el MapProvider inyectado (nunca llama a un proveedor directo acá,
// ver lib/mapas.ts), calcula el costo real de combustible reusando la configuración de envíos
// existente, y reparte ese costo entre los pedidos de la ruta con una regla explícita — nunca
// duplica el costo total en cada pedido.

import type { ConfiguracionEnvios, MetodoDistribucionCostoRuta } from "./types-v2";
import type { Coordenadas, MapProvider } from "./mapas";

export interface ParadaEntrada {
  pedido_id: string;
  direccion: string;
  lat: number | null;
  lng: number | null;
}

export interface TramoRuta {
  pedido_id: string;
  distancia_km: number;
  duracion_min: number;
}

export interface RutaCalculada {
  distancia_total_km: number;
  duracion_total_min: number;
  tramos: TramoRuta[];
}

/** Calcula los tramos origen → parada 1 → parada 2 → ... → (origen, si regresa) con el proveedor
 * dado. Devuelve null si falta el origen o si el proveedor no puede calcular (sin proveedor
 * conectado) — nunca inventa una distancia. Si a una parada puntual le faltan coordenadas, ese
 * tramo queda marcado con NaN y se excluye del total (ver `paradasSinCoordenadas`). */
export function calcularRuta(
  origen: Coordenadas | null,
  paradas: ParadaEntrada[],
  regresaOrigen: boolean,
  provider: MapProvider | null
): RutaCalculada | null {
  if (!origen || !provider || paradas.length === 0) return null;

  const puntos: (Coordenadas | null)[] = paradas.map((p) => (p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null));
  const tramos: TramoRuta[] = [];
  let anterior = origen;
  let distancia_total_km = 0;
  let duracion_total_min = 0;

  for (let i = 0; i < paradas.length; i++) {
    const punto = puntos[i];
    if (!punto) {
      tramos.push({ pedido_id: paradas[i].pedido_id, distancia_km: NaN, duracion_min: NaN });
      continue;
    }
    const tramo = provider.calcularTramo(anterior, punto);
    tramos.push({ pedido_id: paradas[i].pedido_id, distancia_km: tramo.distancia_km, duracion_min: tramo.duracion_min });
    distancia_total_km += tramo.distancia_km;
    duracion_total_min += tramo.duracion_min;
    anterior = punto;
  }

  if (regresaOrigen) {
    const vuelta = provider.calcularTramo(anterior, origen);
    distancia_total_km += vuelta.distancia_km;
    duracion_total_min += vuelta.duracion_min;
  }

  return { distancia_total_km, duracion_total_min, tramos };
}

export function paradasSinCoordenadas(paradas: ParadaEntrada[]): ParadaEntrada[] {
  return paradas.filter((p) => p.lat == null || p.lng == null);
}

export interface CostosRuta {
  litros_estimados: number;
  costo_nafta_estimado: number;
  costo_total_ruta: number;
}

/** Reusa `configuracion.envios` — nunca duplica litro_nafta/consumo_100km en otro lado. */
export function calcularCostosRuta(distanciaTotalKm: number, envios: ConfiguracionEnvios, peajes = 0, estacionamiento = 0, otrosCostos = 0): CostosRuta {
  const litros_estimados = (distanciaTotalKm * envios.consumo_100km) / 100;
  const costo_nafta_estimado = litros_estimados * envios.litro_nafta;
  const costo_total_ruta = costo_nafta_estimado + peajes + estacionamiento + otrosCostos;
  return {
    litros_estimados: Math.round(litros_estimados * 100) / 100,
    costo_nafta_estimado: Math.round(costo_nafta_estimado),
    costo_total_ruta: Math.round(costo_total_ruta),
  };
}

/** Reparte el costo total de la ruta entre sus paradas — nunca asigna el costo total completo a
 * cada pedido. "equitativo" (default, sirve incluso sin distancias calculadas) divide en partes
 * iguales; "por_distancia_tramo" reparte proporcional al tramo de cada parada (si algún tramo no
 * tiene distancia calculada, cae a equitativo para esa parada en vez de asignarle 0 injustamente). */
export function distribuirCostoRuta(tramos: TramoRuta[], costoTotal: number, metodo: MetodoDistribucionCostoRuta): Map<string, number> {
  const resultado = new Map<string, number>();
  if (tramos.length === 0) return resultado;

  if (metodo === "equitativo") {
    const porParada = costoTotal / tramos.length;
    for (const t of tramos) resultado.set(t.pedido_id, Math.round(porParada));
    return resultado;
  }

  const sumaDistancias = tramos.reduce((acc, t) => acc + (Number.isFinite(t.distancia_km) ? t.distancia_km : 0), 0);
  if (sumaDistancias <= 0) return distribuirCostoRuta(tramos, costoTotal, "equitativo");

  for (const t of tramos) {
    const proporcion = Number.isFinite(t.distancia_km) ? t.distancia_km / sumaDistancias : 0;
    resultado.set(t.pedido_id, Math.round(costoTotal * proporcion));
  }
  return resultado;
}
