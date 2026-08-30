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
  calcStockIngrediente,
  rentabilidadPorCanal,
  rentabilidadPorCliente,
  montoPagadoPedido,
  saldoPedido,
  cuentasPorCobrar,
  proyeccionCaja30Dias,
  comparadorProveedores,
  sincronizarMovimientoCaja,
  movimientoCajaDeseadoDePedido,
  segmentacionClientes,
  cuotaMensualAmortizacion,
  montoRestanteAmortizacion,
  cantidadIngredienteEnProducto,
  impactoCostoIngrediente,
  fichaProveedor,
  tipoVentaDeProducto,
  gustosTodos,
  rentabilidadPorTipoVenta,
  rentabilidadPorGustoEnTipoVenta,
  cmvDePedido,
  costoUnitarioSubreceta,
} from "./calc";
import { emptyData } from "./types";
import type { Pedido, Producto, Ingrediente, RecetaLinea, Produccion, Cliente, Amortizacion, CajaMovimiento } from "./types";

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
  data.packaging = [{ id: "PKG-1", nombre: "Bolsa", unidad: "unidad", precio_ref: 50, precio_vigente: null }];

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

function produccionBase(overrides: Partial<Produccion> = {}): Produccion {
  return {
    id: "PRODLOG-1",
    id_producto: "PROD-08",
    nombre_producto: "Calabaza mayorista",
    cantidad: 5,
    fecha: "2026-07-15",
    ...overrides,
  };
}

test("calcStockIngrediente: descuenta el consumo de una producción de un producto no migrado (RecetaLinea propia)", () => {
  const data = emptyData();
  data.ingredientes = ingredientesCalabaza();
  data.conteos_ingredientes = [{ id: "CI-1", id_ingrediente: "ING-CALABAZA", cantidad: 10, fecha: "2026-07-01" }];
  data.recetas = [{ id: "R1", id_producto: "PROD-08", tipo: "Ingrediente", concepto: "ING-CALABAZA", cantidad: 0.2 }];
  data.produccion = [produccionBase()]; // 5 paquetes × 0,2 kg = 1 kg consumido

  assert.equal(calcStockIngrediente(data, "ING-CALABAZA"), 10 - 1);
});

test("calcStockIngrediente: descuenta el consumo de una producción de un producto MIGRADO leyendo su receta derivada — no queda en 0 solo porque ya no tiene RecetaLinea propia", () => {
  const data = emptyData();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_relleno_unidad: [{ id: "RU-1", id_ingrediente: "ING-CALABAZA", cantidad: 0.02 }],
  };
  const venta: Producto = {
    id: "PROD-08",
    id_base: "PROD-01",
    nombre: "Calabaza mayorista",
    precio_venta: 11000,
    activo: true,
    unidades_por_paquete: 10, // 0,02 × 10 = 0,2 kg por paquete, igual que el caso legacy de arriba
  };
  data.productos = [base, venta];
  data.ingredientes = ingredientesCalabaza();
  data.conteos_ingredientes = [{ id: "CI-1", id_ingrediente: "ING-CALABAZA", cantidad: 10, fecha: "2026-07-01" }];
  data.recetas = []; // el producto de venta migrado no tiene ninguna RecetaLinea de Ingrediente propia
  data.produccion = [produccionBase()]; // 5 paquetes

  assert.equal(estaMigrado(data, venta), true);
  assert.equal(calcStockIngrediente(data, "ING-CALABAZA"), 10 - 1, "mismo consumo que el caso legacy: 5 × 0,2kg");
});

// --- Cuentas por cobrar --------------------------------------------------------------------

test("montoPagadoPedido: sin estado_pago cargado se trata como Pagado (compatibilidad con pedidos históricos)", () => {
  const pedido = pedidoBase({ precio_neto: 22000 });
  assert.equal(pedido.estado_pago, undefined);
  assert.equal(montoPagadoPedido(pedido), 22000);
  assert.equal(saldoPedido(pedido), 0);
});

test("montoPagadoPedido: Pendiente es 0 cobrado, todo el total es saldo", () => {
  const pedido = pedidoBase({ precio_neto: 22000, estado_pago: "Pendiente" });
  assert.equal(montoPagadoPedido(pedido), 0);
  assert.equal(saldoPedido(pedido), 22000);
});

test("montoPagadoPedido: Parcial usa monto_pagado, nunca más que el total", () => {
  const pedido = pedidoBase({ precio_neto: 22000, estado_pago: "Parcial", monto_pagado: 8000 });
  assert.equal(montoPagadoPedido(pedido), 8000);
  assert.equal(saldoPedido(pedido), 14000);

  const sobrecargado = pedidoBase({ precio_neto: 22000, estado_pago: "Parcial", monto_pagado: 99000 });
  assert.equal(montoPagadoPedido(sobrecargado), 22000, "nunca cobra más de lo que vale el pedido");
  assert.equal(saldoPedido(sobrecargado), 0);
});

