import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proponerClasificacionRecetas,
  referenciaVentasPorGusto,
  desvioPlanSemana,
  calcularComposicionGusto,
  reescalarLineasComponente,
  calcularCuadroNecesidad,
  distribuirCajasPorVariante,
  calcularCuadroNecesidadPorGusto,
} from "./planificacion";
import { calcCosto } from "./calc";
import { emptyData } from "./types";
import type { Ingrediente, RecetaLinea, Pedido, Producto } from "./types";

function ingrediente(overrides: Partial<Ingrediente> = {}): Ingrediente {
  return {
    id: "ING-01",
    nombre: "Harina de arroz",
    unidad: "kg",
    precio_ref: 1000,
    precio_vigente: null,
    seguimiento_stock: false,
    ...overrides,
  };
}

function lineaReceta(overrides: Partial<RecetaLinea> = {}): RecetaLinea {
  return {
    id: "REC-01",
    id_producto: "PROD-01",
    tipo: "Ingrediente",
    concepto: "ING-01",
    cantidad: 0.063,
    ...overrides,
  };
}

test("proponerClasificacionRecetas: packaging siempre se propone como packaging", () => {
  const data = emptyData();
  data.recetas = [lineaReceta({ tipo: "Packaging", concepto: "PKG-01" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, "packaging");
});

test("proponerClasificacionRecetas: CostoFijo queda sin propuesta", () => {
  const data = emptyData();
  data.recetas = [lineaReceta({ tipo: "CostoFijo", concepto: "CF-01" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, null);
});

test("proponerClasificacionRecetas: ingrediente reconocido de masa (harina) se propone masa", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-01", nombre: "Harina de arroz" })];
  data.recetas = [lineaReceta({ concepto: "ING-01" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, "masa");
});

test("proponerClasificacionRecetas: ingrediente reconocido de relleno (espinaca) se propone relleno", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-02", nombre: "Espinaca" })];
  data.recetas = [lineaReceta({ concepto: "ING-02" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, "relleno");
});

test("proponerClasificacionRecetas: nombres con acentos matchean igual (cúrcuma, jamón)", () => {
  const data = emptyData();
  data.ingredientes = [
    ingrediente({ id: "ING-03", nombre: "Cúrcuma" }),
    ingrediente({ id: "ING-04", nombre: "Jamón cocido" }),
  ];
  data.recetas = [
    lineaReceta({ id: "REC-03", concepto: "ING-03" }),
    lineaReceta({ id: "REC-04", concepto: "ING-04" }),
  ];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas.find((p) => p.id === "REC-03")?.componente, "masa");
  assert.equal(propuestas.find((p) => p.id === "REC-04")?.componente, "relleno");
});

test("proponerClasificacionRecetas: ingrediente ambiguo (sal) queda sin propuesta en vez de adivinar", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-05", nombre: "Sal" })];
  data.recetas = [lineaReceta({ concepto: "ING-05" })];
  const propuestas = proponerClasificacionRecetas(data);
  assert.equal(propuestas[0].componente, null);
});

test("proponerClasificacionRecetas: no muta data.recetas ni escribe el campo componente", () => {
  const data = emptyData();
  data.ingredientes = [ingrediente({ id: "ING-01", nombre: "Harina de arroz" })];
  data.recetas = [lineaReceta({ concepto: "ING-01" })];
  proponerClasificacionRecetas(data);
  assert.equal(data.recetas[0].componente, undefined);
});

function producto(overrides: Partial<Producto> = {}): Producto {
  return { id: "PROD-01", id_base: "PROD-01", nombre: "Raviolón de espinaca", precio_venta: 20000, activo: true, ...overrides };
}

function pedido(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: "PED-01",
    id_detalle: "PED-01-A",
    id_cliente: "CLI-01",
    id_producto: "PROD-01",
    nombre_producto: "Raviolón de espinaca",
    cantidad: 1,
    precio_unitario: 20000,
    precio_total: 20000,
    descuento_monto: 0,
    precio_neto: 20000,
    fecha: "2026-07-10",
    estado: "Entregado",
    canal: "Minorista",
    km_envio: 0,
    costo_envio: 0,
    ...overrides,
  };
}

test("referenciaVentasPorGusto: replica el ejemplo real (14→12→7, promedio 11, tendencia down)", () => {
  const data = emptyData();
  data.productos = [producto()];
  data.config_planificacion.ventana_meses_referencia = 3;
  // hoy = agosto 2026 → ventana = mayo, junio, julio (los 3 meses cerrados anteriores)
  const hoy = new Date("2026-08-15T12:00:00");
  data.pedidos = [
    pedido({ id_detalle: "A", fecha: "2026-05-15", cantidad: 14 }),
    pedido({ id_detalle: "B", fecha: "2026-06-15", cantidad: 12 }),
    pedido({ id_detalle: "C", fecha: "2026-07-15", cantidad: 7 }),
  ];
  const [ref] = referenciaVentasPorGusto(data, hoy);
  assert.deepEqual(ref.historicoMeses, [14, 12, 7]);
  assert.equal(ref.promedioMes, 11);
  assert.equal(ref.ultimoMesCerrado, 7);
  assert.equal(ref.tendencia, "down");
});

test("referenciaVentasPorGusto: gusto sin ventas en la ventana aparece en cero, no se oculta", () => {
  const data = emptyData();
  data.productos = [producto({ id: "PROD-02", nombre: "Sin ventas" })];
  const [ref] = referenciaVentasPorGusto(data, new Date("2026-08-15T12:00:00"));
  assert.equal(ref.promedioMes, 0);
  assert.equal(ref.ultimoMesCerrado, 0);
  assert.equal(ref.tendencia, "flat");
});

test("referenciaVentasPorGusto: excluye productos inactivos", () => {
  const data = emptyData();
  data.productos = [producto({ activo: false })];
  const referencia = referenciaVentasPorGusto(data);
  assert.equal(referencia.length, 0);
});

test("desvioPlanSemana: sin desvío cuando semana×4,33 coincide con el mes", () => {
  const r = desvioPlanSemana(43.3, 10, 15);
  assert.equal(r.excedeUmbral, false);
});

test("desvioPlanSemana: marca el aviso cuando el desvío supera el umbral, sin bloquear", () => {
  // 10 cajas/semana × 4,33 = 43,3 vs 30 cargadas en el mes → +44% de desvío
  const r = desvioPlanSemana(30, 10, 15);
  assert.ok(r.desviacionPct !== null && r.desviacionPct > 15);
  assert.equal(r.excedeUmbral, true);
});

// --- Bloques 3 y 4: composición, reescalado y cuadros de necesidad ----------------------

function ingredienteEspinaca(): Ingrediente[] {
  return [
    { id: "ING-PREMEZCLA", nombre: "Premezcla", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-HARINA", nombre: "Harina de arroz", unidad: "kg", precio_ref: 1500, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-HUEVO", nombre: "Huevos", unidad: "unidad", precio_ref: 150, precio_vigente: null, seguimiento_stock: false, peso_unitario_g: 50 },
    { id: "ING-CURCUMA", nombre: "Cúrcuma", unidad: "kg", precio_ref: 8000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-ESPINACA", nombre: "Espinaca", unidad: "kg", precio_ref: 1600, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-RICOTTA", nombre: "Ricotta", unidad: "kg", precio_ref: 4500, precio_vigente: null, seguimiento_stock: false },
  ];
}

function recetaEspinacaClasificada(): RecetaLinea[] {
  return [
    { id: "REC-1", id_producto: "PROD-03", tipo: "Ingrediente", concepto: "ING-PREMEZCLA", cantidad: 0.087, componente: "masa" },
    { id: "REC-2", id_producto: "PROD-03", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.063, componente: "masa" },
    { id: "REC-3", id_producto: "PROD-03", tipo: "Ingrediente", concepto: "ING-HUEVO", cantidad: 1, componente: "masa" },
    { id: "REC-4", id_producto: "PROD-03", tipo: "Ingrediente", concepto: "ING-CURCUMA", cantidad: 0.005, componente: "masa" },
    { id: "REC-5", id_producto: "PROD-03", tipo: "Ingrediente", concepto: "ING-ESPINACA", cantidad: 0.28, componente: "relleno" },
    { id: "REC-6", id_producto: "PROD-03", tipo: "Ingrediente", concepto: "ING-RICOTTA", cantidad: 0.084, componente: "relleno" },
  ];
}

test("calcularComposicionGusto: masa de espinaca da 205g/caja con el % correcto (huevo incluido por peso)", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = recetaEspinacaClasificada();
  const composicion = calcularComposicionGusto(data, "PROD-03", "masa");
  assert.equal(composicion.totalGramosPorCaja, 205); // 87+63+50+5
  const huevo = composicion.ingredientes.find((i) => i.id_ingrediente === "ING-HUEVO");
  assert.ok(huevo);
  assert.ok(Math.abs(huevo!.pctComposicion - (50 / 205) * 100) < 0.001);
  assert.equal(composicion.ingredientesSinPesoConfigurado.length, 0);
});

test("calcularComposicionGusto: relleno de espinaca da 364g/caja", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = recetaEspinacaClasificada();
  const composicion = calcularComposicionGusto(data, "PROD-03", "relleno");
  assert.equal(composicion.totalGramosPorCaja, 364); // 280+84
});

test("calcularComposicionGusto: ingrediente 'unidad' sin peso_unitario_g no rompe, queda marcado", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-BOLSA", nombre: "Bolsas", unidad: "unidad", precio_ref: 10, precio_vigente: null, seguimiento_stock: false }];
  data.recetas = [{ id: "REC-1", id_producto: "PROD-X", tipo: "Ingrediente", concepto: "ING-BOLSA", cantidad: 2, componente: "masa" }];
  const composicion = calcularComposicionGusto(data, "PROD-X", "masa");
  assert.equal(composicion.totalGramosPorCaja, 0);
  assert.deepEqual(composicion.ingredientesSinPesoConfigurado, ["Bolsas"]);
});

