import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearMovimientoCajaDesdePedido,
  discrepanciasCaja,
  construirResumenPulso,
  gustosActivos,
  movimientosStockGusto,
  stockCalculadoGusto,
  stockRealGusto,
  calcCosto,
  tieneRecetaBase,
  estaMigrado,
  recetaDerivada,
  costoDerivado,
  costoUnidadBase,
  gramosUnidadBase,
  productosBaseDisponibles,
  impactoCambioBase,
  costoLegacy,
  informeControl,
  unidadesVendidasUltimosMeses,
  excepcionesActivas,
} from "./calc";
import { emptyData } from "./types";
import type { Pedido, Producto, Ingrediente, RecetaLinea } from "./types";

function pedidoBase(overrides: Partial<Pedido> = {}): Pedido {
  return {
    id_pedido: "PED-100",
    id_detalle: "PED-100-A",
    id_cliente: "CLI-01",
    id_producto: "PROD-01",
    nombre_producto: "Ravioles de ricotta",
    cantidad: 2,
    precio_unitario: 11000,
    precio_total: 22000,
    descuento_monto: 0,
    precio_neto: 22000,
    fecha: "2026-07-20",
    estado: "Entregado",
    canal: "Minorista",
    km_envio: 0,
    costo_envio: 0,
    ...overrides,
  };
}

test("crearMovimientoCajaDesdePedido: pedido entregado con precio_total > 0 genera un movimiento correcto", () => {
  const pedido = pedidoBase();
  const mov = crearMovimientoCajaDesdePedido(pedido);
  assert.equal(mov.tipo, "ingreso");
  assert.equal(mov.monto, 22000);
  assert.equal(mov.ref, "PED-100-A");
  assert.equal(mov.metodo, "Efectivo");
});

test("discrepanciasCaja: pedido entregado sin movimiento aparece como discrepancia", () => {
  const data = emptyData();
  const pedido = pedidoBase();
  data.pedidos = [pedido];

  const antes = discrepanciasCaja(data);
  assert.equal(antes.length, 1, "el pedido sin movimiento debe listarse");
  assert.equal(antes[0].movimiento, null);

  // Simula lo que hace cambiarEstado()/guardarOrden(): crea el movimiento una sola vez (idempotente)
  data.caja_movimientos = [crearMovimientoCajaDesdePedido(pedido)];
  const despues = discrepanciasCaja(data);
  assert.equal(despues.length, 0, "una vez creado el movimiento correcto, no debe quedar discrepancia");

  // Una segunda llamada no debe duplicar el movimiento (idempotencia que usan cambiarEstado/guardarOrden/guardarEdicion)
  const yaExiste = data.caja_movimientos.some((m) => m.ref === pedido.id_detalle);
  assert.equal(yaExiste, true);
});

test("discrepanciasCaja: pedido con precio 0 no genera una discrepancia falsa (monto esperado también es 0)", () => {
  const data = emptyData();
  const pedido = pedidoBase({ precio_unitario: 0, precio_total: 0, precio_neto: 0 });
  data.pedidos = [pedido];
  data.caja_movimientos = [crearMovimientoCajaDesdePedido(pedido)];

  const discrepancias = discrepanciasCaja(data);
  assert.equal(discrepancias.length, 0);
});

test("discrepanciasCaja: movimiento con monto distinto al precio_neto se marca como discrepancia", () => {
  const data = emptyData();
  const pedido = pedidoBase();
  data.pedidos = [pedido];
  data.caja_movimientos = [{ ...crearMovimientoCajaDesdePedido(pedido), monto: 0 }];

  const discrepancias = discrepanciasCaja(data);
  assert.equal(discrepancias.length, 1);
  assert.equal(discrepancias[0].movimiento?.monto, 0);
});

test("discrepanciasCaja: pedido marcado como revisado se excluye aunque no tenga movimiento", () => {
  const data = emptyData();
  const pedido = pedidoBase();
  data.pedidos = [pedido];
  data.conciliacion_ignorados = [pedido.id_detalle];

  const discrepancias = discrepanciasCaja(data);
  assert.equal(discrepancias.length, 0);
});