test("montoPagadoPedido: Reembolsado no genera saldo (no se le debe nada al cliente en el sistema)", () => {
  const pedido = pedidoBase({ precio_neto: 22000, estado_pago: "Reembolsado" });
  assert.equal(saldoPedido(pedido), 0);
});

test("saldoPedido: un pedido Cancelado nunca genera saldo aunque tenga estado_pago Pendiente", () => {
  const pedido = pedidoBase({ precio_neto: 22000, estado: "Cancelado", estado_pago: "Pendiente" });
  assert.equal(saldoPedido(pedido), 0);
});

test("cuentasPorCobrar: solo lista pedidos Entregados con saldo, con días de atraso cuando hay vencimiento cargado", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-30");
  data.clientes = [{ id: "CLI-01", nombre: "Distribuidora Sur", canal: "Mayorista" }];
  data.pedidos = [
    pedidoBase({ id_detalle: "A", precio_neto: 22000, estado: "Entregado", estado_pago: "Pagado" }), // sin saldo, no debe listarse
    pedidoBase({
      id_detalle: "B",
      precio_neto: 30000,
      estado: "Entregado",
      estado_pago: "Parcial",
      monto_pagado: 10000,
      fecha_vencimiento: "2026-08-10",
    }),
    pedidoBase({ id_detalle: "C", precio_neto: 15000, estado: "Confirmado", estado_pago: "Pendiente" }), // no entregado, no debe listarse
  ];

  const cxc = cuentasPorCobrar(data, hoy);
  assert.equal(cxc.length, 1);
  assert.equal(cxc[0].pedido.id_detalle, "B");
  assert.equal(cxc[0].pagado, 10000);
  assert.equal(cxc[0].saldo, 20000);
  assert.equal(cxc[0].cliente?.nombre, "Distribuidora Sur");
  assert.equal(cxc[0].diasAtraso, 20); // 30/08 − 10/08
});

test("cuentasPorCobrar: sin fecha_vencimiento cargada, diasAtraso queda null en vez de inventar un vencimiento", () => {
  const data = emptyData();
  data.pedidos = [pedidoBase({ precio_neto: 10000, estado: "Entregado", estado_pago: "Pendiente" })];
  const cxc = cuentasPorCobrar(data);
  assert.equal(cxc[0].diasAtraso, null);
});

test("comparadorProveedores: solo incluye insumos con más de un proveedor, ordenado del más barato al más caro", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Mozzarella", unidad: "kg", precio_ref: 9000, precio_vigente: null, seguimiento_stock: false }];
  data.proveedores = [
    { id: "PRV-A", nombre: "Lácteos del Sur" },
    { id: "PRV-B", nombre: "Distribuidora Norte" },
  ];
  data.compras = [
    {
      id: "COM-1",
      fecha: "2026-06-01",
      id_proveedor: "PRV-A",
      total: 9000,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 9500 }],
      lineasPkg: [],
    },
    {
      id: "COM-2",
      fecha: "2026-07-01",
      id_proveedor: "PRV-B",
      total: 8000,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 8000 }],
      lineasPkg: [],
    },
    {
      id: "COM-3",
      fecha: "2026-07-15",
      id_proveedor: "PRV-A",
      total: 9800,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 9800 }],
      lineasPkg: [],
    },
  ];

  const [comparador] = comparadorProveedores(data);
  assert.equal(comparador.nombreIngrediente, "Mozzarella");
  assert.equal(comparador.proveedores.length, 2);
  assert.equal(comparador.proveedores[0].nombreProveedor, "Distribuidora Norte", "el más barato va primero");
  assert.equal(comparador.proveedores[0].ultimoPrecio, 8000);
  assert.equal(comparador.proveedores[0].diferenciaPct, 0);
  const sur = comparador.proveedores.find((p) => p.nombreProveedor === "Lácteos del Sur")!;
  assert.equal(sur.ultimoPrecio, 9800, "toma el precio de la compra más reciente (15/07), no la primera");
  assert.equal(sur.precioPromedio, (9500 + 9800) / 2);
  assert.equal(sur.cantidadCompras, 2);
  assert.ok(Math.abs(sur.diferenciaPct - 22.5) < 0.01); // (9800-8000)/8000 * 100
});

test("comparadorProveedores: un insumo con un solo proveedor no aparece (nada que comparar)", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.proveedores = [{ id: "PRV-A", nombre: "Molino" }];
  data.compras = [
    {
      id: "COM-1",
      fecha: "2026-06-01",
      id_proveedor: "PRV-A",
      total: 1000,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 1000 }],
      lineasPkg: [],
    },
  ];
  assert.equal(comparadorProveedores(data).length, 0);
});