test("calcularComposicionGusto: producto migrado al modelo base/venta usa la receta derivada, no queda 'sin composición'", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  const base: Producto = {
    id: "PROD-03",
    id_base: "PROD-03",
    nombre: "Raviolon de espinaca",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [
      { id: "RU-1", id_ingrediente: "ING-PREMEZCLA", cantidad: 0.01 },
      { id: "RU-2", id_ingrediente: "ING-HARINA", cantidad: 0.005 },
    ],
    receta_relleno_unidad: [{ id: "RU-3", id_ingrediente: "ING-ESPINACA", cantidad: 0.05 }],
  };
  const venta: Producto = {
    id: "PROD-09",
    id_base: "PROD-03",
    nombre: "Espinaca mayorista",
    precio_venta: 10500,
    activo: true,
    unidades_por_paquete: 6,
  };
  data.productos = [base, venta];
  // data.recetas queda vacío a propósito: un producto de venta migrado no tiene RecetaLinea
  // de Ingrediente propia, así que sin el despacho a la receta derivada esto daría 0.

  const masa = calcularComposicionGusto(data, "PROD-09", "masa");
  assert.ok(Math.abs(masa.totalGramosPorCaja - 90) < 0.001); // (0,01+0,005 kg) × 6 unidades × 1000

  const relleno = calcularComposicionGusto(data, "PROD-09", "relleno");
  assert.ok(Math.abs(relleno.totalGramosPorCaja - 300) < 0.001); // 0,05kg × 6 × 1000
  assert.equal(relleno.ingredientes.length, 1);
  assert.equal(relleno.ingredientes[0].id_ingrediente, "ING-ESPINACA");
});