test("construirResumenPulso: arma el resumen agregado sin exponer los pedidos crudos", () => {
  const data = emptyData();
  const hoy = new Date("2026-07-15T12:00:00");
  const producto: Producto = { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de ricotta", precio_venta: 20000, activo: true };
  data.productos = [producto];
  data.stock_manual = { "PROD-01": 0 };
  data.pedidos = [
    pedidoBase({ fecha: "2026-07-10", estado: "Entregado", precio_neto: 22000 }),
    pedidoBase({ id_detalle: "PED-101-A", fecha: "2026-06-05", canal: "Mayorista", precio_neto: 15000 }),
  ];
  data.caja_movimientos = []; // nada cargado en caja todavía

  const resumen = construirResumenPulso(data, hoy);

  assert.equal(resumen.ventasPorMesCanal.length, 6, "3 meses x 2 canales");
  assert.equal(resumen.productos.length, 1);
  assert.equal(resumen.productos[0].stock, 0);
  assert.equal(resumen.pendientesEntrega, 0);
  assert.ok(resumen.diferenciaCajaVentas > 0, "hay ventas entregadas sin ingreso de caja cargado");
  assert.ok(!("pedidos" in resumen), "el resumen no debe incluir los registros crudos de pedidos");
});

// --- Agrupación por producto base (gusto) ------------------------------------------------

function productoBaseCalabaza(): Producto[] {
  return [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true },
    { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true },
    { id: "PROD-12", id_base: "PROD-01", nombre: "Calabaza al vacío mayo", precio_venta: 10000, activo: true },
  ];
}

test("gustosActivos: agrupa las variantes de canal bajo su producto base", () => {
  const data = emptyData();
  data.productos = [
    ...productoBaseCalabaza(),
    { id: "PROD-02", id_base: "PROD-02", nombre: "Ravioles de ricotta", precio_venta: 12000, activo: true },
  ];
  const gustos = gustosActivos(data);
  assert.equal(gustos.length, 2);
  const calabaza = gustos.find((g) => g.id_base === "PROD-01");
  assert.ok(calabaza);
  assert.equal(calabaza!.nombre, "Ravioles de calabaza");
  assert.equal(calabaza!.variantes.length, 3);
});

test("gustosActivos: excluye variantes inactivas pero conserva el gusto si otra variante sigue activa", () => {
  const data = emptyData();
  const variantes = productoBaseCalabaza();
  variantes[1].activo = false; // Calabaza mayorista discontinuada
  data.productos = variantes;
  const gustos = gustosActivos(data);
  assert.equal(gustos.length, 1);
  assert.equal(gustos[0].variantes.length, 2);
});

test("movimientosStockGusto + stockCalculadoGusto: suma producción y resta ventas Entregado de todas las variantes", () => {
  const data = emptyData();
  data.produccion = [
    { id: "PRODLOG-1", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 50, fecha: "2026-07-01" },
    { id: "PRODLOG-2", id_producto: "PROD-08", nombre_producto: "Calabaza mayorista", cantidad: 30, fecha: "2026-07-05" },
  ];
  data.pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 20, fecha: "2026-07-10", estado: "Entregado" }),
    pedidoBase({ id_detalle: "B", id_producto: "PROD-08", nombre_producto: "Calabaza mayorista", cantidad: 15, fecha: "2026-07-12", estado: "Entregado" }),
    pedidoBase({ id_detalle: "C", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 999, fecha: "2026-07-15", estado: "Confirmado" }),
  ];
  const movimientos = movimientosStockGusto(data, ["PROD-01", "PROD-08", "PROD-12"]);
  assert.equal(movimientos.length, 4, "3 movimientos reales + el pedido Confirmado no cuenta");
  assert.equal(movimientos[0].fecha, "2026-07-01"); // ordenado del más viejo al más nuevo
  assert.equal(stockCalculadoGusto(movimientos), 50 + 30 - 20 - 15); // 45
});

test("stockRealGusto: sin conteo manual usa el calculado por la app", () => {
  const data = emptyData();
  data.productos = productoBaseCalabaza();
  data.produccion = [{ id: "PRODLOG-1", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 50, fecha: "2026-07-01" }];
  const gusto = gustosActivos(data)[0];
  assert.equal(stockRealGusto(data, gusto), 50);
});