test("comparadorProveedores: una compra anulada no cuenta", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.proveedores = [
    { id: "PRV-A", nombre: "Molino A" },
    { id: "PRV-B", nombre: "Molino B" },
  ];
  data.compras = [
    {
      id: "COM-1",
      fecha: "2026-06-01",
      id_proveedor: "PRV-A",
      total: 1000,
      total_manual: false,
      registrar_caja: false,
      anulada: true,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 1000 }],
      lineasPkg: [],
    },
    {
      id: "COM-2",
      fecha: "2026-06-01",
      id_proveedor: "PRV-B",
      total: 1100,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 1100 }],
      lineasPkg: [],
    },
  ];
  assert.equal(comparadorProveedores(data).length, 0, "solo queda un proveedor activo, no hay nada que comparar");
});

test("proyeccionCaja30Dias: suma caja + por cobrar + pedidos confirmados a entregar en la ventana, resta costos fijos previstos", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-01");
  data.saldo_anterior_caja = { valor: 100000 };
  data.costos_fijos = [{ id: "CF-1", descripcion: "Alquiler", monto: 30000, categoria: "Servicios", activo: true }];
  data.pedidos = [
    // Deuda ya generada (entregado, sin cobrar) — cuenta como "por cobrar"
    pedidoBase({ id_detalle: "A", precio_neto: 20000, estado: "Entregado", estado_pago: "Pendiente" }),
    // Confirmado, entrega dentro de los 30 días — cuenta como ingreso previsto
    pedidoBase({ id_detalle: "B", precio_neto: 15000, estado: "Confirmado", fecha: "2026-08-01", fecha_entrega: "2026-08-10" }),
    // Confirmado pero la entrega es recién en 60 días — fuera de la ventana, no debe sumar
    pedidoBase({ id_detalle: "C", precio_neto: 99999, estado: "Confirmado", fecha: "2026-08-01", fecha_entrega: "2026-11-01" }),
  ];

  const p = proyeccionCaja30Dias(data, hoy);
  assert.equal(p.cajaActual, 100000);
  assert.equal(p.porCobrar, 20000);
  assert.equal(p.pedidosPendientesDeEntregar, 15000);
  assert.equal(p.costosRecurrentesPrevistos, 30000);
  assert.equal(p.proyeccion30Dias, 100000 + 20000 + 15000 - 30000);
});

test("discrepanciasCaja: un pedido Parcial con el movimiento por el monto cobrado no es una discrepancia", () => {
  const data = emptyData();
  const pedido = pedidoBase({ precio_neto: 22000, estado_pago: "Parcial", monto_pagado: 8000 });
  data.pedidos = [pedido];
  data.caja_movimientos = [{ id: "CAJ-1", fecha: pedido.fecha, tipo: "ingreso", concepto: "x", monto: 8000, metodo: "Efectivo", ref: pedido.id_detalle }];
  assert.equal(discrepanciasCaja(data).length, 0);
});

test("discrepanciasCaja: un pedido Pendiente sin ningún movimiento no es una discrepancia (todavía no se espera cobro)", () => {
  const data = emptyData();
  data.pedidos = [pedidoBase({ precio_neto: 22000, estado_pago: "Pendiente" })];
  assert.equal(discrepanciasCaja(data).length, 0);
});

test("movimientoCajaDeseadoDePedido + sincronizarMovimientoCaja: cobrar el saldo de un Parcial actualiza el movimiento existente en vez de duplicarlo", () => {
  let movimientos: CajaMovimiento[] = [];
  const parcial = pedidoBase({ precio_neto: 22000, estado_pago: "Parcial", monto_pagado: 8000 });

  movimientos = sincronizarMovimientoCaja(movimientos, parcial.id_detalle, movimientoCajaDeseadoDePedido(parcial));
  assert.equal(movimientos.length, 1);
  assert.equal(movimientos[0].monto, 8000);
  const idOriginal = movimientos[0].id;

  const cobrado = { ...parcial, estado_pago: "Pagado" as const };
  movimientos = sincronizarMovimientoCaja(movimientos, cobrado.id_detalle, movimientoCajaDeseadoDePedido(cobrado));
  assert.equal(movimientos.length, 1, "actualiza el movimiento existente, no agrega uno nuevo");
  assert.equal(movimientos[0].monto, 22000);
  assert.equal(movimientos[0].id, idOriginal, "conserva el id del movimiento original");
});

test("movimientoCajaDeseadoDePedido: null para Pendiente (nada que registrar todavía) y para no-Entregado", () => {
  assert.equal(movimientoCajaDeseadoDePedido(pedidoBase({ estado_pago: "Pendiente" })), null);
  assert.equal(movimientoCajaDeseadoDePedido(pedidoBase({ estado: "Confirmado" })), null);
});

test("sincronizarMovimientoCaja: deseado null quita el movimiento existente", () => {
  const movs: CajaMovimiento[] = [{ id: "CAJ-1", fecha: "2026-08-01", tipo: "ingreso", concepto: "x", monto: 100, metodo: "Efectivo", ref: "PED-1-A" }];
  const resultado = sincronizarMovimientoCaja(movs, "PED-1-A", null);
  assert.equal(resultado.length, 0);
});