test("calcularComposicionGusto: producto NO migrado sigue leyendo RecetaLinea.componente aunque exista un Producto en data.productos", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = recetaEspinacaClasificada();
  data.productos = [{ id: "PROD-03", id_base: "PROD-03", nombre: "Raviolon de espinaca", precio_venta: 13000, activo: true }];

  const composicion = calcularComposicionGusto(data, "PROD-03", "masa");
  assert.equal(composicion.totalGramosPorCaja, 205);
});

test("reescalarLineasComponente: reescala solo las líneas del componente indicado", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = recetaEspinacaClasificada();
  const reescaladas = reescalarLineasComponente(data, "PROD-03", "masa", 2);
  const premezcla = reescaladas.find((r) => r.id === "REC-1");
  const espinaca = reescaladas.find((r) => r.id === "REC-5");
  assert.equal(premezcla?.cantidad, 0.174); // masa: se duplica
  assert.equal(espinaca?.cantidad, 0.28); // relleno: no se toca
});

test("reescalarLineasComponente + calcCosto: escalar la masa cambia el costo del producto (para el cartel de margen)", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = recetaEspinacaClasificada();
  const costoOriginal = calcCosto(data, "PROD-03");
  const dataEscalada = { ...data, recetas: reescalarLineasComponente(data, "PROD-03", "masa", 2) };
  const costoNuevo = calcCosto(dataEscalada, "PROD-03");
  assert.ok(costoNuevo > costoOriginal, "duplicar la masa tiene que aumentar el costo total del producto");
});

