import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineProvider, osrmProvider, distanciaHaversineKm, obtenerProveedorMapa, urlNavegacionMultiparada, geocodificarDireccion } from "./mapas";
import { calcularRuta, paradasSinCoordenadas, calcularCostosRuta, distribuirCostoRuta } from "./rutas";
import type { ParadaEntrada, TramoRuta } from "./rutas";
import { emptyDataV2 } from "./types-v2";

test("distanciaHaversineKm: dos puntos idénticos dan distancia 0", () => {
  assert.equal(distanciaHaversineKm({ lat: -34.6, lng: -58.4 }, { lat: -34.6, lng: -58.4 }), 0);
});

test("distanciaHaversineKm: Buenos Aires - La Plata da un valor razonable (~50-60km en línea recta)", () => {
  const d = distanciaHaversineKm({ lat: -34.6037, lng: -58.3816 }, { lat: -34.9215, lng: -57.9545 });
  assert.ok(d > 40 && d < 65, `esperaba ~40-65km, dio ${d}`);
});

test("obtenerProveedorMapa: 'ninguno' devuelve null, nunca inventa un proveedor", () => {
  assert.equal(obtenerProveedorMapa("ninguno"), null);
  assert.equal(obtenerProveedorMapa(undefined), null);
  assert.equal(obtenerProveedorMapa("haversine"), haversineProvider);
  assert.equal(obtenerProveedorMapa("osrm"), osrmProvider);
});

test("urlNavegacionMultiparada: arma origen/destino/waypoints, null si hay menos de 2 puntos", () => {
  assert.equal(urlNavegacionMultiparada([{ lat: 1, lng: 2 }]), null);
  const url = urlNavegacionMultiparada([
    { lat: -34.6, lng: -58.4 },
    { lat: -34.7, lng: -58.5 },
    { lat: -34.8, lng: -58.6 },
  ]);
  assert.match(url!, /origin=-34.6%2C-58.4/);
  assert.match(url!, /destination=-34.8%2C-58.6/);
  assert.match(url!, /waypoints=-34.7%2C-58.5/);
});

test("calcularRuta: sin proveedor conectado devuelve null en vez de inventar una distancia", async () => {
  const paradas: ParadaEntrada[] = [{ pedido_id: "P1", direccion: "x", lat: -34.7, lng: -58.5 }];
  assert.equal(await calcularRuta({ lat: -34.6, lng: -58.4 }, paradas, false, null), null);
});

test("calcularRuta: suma tramos origen->parada1->parada2 y vuelta si regresaOrigen", async () => {
  const origen = { lat: -34.6, lng: -58.4 };
  const paradas: ParadaEntrada[] = [
    { pedido_id: "P1", direccion: "a", lat: -34.65, lng: -58.45 },
    { pedido_id: "P2", direccion: "b", lat: -34.7, lng: -58.5 },
  ];
  const sinVuelta = (await calcularRuta(origen, paradas, false, haversineProvider))!;
  const conVuelta = (await calcularRuta(origen, paradas, true, haversineProvider))!;
  assert.equal(sinVuelta.tramos.length, 2);
  assert.ok(conVuelta.distancia_total_km > sinVuelta.distancia_total_km);
});

test("calcularRuta: una parada sin coordenadas queda con NaN en su tramo, no rompe ni inventa un número", async () => {
  const origen = { lat: -34.6, lng: -58.4 };
  const paradas: ParadaEntrada[] = [
    { pedido_id: "P1", direccion: "sin coords", lat: null, lng: null },
    { pedido_id: "P2", direccion: "b", lat: -34.7, lng: -58.5 },
  ];
  const ruta = (await calcularRuta(origen, paradas, false, haversineProvider))!;
  assert.ok(Number.isNaN(ruta.tramos[0].distancia_km));
  assert.ok(!Number.isNaN(ruta.tramos[1].distancia_km));
  assert.equal(paradasSinCoordenadas(paradas).length, 1);
});