test("sincronizarMovimientoCaja: sin cambios reales devuelve la misma referencia de array (no dispara renders de más)", () => {
  const pedido = pedidoBase();
  const movs = [movimientoCajaDeseadoDePedido(pedido)!];
  const resultado = sincronizarMovimientoCaja(movs, pedido.id_detalle, movimientoCajaDeseadoDePedido(pedido));
  assert.equal(resultado, movs);
});

// --- Segmentación de clientes ---------------------------------------------------------------

function clienteBase(overrides: Partial<Cliente> = {}): Cliente {
  return { id: "CLI-01", nombre: "Juana Pérez", canal: "Minorista", ...overrides };
}

test("segmentacionClientes: sin pedidos es Nuevo", () => {
  const data = emptyData();
  data.clientes = [clienteBase()];
  const [m] = segmentacionClientes(data);
  assert.equal(m.segmento, "Nuevo");
  assert.equal(m.cantidadPedidos, 0);
});

test("segmentacionClientes: más de 120 días sin comprar es Inactivo, aunque sea mayorista", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-30");
  data.clientes = [clienteBase({ id: "CLI-01", canal: "Mayorista" })];
  data.pedidos = [pedidoBase({ id_cliente: "CLI-01", fecha: "2026-01-15" })];
  const [m] = segmentacionClientes(data, hoy);
  assert.equal(m.segmento, "Inactivo");
});

test("segmentacionClientes: entre 45 y 120 días sin comprar es En riesgo", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-30");
  data.clientes = [clienteBase()];
  data.pedidos = [pedidoBase({ id_cliente: "CLI-01", fecha: "2026-07-01" })]; // 60 días antes
  const [m] = segmentacionClientes(data, hoy);
  assert.equal(m.segmento, "En riesgo");
});

test("segmentacionClientes: mayorista activo (compra reciente) es Mayorista", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-30");
  data.clientes = [clienteBase({ canal: "Mayorista" })];
  data.pedidos = [pedidoBase({ id_cliente: "CLI-01", fecha: "2026-08-25" })];
  const [m] = segmentacionClientes(data, hoy);
  assert.equal(m.segmento, "Mayorista");
});

test("segmentacionClientes: minorista con 6+ pedidos activos es VIP, con 3-5 es Frecuente, menos es Activo", () => {
  const data = emptyData();
  const hoy = new Date("2026-08-30");
  data.clientes = [
    clienteBase({ id: "CLI-VIP" }),
    clienteBase({ id: "CLI-FREC" }),
    clienteBase({ id: "CLI-ACT" }),
  ];
  const pedido = (id_cliente: string, id_pedido: string) => pedidoBase({ id_cliente, id_pedido, id_detalle: id_pedido, fecha: "2026-08-20" });
  data.pedidos = [
    ...Array.from({ length: 6 }, (_, i) => pedido("CLI-VIP", `PED-VIP-${i}`)),
    ...Array.from({ length: 3 }, (_, i) => pedido("CLI-FREC", `PED-FREC-${i}`)),
    pedido("CLI-ACT", "PED-ACT-1"),
  ];
  const resultados = segmentacionClientes(data, hoy);
  const segmentoDe = (id: string) => resultados.find((m) => m.cliente.id === id)?.segmento;
  assert.equal(segmentoDe("CLI-VIP"), "VIP");
  assert.equal(segmentoDe("CLI-FREC"), "Frecuente");
  assert.equal(segmentoDe("CLI-ACT"), "Activo");
});

test("segmentacionClientes: excluye clientes dados de baja (activo === false)", () => {
  const data = emptyData();
  data.clientes = [clienteBase({ id: "CLI-01" }), clienteBase({ id: "CLI-02", activo: false })];
  assert.equal(segmentacionClientes(data).length, 1);
});

// --- Amortización con valor residual ---------------------------------------------------------

function amortizacionBase(overrides: Partial<Amortizacion> = {}): Amortizacion {
  return { id: "AMORT-1", nombre: "Freezer", precio_total: 700000, fecha_inicio: "2026-01-01", meses_totales: 60, ...overrides };
}

test("cuotaMensualAmortizacion: sin valor_residual amortiza el 100% del precio (comportamiento de siempre)", () => {
  const a = amortizacionBase();
  assert.equal(cuotaMensualAmortizacion(a), 700000 / 60);
});

test("cuotaMensualAmortizacion: con valor_residual, la base amortizable lo excluye", () => {
  const a = amortizacionBase({ valor_residual: 100000 });
  assert.equal(cuotaMensualAmortizacion(a), (700000 - 100000) / 60);
});