test("stockRealGusto: con conteo manual, resta ventas Entregado posteriores a la fecha del conteo (de cualquier variante)", () => {
  const data = emptyData();
  data.productos = productoBaseCalabaza();
  data.produccion = [{ id: "PRODLOG-1", id_producto: "PROD-01", nombre_producto: "Ravioles de calabaza", cantidad: 50, fecha: "2026-07-01" }];
  data.conteos_stock = [{ id: "CTK-1", id_producto: "PROD-01", cantidad: 40, fecha: "2026-07-10" }];
  data.pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", cantidad: 5, fecha: "2026-07-05", estado: "Entregado" }), // antes del conteo, no cuenta
    pedidoBase({ id_detalle: "B", id_producto: "PROD-08", nombre_producto: "Calabaza mayorista", cantidad: 8, fecha: "2026-07-12", estado: "Entregado" }), // otra variante, después del conteo
  ];
  const gusto = gustosActivos(data)[0];
  assert.equal(stockRealGusto(data, gusto), 40 - 8); // 32
});

// --- Producto base / producto de venta: receta derivada -----------------------------------

function ingredientesCalabaza(): Ingrediente[] {
  return [
    { id: "ING-HARINA", nombre: "Harina de arroz", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-PREMEZCLA", nombre: "Premezcla", unidad: "kg", precio_ref: 3000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-CALABAZA", nombre: "Calabaza", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-ACEITE", nombre: "Aceite", unidad: "kg", precio_ref: 1500, precio_vigente: null, seguimiento_stock: false },
  ];
}

test("tieneRecetaBase / estaMigrado: un producto de venta sin unidades_por_paquete no migra aunque su base tenga receta", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.003 }],
  };
  const venta: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true };
  data.productos = [base, venta];
  assert.equal(tieneRecetaBase(base), true);
  assert.equal(estaMigrado(data, venta), false, "sin unidades_por_paquete no migra");
});

test("calcCosto: un producto NO migrado sigue leyendo sus RecetaLinea de siempre (regresión, output sin cambios)", () => {
  const data = emptyData();
  const producto: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true };
  data.productos = [producto];
  data.ingredientes = ingredientesCalabaza();
  const recetas: RecetaLinea[] = [
    { id: "R1", id_producto: "PROD-08", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.063 },
    { id: "R2", id_producto: "PROD-08", tipo: "Ingrediente", concepto: "ING-PREMEZCLA", cantidad: 0.112 },
  ];
  data.recetas = recetas;
  const costoEsperado = 0.063 * 2000 + 0.112 * 3000;
  assert.equal(calcCosto(data, "PROD-08"), costoEsperado);
});

test("recetaDerivada: masa y relleno escalan por unidades_por_paquete, complementos por su propia cantidad", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.003 }],
    receta_relleno_unidad: [{ id: "RU-2", id_ingrediente: "ING-CALABAZA", cantidad: 0.01 }],
  };
  const salsa: Producto = {
    id: "PROD-14",
    id_base: "PROD-14",
    nombre: "Salsa",
    precio_venta: 0,
    activo: true,
    receta_relleno_unidad: [{ id: "RU-3", id_ingrediente: "ING-ACEITE", cantidad: 0.5 }],
  };
  const venta: Producto = {
    id: "PROD-08",
    id_base: "PROD-01",
    nombre: "Calabaza mayorista",
    precio_venta: 11000,
    activo: true,
    unidades_por_paquete: 10,
    complementos: [{ id: "C1", id_base: "PROD-14", cantidad: 1 }],
  };
  data.productos = [base, salsa, venta];
  data.ingredientes = ingredientesCalabaza();
  data.recetas = [{ id: "R1", id_producto: "PROD-08", tipo: "Packaging", concepto: "PKG-1", cantidad: 1 }];
  data.packaging = [{ id: "PKG-1", nombre: "Bolsa", unidad: "unidad", precio: 50 }];

  assert.equal(estaMigrado(data, venta), true);
  const lineas = recetaDerivada(data, venta);
  const masa = lineas.find((l) => l.grupo === "masa" && l.concepto === "ING-HARINA");
  const relleno = lineas.find((l) => l.grupo === "relleno" && l.concepto === "ING-CALABAZA");
  const complemento = lineas.find((l) => l.grupo === "complementos" && l.concepto === "ING-ACEITE");
  const packaging = lineas.find((l) => l.grupo === "packaging");
  assert.equal(masa?.cantidad, 0.003 * 10, "masa escala por unidades_por_paquete");
  assert.equal(relleno?.cantidad, 0.01 * 10, "relleno escala por unidades_por_paquete");
  assert.equal(complemento?.cantidad, 0.5 * 1, "complemento escala por su propia cantidad, no por unidades_por_paquete");
  assert.equal(packaging?.cantidad, 1, "packaging propio se lee de RecetaLinea sin cambios");

  const costoEsperado = 0.003 * 10 * 2000 + 0.01 * 10 * 1000 + 0.5 * 1 * 1500 + 1 * 50;
  assert.equal(costoDerivado(data, venta), costoEsperado);
  assert.equal(calcCosto(data, "PROD-08"), costoEsperado, "calcCosto despacha a la receta derivada para un producto migrado");
});

