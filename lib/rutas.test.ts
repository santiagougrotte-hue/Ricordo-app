import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineProvider, distanciaHaversineKm, obtenerProveedorMapa, urlNavegacionMultiparada } from "./mapas";
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

test("calcularRuta: sin proveedor conectado devuelve null en vez de inventar una distancia", () => {
  const paradas: ParadaEntrada[] = [{ pedido_id: "P1", direccion: "x", lat: -34.7, lng: -58.5 }];
  assert.equal(calcularRuta({ lat: -34.6, lng: -58.4 }, paradas, false, null), null);
});

test("calcularRuta: suma tramos origen->parada1->parada2 y vuelta si regresaOrigen", () => {
  const origen = { lat: -34.6, lng: -58.4 };
  const paradas: ParadaEntrada[] = [
    { pedido_id: "P1", direccion: "a", lat: -34.65, lng: -58.45 },
    { pedido_id: "P2", direccion: "b", lat: -34.7, lng: -58.5 },
  ];
  const sinVuelta = calcularRuta(origen, paradas, false, haversineProvider)!;
  const conVuelta = calcularRuta(origen, paradas, true, haversineProvider)!;
  assert.equal(sinVuelta.tramos.length, 2);
  assert.ok(conVuelta.distancia_total_km > sinVuelta.distancia_total_km);
});

test("calcularRuta: una parada sin coordenadas queda con NaN en su tramo, no rompe ni inventa un número", () => {
  const origen = { lat: -34.6, lng: -58.4 };
  const paradas: ParadaEntrada[] = [
    { pedido_id: "P1", direccion: "sin coords", lat: null, lng: null },
    { pedido_id: "P2", direccion: "b", lat: -34.7, lng: -58.5 },
  ];
  const ruta = calcularRuta(origen, paradas, false, haversineProvider)!;
  assert.ok(Number.isNaN(ruta.tramos[0].distancia_km));
  assert.ok(!Number.isNaN(ruta.tramos[1].distancia_km));
  assert.equal(paradasSinCoordenadas(paradas).length, 1);
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