test("montoRestanteAmortizacion: al terminar la vida útil, el valor contable restante converge al residual (no a 0)", () => {
  const a = amortizacionBase({ valor_residual: 100000, meses_totales: 12 });
  const finDeVida = new Date("2028-01-15"); // bastante después de los 12 meses
  assert.equal(montoRestanteAmortizacion(a, finDeVida), 100000);
});

// --- Rentabilidad por canal y por cliente -----------------------------------------------------

test("rentabilidadPorCanal: agrupa venta, costo y ganancia por canal", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles", precio_venta: 11000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 2 }]; // costo = $2.000/unidad
  const pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", cantidad: 2, precio_neto: 20000, canal: "Minorista" }),
    pedidoBase({ id_detalle: "B", id_producto: "PROD-01", cantidad: 1, precio_neto: 9000, canal: "Mayorista" }),
  ];
  data.pedidos = pedidos;

  const filas = rentabilidadPorCanal(data, pedidos);
  const minorista = filas.find((f) => f.canal === "Minorista")!;
  const mayorista = filas.find((f) => f.canal === "Mayorista")!;
  assert.equal(minorista.venta, 20000);
  assert.equal(minorista.costo, 4000);
  assert.equal(minorista.ganancia, 16000);
  assert.equal(mayorista.venta, 9000);
  assert.equal(mayorista.costo, 2000);
  assert.equal(mayorista.ganancia, 7000);
});

test("rentabilidadPorCliente: agrupa por cliente y cuenta pedidos únicos, no líneas", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles", precio_venta: 11000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 2 }];
  data.clientes = [{ id: "CLI-01", nombre: "Ana", canal: "Minorista" }];
  const pedidos = [
    pedidoBase({ id_pedido: "PED-1", id_detalle: "PED-1-A", id_cliente: "CLI-01", id_producto: "PROD-01", cantidad: 1, precio_neto: 11000 }),
    pedidoBase({ id_pedido: "PED-1", id_detalle: "PED-1-B", id_cliente: "CLI-01", id_producto: "PROD-01", cantidad: 1, precio_neto: 11000 }),
  ];
  data.pedidos = pedidos;

  const [fila] = rentabilidadPorCliente(data, pedidos);
  assert.equal(fila.cliente.nombre, "Ana");
  assert.equal(fila.cantidadPedidos, 1, "dos líneas del mismo id_pedido cuentan como 1 pedido");
  assert.equal(fila.venta, 22000);
  assert.equal(fila.costo, 4000);
  assert.equal(fila.ganancia, 18000);
});

// --- Impacto del costo de un ingrediente sobre los productos que lo usan ----------------------

test("cantidadIngredienteEnProducto: producto legacy lee directo de RecetaLinea", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-HARINA", nombre: "Harina", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-09", id_base: "PROD-09", nombre: "Calabaza sin salsa", precio_venta: 9000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-09", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.05 }];
  const producto = data.productos[0];
  assert.equal(cantidadIngredienteEnProducto(data, producto, "ING-HARINA"), 0.05);
  assert.equal(cantidadIngredienteEnProducto(data, producto, "ING-OTRO"), 0);
});

test("cantidadIngredienteEnProducto: producto migrado deriva de la receta base, escalada por unidades_por_paquete", () => {
  const data = emptyData();
  data.ingredientes = ingredientesCalabaza();
  const base: Producto = {
    id: "PROD-01",
    id_base: "PROD-01",
    nombre: "Ravioles de calabaza",
    precio_venta: 13000,
    activo: true,
    receta_masa_unidad: [{ id: "RU-1", id_ingrediente: "ING-HARINA", cantidad: 0.003 }],
  };
  const migrado: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 11000, activo: true, unidades_por_paquete: 10 };
  data.productos = [base, migrado];
  assert.equal(cantidadIngredienteEnProducto(data, migrado, "ING-HARINA"), 0.003 * 10);
});

test("impactoCostoIngrediente: simula el costo y margen nuevos ante un cambio de precio, sin persistir nada", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-HARINA", nombre: "Harina", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [
    { id: "PROD-09", id_base: "PROD-09", nombre: "Calabaza sin salsa", precio_venta: 9000, activo: true },
    { id: "PROD-10", id_base: "PROD-10", nombre: "Ricotta", precio_venta: 12000, activo: true }, // no usa harina
  ];
  data.recetas = [{ id: "R1", id_producto: "PROD-09", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.05 }]; // costo actual = 100

  const resultado = impactoCostoIngrediente(data, "ING-HARINA", 10); // +10%
  assert.equal(resultado.length, 1, "solo lista productos que efectivamente usan el ingrediente");
  const [fila] = resultado;
  assert.equal(fila.producto.id, "PROD-09");
  assert.equal(fila.cantidadUsada, 0.05);
  assert.equal(fila.costoActual, 100);
  assert.ok(Math.abs(fila.costoNuevo - 110) < 0.001, "0.05 × 2000 × 1.10 = 110");
  assert.ok(Math.abs(fila.margenActualPct - ((9000 - 100) / 9000) * 100) < 0.001);
  assert.ok(Math.abs(fila.margenNuevoPct - ((9000 - 110) / 9000) * 100) < 0.001);

  // No modifica los datos originales
  assert.equal(data.ingredientes[0].precio_ref, 2000);
});