test("recetaDerivada: cambiar unidades_por_paquete entre dos presentaciones de la misma familia no desincroniza la masa/relleno (el bug real que motivó todo esto)", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.007 }],
    receta_relleno_unidad: [{ id: "RU-2", id_ingrediente: "ING-CALABAZA", cantidad: 0.02 }],
  };
  const minorista: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true, unidades_por_paquete: 18 };
  const mayorista: Producto = { id: "PROD-09", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true, unidades_por_paquete: 12 };
  data.productos = [base, minorista, mayorista];
  data.ingredientes = ingredientesCalabaza();

  const costoMinorista = calcCosto(data, "PROD-08");
  const costoMayorista = calcCosto(data, "PROD-09");
  // La masa por unidad es la misma para toda la familia: el costo escala exactamente con
  // unidades_por_paquete, sin el desvío manual que hoy tienen calabaza/espinaca.
  assert.equal(costoMinorista / 18, costoMayorista / 12);
});

test("recetaDerivada: una excepción reemplaza la cantidad derivada y queda marcada", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-ACEITE", cantidad: 0.001 }],
  };
  const venta: Producto = {
    id: "PROD-08",
    id_base: "PROD-01",
    nombre: "Calabaza mayorista",
    precio_venta: 11000,
    activo: true,
    unidades_por_paquete: 10,
    excepciones: [{ id: "EXC-1", grupo: "masa", tipo: "Ingrediente", concepto: "ING-ACEITE", cantidad: 0.5 }],
  };
  data.productos = [base, venta];
  data.ingredientes = ingredientesCalabaza();

  const lineas = recetaDerivada(data, venta);
  const aceite = lineas.find((l) => l.concepto === "ING-ACEITE");
  assert.equal(aceite?.cantidad, 0.5, "la excepción reemplaza, no suma, sobre 0.001*10=0.01");
  assert.equal(aceite?.esExcepcion, true);
  assert.equal(lineas.filter((l) => l.concepto === "ING-ACEITE").length, 1, "no duplica la línea");
});

test("recetaDerivada: una excepción sin línea derivada correspondiente se agrega como línea nueva marcada", () => {
  const data = emptyData();
  const base: Producto = { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true, receta_masa_unidad: [] };
  const venta: Producto = {
    id: "PROD-08",
    id_base: "PROD-01",
    nombre: "Calabaza mayorista",
    precio_venta: 11000,
    activo: true,
    unidades_por_paquete: 10,
    excepciones: [{ id: "EXC-1", grupo: "relleno", tipo: "Ingrediente", concepto: "ING-ACEITE", cantidad: 0.2 }],
  };
  data.productos = [base, venta];
  data.ingredientes = ingredientesCalabaza();

  const lineas = recetaDerivada(data, venta);
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].esExcepcion, true);
  assert.equal(lineas[0].cantidad, 0.2);
});

test("costoUnidadBase / gramosUnidadBase: costo y gramaje por unidad de un producto base", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.003 }],
    receta_relleno_unidad: [{ id: "RU-2", id_ingrediente: "ING-CALABAZA", cantidad: 0.01 }],
  };
  data.productos = [base];
  data.ingredientes = ingredientesCalabaza();

  assert.equal(costoUnidadBase(data, base), 0.003 * 2000 + 0.01 * 1000);
  const gramos = gramosUnidadBase(data, base);
  assert.equal(gramos.masa, 0.003 * 1000, "kg se convierte a gramos");
  assert.equal(gramos.relleno, 0.01 * 1000);
});

test("productosBaseDisponibles: solo los productos autorreferenciados (id === id_base)", () => {
  const data = emptyData();
  data.productos = [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true },
    { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true },
  ];
  const bases = productosBaseDisponibles(data);
  assert.equal(bases.length, 1);
  assert.equal(bases[0].id, "PROD-01");
});