test("calcularCuadroNecesidad: 10 cajas de espinaca dan la premezcla redondeada hacia arriba y el huevo en gramos y unidades", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = recetaEspinacaClasificada();
  data.productos = [producto({ id: "PROD-03", nombre: "Raviolón de espinaca" })];

  const cuadro = calcularCuadroNecesidad(data, "masa", new Map([["PROD-03", 10]]));
  const premezcla = cuadro.ingredientes.find((i) => i.id_ingrediente === "ING-PREMEZCLA");
  assert.ok(premezcla);
  assert.equal(premezcla!.cantidadNativa, 0.87); // 87g × 10 = 870g = 0,87kg
  assert.equal(premezcla!.cantidadNativaRedondeada, 1); // "a comprar" redondeado hacia arriba

  const huevo = cuadro.ingredientes.find((i) => i.id_ingrediente === "ING-HUEVO");
  assert.ok(huevo);
  assert.equal(huevo!.cantidadNativa, 500); // 50g × 10 cajas
  assert.equal(huevo!.unidadesConversion, 10); // 500g ÷ 50g/huevo = 10 huevos

  assert.ok(cuadro.costoTotal > 0);
});

test("calcularCuadroNecesidad: consolida el mismo ingrediente entre dos gustos", () => {
  const data = emptyData();
  data.ingredientes = ingredienteEspinaca();
  data.recetas = [
    ...recetaEspinacaClasificada(),
    { id: "REC-7", id_producto: "PROD-05", tipo: "Ingrediente", concepto: "ING-PREMEZCLA", cantidad: 0.1, componente: "masa" },
  ];
  data.productos = [producto({ id: "PROD-03" }), producto({ id: "PROD-05", nombre: "Jamón y queso" })];

  const cuadro = calcularCuadroNecesidad(
    data,
    "masa",
    new Map([
      ["PROD-03", 10],
      ["PROD-05", 5],
    ])
  );
  const premezcla = cuadro.ingredientes.find((i) => i.id_ingrediente === "ING-PREMEZCLA");
  assert.ok(premezcla);
  assert.equal(premezcla!.detallePorGusto.length, 2);
  // PROD-03: 87g×10=870g, PROD-05: 100g×5=500g (100% premezcla, único ingrediente) → total 1370g = 1,37kg
  assert.equal(premezcla!.cantidadNativa, 1.37);
});

test("calcularCuadroNecesidad: gusto con cajas planificadas pero sin líneas clasificadas queda en gustosSinComposicion", () => {
  const data = emptyData();
  data.productos = [producto({ id: "PROD-14", nombre: "Salsa" })];
  const cuadro = calcularCuadroNecesidad(data, "masa", new Map([["PROD-14", 5]]));
  assert.deepEqual(cuadro.gustosSinComposicion, ["Salsa"]);
  assert.equal(cuadro.ingredientes.length, 0);
});