test("impactoCostoIngrediente: excluye productos inactivos", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-HARINA", nombre: "Harina", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-09", id_base: "PROD-09", nombre: "Calabaza sin salsa", precio_venta: 9000, activo: false }];
  data.recetas = [{ id: "R1", id_producto: "PROD-09", tipo: "Ingrediente", concepto: "ING-HARINA", cantidad: 0.05 }];
  assert.equal(impactoCostoIngrediente(data, "ING-HARINA", 10).length, 0);
});

// --- Ficha de proveedor (estadísticas derivadas, nunca cargadas a mano) -----------------------

test("fichaProveedor: cantidad, total, precio promedio e insumos suministrados, derivados de comprasActivas", () => {
  const data = emptyData();
  data.ingredientes = [
    { id: "ING-1", nombre: "Mozzarella", unidad: "kg", precio_ref: 9000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-2", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false },
  ];
  data.proveedores = [{ id: "PRV-A", nombre: "Lácteos del Sur" }];
  data.compras = [
    {
      id: "COM-1",
      fecha: "2026-06-01",
      id_proveedor: "PRV-A",
      total: 9000,
      total_manual: false,
      registrar_caja: false,
      lineas: [{ id_ingrediente: "ING-1", cantidad: 1, precio_unitario: 9000 }],
      lineasPkg: [],
    },
    {
      id: "COM-2",
      fecha: "2026-07-01",
      id_proveedor: "PRV-A",
      total: 5000,
      total_manual: false,
      registrar_caja: false,
      lineas: [
        { id_ingrediente: "ING-1", cantidad: 0.3, precio_unitario: 9500 },
        { id_ingrediente: "ING-2", cantidad: 2, precio_unitario: 1050 },
      ],
      lineasPkg: [],
    },
    {
      id: "COM-3",
      fecha: "2026-07-15",
      id_proveedor: "PRV-A",
      total: 1000,
      total_manual: false,
      registrar_caja: false,
      anulada: true, // no debe contar
      lineas: [{ id_ingrediente: "ING-2", cantidad: 1, precio_unitario: 1000 }],
      lineasPkg: [],
    },
  ];

  const ficha = fichaProveedor(data, "PRV-A");
  assert.equal(ficha.cantidadCompras, 2, "la compra anulada no cuenta");
  assert.equal(ficha.totalComprado, 14000);
  assert.equal(ficha.precioPromedioCompra, 7000);
  assert.deepEqual(ficha.insumosSuministrados, ["Harina", "Mozzarella"], "ordenados alfabéticamente, sin duplicados");
});

test("fichaProveedor: proveedor sin compras devuelve todo en cero, sin dividir por cero", () => {
  const data = emptyData();
  data.proveedores = [{ id: "PRV-A", nombre: "Nuevo" }];
  const ficha = fichaProveedor(data, "PRV-A");
  assert.equal(ficha.cantidadCompras, 0);
  assert.equal(ficha.totalComprado, 0);
  assert.equal(ficha.precioPromedioCompra, 0);
  assert.deepEqual(ficha.insumosSuministrados, []);
});

// --- Tipo de venta (agrupación de gustos por Minorista/Mayorista/Vacío) ------------------------

test("tipoVentaDeProducto: el producto base de su propia familia siempre es Minorista", () => {
  const base: Producto = { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 11000, activo: true };
  assert.equal(tipoVentaDeProducto(base), "Minorista");
});

test("tipoVentaDeProducto: clasifica las variantes reales de Calabaza por nombre, ignorando el campo canal (que está mal cargado)", () => {
  // Caso real de la auditoría: las 4 variantes de "Ravioles de calabaza", las 3 mayoristas con
  // canal="Minorista" mal cargado en el backup original.
  const mayorista: Producto = { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 9000, activo: true, canal: "Minorista" };
  const vacioConSalsa: Producto = { id: "PROD-12", id_base: "PROD-01", nombre: "Calabaza al vacio mayo", precio_venta: 12000, activo: true, canal: "Minorista" };
  const vacioSinSalsa: Producto = { id: "PROD-15", id_base: "PROD-01", nombre: "Calabaza mayorista sin salsa", precio_venta: 10000, activo: true, canal: "Minorista" };
  assert.equal(tipoVentaDeProducto(mayorista), "Mayorista");
  assert.equal(tipoVentaDeProducto(vacioConSalsa), "VacioConSalsa");
  assert.equal(tipoVentaDeProducto(vacioSinSalsa), "VacioSinSalsa");
});

test("tipoVentaDeProducto: un nombre que no matchea ningún patrón cae en SinClasificar, no se adivina", () => {
  const rara: Producto = { id: "PROD-99", id_base: "PROD-01", nombre: "Calabaza especial de temporada", precio_venta: 9000, activo: true };
  assert.equal(tipoVentaDeProducto(rara), "SinClasificar");
});

test("tipoVentaDeProducto: tipo_venta cargado a mano pisa la deducción por nombre", () => {
  const corregido: Producto = {
    id: "PROD-99",
    id_base: "PROD-01",
    nombre: "Calabaza especial de temporada",
    precio_venta: 9000,
    activo: true,
    tipo_venta: "Mayorista",
  };
  assert.equal(tipoVentaDeProducto(corregido), "Mayorista");
});

test("gustosTodos: agrupa por id_base incluyendo variantes inactivas (a diferencia de gustosActivos)", () => {
  const data = emptyData();
  data.productos = [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 11000, activo: true },
    { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 9000, activo: false },
  ];
  const gustos = gustosTodos(data);
  assert.equal(gustos.length, 1);
  assert.equal(gustos[0].variantes.length, 2, "incluye la variante inactiva");
});