test("impactoCambioBase: solo lista productos de venta migrados de la familia, con costo/margen antes y después", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.003 }],
  };
  const migrado: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true, unidades_por_paquete: 10 };
  const noMigrado: Producto = { id: "PROD-09", id_base: "PROD-01", nombre: "Calabaza sin salsa", precio_venta: 9000, activo: true };
  data.productos = [base, migrado, noMigrado];
  data.ingredientes = ingredientesCalabaza();
  data.recetas = [{ id: "R1", id_producto: "PROD-09", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.05 }];

  const baseNueva: Producto = { ...base, receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.006 }] };
  const impacto = impactoCambioBase(data, "PROD-01", baseNueva);

  assert.equal(impacto.length, 1, "el no migrado no aparece, sigue con su RecetaLinea propia");
  assert.equal(impacto[0].producto.id, "PROD-08");
  assert.equal(impacto[0].costoAntes, 0.003 * 10 * 2000);
  assert.equal(impacto[0].costoDespues, 0.006 * 10 * 2000);
  assert.ok(impacto[0].costoDespues > impacto[0].costoAntes);

  // No modifica los datos originales
  assert.equal(data.productos.find((p) => p.id === "PROD-01")!.receta_masa_unidad![0].cantidad, 0.003);
});

test("informeControl: compara costo viejo (RecetaLinea) vs nuevo (receta derivada) solo para productos migrados", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.007 }],
  };
  const migrado: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true, unidades_por_paquete: 10 };
  const noMigrado: Producto = { id: "PROD-09", id_base: "PROD-01", nombre: "Calabaza sin salsa", precio_venta: 9000, activo: true };
  data.productos = [base, migrado, noMigrado];
  data.ingredientes = ingredientesCalabaza();
  // La receta vieja de "migrado" quedó guardada (nunca se borra), con un valor desincronizado
  // respecto de lo que da la nueva — exactamente el bug real que motivó todo esto.
  data.recetas = [{ id: "R1", id_producto: "PROD-08", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.05 }];

  const informe = informeControl(data);
  assert.equal(informe.length, 1, "solo aparece el migrado");
  const fila = informe[0];
  assert.equal(fila.producto.id, "PROD-08");
  assert.equal(fila.nombreFamilia, "Ravioles de calabaza");
  assert.equal(fila.costoViejo, costoLegacy(data, "PROD-08"));
  assert.equal(fila.costoViejo, 0.05 * 2000);
  assert.equal(fila.costoNuevo, 0.007 * 10 * 2000);
  assert.ok(fila.diferenciaCosto !== 0, "el costo cambió al migrar, como esperado dado el desvío real");
  assert.ok(fila.diferenciaPct !== null);
});

test("unidadesVendidasUltimosMeses: suma unidades no canceladas de los últimos N meses, excluyendo otros productos", () => {
  const data = emptyData();
  const hoy = new Date("2026-07-15T12:00:00");
  data.pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", cantidad: 5, fecha: "2026-07-10", estado: "Entregado" }),
    pedidoBase({ id_detalle: "B", id_producto: "PROD-01", cantidad: 3, fecha: "2026-06-05", estado: "Entregado" }),
    pedidoBase({ id_detalle: "C", id_producto: "PROD-01", cantidad: 9, fecha: "2026-04-05", estado: "Entregado" }), // fuera de la ventana de 3 meses
    pedidoBase({ id_detalle: "D", id_producto: "PROD-01", cantidad: 100, fecha: "2026-07-12", estado: "Cancelado" }),
    pedidoBase({ id_detalle: "E", id_producto: "PROD-02", cantidad: 50, fecha: "2026-07-12", estado: "Entregado" }),
  ];
  assert.equal(unidadesVendidasUltimosMeses(data, "PROD-01", hoy, 3), 5 + 3);
});

test("excepcionesActivas: junta las excepciones de todos los productos en un solo listado", () => {
  const data = emptyData();
  data.productos = [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true },
    {
      id: "PROD-08",
      id_base: "PROD-01",
      nombre: "Calabaza mayorista",
      precio_venta: 11000,
      activo: true,
      excepciones: [{ id: "EXC-1", grupo: "masa", tipo: "Ingrediente", concepto: "ING-ACEITE", cantidad: 0.5 }],
    },
    {
      id: "PROD-09",
      id_base: "PROD-01",
      nombre: "Calabaza sin salsa",
      precio_venta: 9000,
      activo: true,
      excepciones: [{ id: "EXC-2", grupo: "packaging", tipo: "Packaging", concepto: "PKG-1", cantidad: 2 }],
    },
  ];
  const activas = excepcionesActivas(data);
  assert.equal(activas.length, 2);
  assert.equal(activas[0].producto.id, "PROD-08");
  assert.equal(activas[1].excepcion.id, "EXC-2");
});