test("calcularRuta: si el proveedor no puede calcular un tramo puntual (servidor caído), ese tramo queda en NaN sin romper el resto de la ruta", async () => {
  const origen = { lat: -34.6, lng: -58.4 };
  const paradas: ParadaEntrada[] = [
    { pedido_id: "P1", direccion: "a", lat: -34.65, lng: -58.45 },
    { pedido_id: "P2", direccion: "b", lat: -34.7, lng: -58.5 },
  ];
  let llamada = 0;
  const providerInestable = {
    id: "osrm" as const,
    nombre: "OSRM inestable (test)",
    esEstimacion: false,
    async calcularTramo(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
      llamada++;
      if (llamada === 1) return null; // primer tramo "falla"
      return haversineProvider.calcularTramo(a, b);
    },
  };
  const ruta = (await calcularRuta(origen, paradas, false, providerInestable))!;
  assert.ok(Number.isNaN(ruta.tramos[0].distancia_km));
  assert.ok(!Number.isNaN(ruta.tramos[1].distancia_km));
});

test("osrmProvider: si fetch tira una excepción (sin red), calcularTramo devuelve null en vez de romper", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("sin red");
  }) as typeof fetch;
  try {
    const resultado = await osrmProvider.calcularTramo({ lat: -34.6, lng: -58.4 }, { lat: -34.7, lng: -58.5 });
    assert.equal(resultado, null);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("osrmProvider: parsea distancia (metros->km) y duración (segundos->min) de la respuesta real de OSRM", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ routes: [{ distance: 12500, duration: 900 }] }), { status: 200 })) as typeof fetch;
  try {
    const resultado = await osrmProvider.calcularTramo({ lat: -34.6, lng: -58.4 }, { lat: -34.7, lng: -58.5 });
    assert.deepEqual(resultado, { distancia_km: 12.5, duracion_min: 15 });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("geocodificarDireccion: menos de 3 caracteres no llama a la red y devuelve null", async () => {
  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (async () => {
    llamadas++;
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await geocodificarDireccion("ab"), null);
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("geocodificarDireccion: parsea lat/lon de Nominatim, null si no hay resultados", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([{ lat: "-34.603722", lon: "-58.381592" }]), { status: 200 })) as typeof fetch;
  try {
    const coords = await geocodificarDireccion("Av. de Mayo 1, CABA");
    assert.deepEqual(coords, { lat: -34.603722, lng: -58.381592 });
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  globalThis.fetch = (async () => new Response("[]", { status: 200 })) as typeof fetch;
  try {
    assert.equal(await geocodificarDireccion("dirección que no existe en ningún lado"), null);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("calcularCostosRuta: reusa litro_nafta/consumo_100km de configuracion.envios", () => {
  const envios = { ...emptyDataV2().configuracion.envios, litro_nafta: 1000, consumo_100km: 10 };
  const costos = calcularCostosRuta(50, envios, 500, 200, 0);
  // 50km × 10/100 = 5 litros × $1000 = $5000 + 500 + 200 = $5700
  assert.equal(costos.litros_estimados, 5);
  assert.equal(costos.costo_nafta_estimado, 5000);
  assert.equal(costos.costo_total_ruta, 5700);
});

test("distribuirCostoRuta: 'equitativo' divide en partes iguales, nunca duplica el total en cada parada", () => {
  const tramos: TramoRuta[] = [
    { pedido_id: "P1", distancia_km: 10, duracion_min: 20 },
    { pedido_id: "P2", distancia_km: 30, duracion_min: 40 },
  ];
  const reparto = distribuirCostoRuta(tramos, 1000, "equitativo");
  assert.equal(reparto.get("P1"), 500);
  assert.equal(reparto.get("P2"), 500);
});

test("distribuirCostoRuta: 'por_distancia_tramo' reparte proporcional a la distancia de cada tramo", () => {
  const tramos: TramoRuta[] = [
    { pedido_id: "P1", distancia_km: 10, duracion_min: 20 },
    { pedido_id: "P2", distancia_km: 30, duracion_min: 40 },
  ];
  const reparto = distribuirCostoRuta(tramos, 1000, "por_distancia_tramo");
  assert.equal(reparto.get("P1"), 250);
  assert.equal(reparto.get("P2"), 750);
});

test("distribuirCostoRuta: si ningún tramo tiene distancia calculada, cae a repartir equitativo en vez de asignar $0 a todos", () => {
  const tramos: TramoRuta[] = [
    { pedido_id: "P1", distancia_km: NaN, duracion_min: NaN },
    { pedido_id: "P2", distancia_km: NaN, duracion_min: NaN },
  ];
  const reparto = distribuirCostoRuta(tramos, 1000, "por_distancia_tramo");
  assert.equal(reparto.get("P1"), 500);
  assert.equal(reparto.get("P2"), 500);
});