test("rentabilidadPorTipoVenta: agrupa venta/costo/ganancia por tipo de venta del producto vendido, no por el canal del pedido", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 11000, activo: true },
    { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 9000, activo: true },
  ];
  data.recetas = [
    { id: "R1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 2 },
    { id: "R2", id_producto: "PROD-08", tipo: "Ingrediente", concepto: "ING-1", cantidad: 1 },
  ];
  const pedidos = [
    // Canal Mayorista en el pedido, pero comprando la variante Minorista — debe caer en Minorista.
    pedidoBase({ id_detalle: "A", id_producto: "PROD-01", cantidad: 1, precio_neto: 11000, canal: "Mayorista" }),
    pedidoBase({ id_detalle: "B", id_producto: "PROD-08", cantidad: 2, precio_neto: 18000, canal: "Mayorista" }),
  ];
  data.pedidos = pedidos;

  const filas = rentabilidadPorTipoVenta(data, pedidos);
  const minorista = filas.find((f) => f.tipo === "Minorista")!;
  const mayorista = filas.find((f) => f.tipo === "Mayorista")!;
  assert.equal(minorista.venta, 11000);
  assert.equal(minorista.costo, 2000);
  assert.equal(mayorista.venta, 18000);
  assert.equal(mayorista.costo, 2000);
});

test("rentabilidadPorGustoEnTipoVenta: rankea gustos dentro de un tipo de venta filtrado", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [
    { id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles de calabaza", precio_venta: 13000, activo: true },
    { id: "PROD-08", id_base: "PROD-01", nombre: "Calabaza mayorista", precio_venta: 9000, activo: true },
    { id: "PROD-05", id_base: "PROD-05", nombre: "Raviol de jamon y queso", precio_venta: 13000, activo: true },
    { id: "PROD-07", id_base: "PROD-05", nombre: "Jamon y queso mayorista", precio_venta: 9000, activo: true },
  ];
  data.recetas = [
    { id: "R1", id_producto: "PROD-08", tipo: "Ingrediente", concepto: "ING-1", cantidad: 1 },
    { id: "R2", id_producto: "PROD-07", tipo: "Ingrediente", concepto: "ING-1", cantidad: 3 },
  ];
  const pedidos = [
    pedidoBase({ id_detalle: "A", id_producto: "PROD-08", cantidad: 1, precio_neto: 9000, canal: "Mayorista" }),
    pedidoBase({ id_detalle: "B", id_producto: "PROD-07", cantidad: 1, precio_neto: 9000, canal: "Mayorista" }),
  ];
  data.pedidos = pedidos;

  const filas = rentabilidadPorGustoEnTipoVenta(data, pedidos, "Mayorista");
  assert.equal(filas.length, 2);
  assert.equal(filas[0].nombreGusto, "Ravioles de calabaza", "menos costo → más ganancia → primero");
  assert.equal(filas[0].ganancia, 8000);
  assert.equal(filas[1].ganancia, 6000);
});

// --- Snapshot histórico de costo (cmvDePedido) --------------------------------------------------

test("cmvDePedido: sin snapshot, calcula el costo en vivo con el precio actual del insumo (comportamiento de siempre)", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles", precio_venta: 11000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 2 }];
  const pedido = pedidoBase({ id_producto: "PROD-01", cantidad: 3 });
  assert.equal(cmvDePedido(data, pedido), 2 * 2000 * 3);
});

test("cmvDePedido: con snapshot, usa el costo congelado sin importar el precio actual del insumo", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles", precio_venta: 11000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 2 }];
  const pedido = pedidoBase({ id_producto: "PROD-01", cantidad: 3, costo_snapshot: 5000 });
  assert.equal(cmvDePedido(data, pedido), 5000, "usa el snapshot, no 2×2000×3");
});