// --- Agrupación por producto base (gusto): Bloques 1 y 4 ---------------------------------

test("referenciaVentasPorGusto: suma las ventas de todas las variantes de canal bajo el mismo gusto", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-15T12:00:00");
  data.productos = [
    producto({ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza" }),
    producto({ id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista" }),
  ];
  data.pedidos = [
    pedido({ id_detalle: "A", id_producto: "PROD-01", fecha: "2026-07-10", cantidad: 5 }),
    pedido({ id_detalle: "B", id_producto: "PROD-08", fecha: "2026-07-12", cantidad: 3 }),
  ];
  const [ref] = referenciaVentasPorGusto(data, hoy);
  assert.equal(ref.id_base, "PROD-01");
  assert.deepEqual(ref.idsVariantes.sort(), ["PROD-01", "PROD-08"]);
  assert.equal(ref.ultimoMesCerrado, 8); // 5 + 3, ambas variantes suman al mismo gusto
});

test("distribuirCajasPorVariante: reparte proporcional a las ventas históricas de cada variante", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-15T12:00:00");
  data.productos = [
    producto({ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza" }),
    producto({ id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista" }),
  ];
  // 75% de las ventas históricas son PROD-01, 25% PROD-08
  data.pedidos = [
    pedido({ id_detalle: "A", id_producto: "PROD-01", fecha: "2026-07-10", cantidad: 15 }),
    pedido({ id_detalle: "B", id_producto: "PROD-08", fecha: "2026-07-12", cantidad: 5 }),
  ];
  const distribucion = distribuirCajasPorVariante(data, "PROD-01", 40, hoy);
  assert.equal(distribucion.get("PROD-01"), 30); // 75% de 40
  assert.equal(distribucion.get("PROD-08"), 10); // 25% de 40
});

test("distribuirCajasPorVariante: sin ventas históricas, todo va al producto base", () => {
  const data = emptyData();
  data.productos = [
    producto({ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza" }),
    producto({ id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista" }),
  ];
  const distribucion = distribuirCajasPorVariante(data, "PROD-01", 20);
  assert.equal(distribucion.get("PROD-01"), 20);
  assert.equal(distribucion.get("PROD-08"), undefined);
});

test("calcularCuadroNecesidadPorGusto: cada variante usa su propia receta al expandir desde el plan por gusto", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-15T12:00:00");
  data.ingredientes = ingredienteEspinaca();
  data.productos = [
    producto({ id: "PROD-03", id_base: "PROD-03", nombre: "Raviolón de espinaca" }),
    producto({ id: "PROD-09", id_base: "PROD-03", nombre: "Espinaca mayorista" }),
  ];
  // PROD-03 usa la receta "espinaca" de siempre (masa 205g); PROD-09 tiene su propia receta,
  // con el doble de premezcla por caja.
  data.recetas = [
    ...recetaEspinacaClasificada(),
    { id: "REC-9", id_producto: "PROD-09", tipo: "Ingrediente", concepto: "ING-PREMEZCLA", cantidad: 0.174, componente: "masa" },
  ];
  // Todas las ventas históricas son de PROD-09 → toda la producción planificada del gusto se
  // reparte ahí, y debe usar SU receta (0.174kg de premezcla por caja), no la de PROD-03.
  data.pedidos = [pedido({ id_detalle: "A", id_producto: "PROD-09", fecha: "2026-07-10", cantidad: 10 })];

  const cuadro = calcularCuadroNecesidadPorGusto(data, "masa", new Map([["PROD-03", 10]]), hoy);
  const premezcla = cuadro.ingredientes.find((i) => i.id_ingrediente === "ING-PREMEZCLA");
  assert.ok(premezcla);
  assert.equal(premezcla!.cantidadNativa, 1.74); // 0.174kg × 10 cajas, con la receta de PROD-09
});