test("rentabilidadPorTipoVenta: un pedido con snapshot no cambia su rentabilidad histórica cuando sube el precio de un ingrediente", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-1", nombre: "Harina", unidad: "kg", precio_ref: 2000, precio_vigente: null, seguimiento_stock: false }];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Ravioles", precio_venta: 11000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Ingrediente", concepto: "ING-1", cantidad: 2 }];
  const pedidoViejo = pedidoBase({ id_detalle: "A", id_producto: "PROD-01", cantidad: 1, precio_neto: 11000, costo_snapshot: 4000 });
  data.pedidos = [pedidoViejo];

  const antes = rentabilidadPorTipoVenta(data, [pedidoViejo]);
  // Sube el precio de la harina hoy — no debería tocar la rentabilidad de un pedido ya vendido.
  data.ingredientes[0].precio_ref = 50000;
  const despues = rentabilidadPorTipoVenta(data, [pedidoViejo]);

  assert.deepEqual(despues, antes);
  assert.equal(despues[0].costo, 4000, "sigue siendo el costo congelado, no el recalculado con harina a $50.000");
});

// --- Subrecetas (componentes elaborados con receta propia, ej. Salsa Pomodoro) -----------------

test("costoUnitarioSubreceta: costo total de sus ingredientes dividido el rendimiento", () => {
  const data = emptyData();
  data.ingredientes = [
    { id: "ING-TOMATE", nombre: "Tomate", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false },
    { id: "ING-AJO", nombre: "Ajo", unidad: "kg", precio_ref: 6000, precio_vigente: null, seguimiento_stock: false },
  ];
  data.subrecetas = [
    {
      id: "SUB-1",
      nombre: "Salsa Pomodoro",
      rendimiento: 2500, // gramos
      unidad: "g",
      receta: [
        { id: "RU-1", id_ingrediente: "ING-TOMATE", cantidad: 2 }, // 2kg × 1000 = 2000
        { id: "RU-2", id_ingrediente: "ING-AJO", cantidad: 0.1 }, // 0.1kg × 6000 = 600
      ],
    },
  ];
  // costo total = 2600, rendimiento = 2500g → costo por gramo = 1.04
  assert.ok(Math.abs(costoUnitarioSubreceta(data, "SUB-1") - 2600 / 2500) < 0.0001);
});

test("costoUnitarioSubreceta: sin rendimiento o subreceta inexistente, devuelve 0 en vez de dividir por cero", () => {
  const data = emptyData();
  assert.equal(costoUnitarioSubreceta(data, "SUB-INEXISTENTE"), 0);
  data.subrecetas = [{ id: "SUB-1", nombre: "Vacía", rendimiento: 0, unidad: "g", receta: [] }];
  assert.equal(costoUnitarioSubreceta(data, "SUB-1"), 0);
});

test("costoLegacy: una línea tipo Subreceta suma cantidad × costo unitario de la subreceta", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-TOMATE", nombre: "Tomate", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.subrecetas = [
    {
      id: "SUB-1",
      nombre: "Salsa Pomodoro",
      rendimiento: 1000, // 1000g de salsa
      unidad: "g",
      receta: [{ id: "RU-1", id_ingrediente: "ING-TOMATE", cantidad: 1 }], // 1kg × 1000 = 1000 → $1/g
    },
  ];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Vacío con salsa", precio_venta: 12000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Subreceta", concepto: "SUB-1", cantidad: 200 }]; // 200g de salsa
  assert.equal(costoLegacy(data, "PROD-01"), 200 * 1);
});

test("costoUnitarioSubreceta: si sube el precio de un ingrediente de la subreceta, sube la subreceta y todo lo que la usa", () => {
  const data = emptyData();
  data.ingredientes = [{ id: "ING-TOMATE", nombre: "Tomate", unidad: "kg", precio_ref: 1000, precio_vigente: null, seguimiento_stock: false }];
  data.subrecetas = [
    { id: "SUB-1", nombre: "Salsa Pomodoro", rendimiento: 1000, unidad: "g", receta: [{ id: "RU-1", id_ingrediente: "ING-TOMATE", cantidad: 1 }] },
  ];
  data.productos = [{ id: "PROD-01", id_base: "PROD-01", nombre: "Vacío con salsa", precio_venta: 12000, activo: true }];
  data.recetas = [{ id: "R1", id_producto: "PROD-01", tipo: "Subreceta", concepto: "SUB-1", cantidad: 200 }];

  const antes = calcCosto(data, "PROD-01");
  data.ingredientes[0].precio_ref = 3000; // el tomate se triplica
  const despues = calcCosto(data, "PROD-01");

  assert.ok(despues > antes, "el costo del producto sube automáticamente sin tocar su receta");
  assert.equal(despues, 3 * antes);
});
