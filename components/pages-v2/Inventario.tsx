"use client";

import React, { useMemo, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Card,
  Button,
  FilterTabs,
  StatGrid,
  KpiCard,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Badge,
  FormGrid,
  Field,
  Input,
  Select,
  Textarea,
  SearchInput,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { fARS, fNum, calcularStock, valorStockInsumos, categoriasPorAmbito } from "@/lib/calc-v2";
import { calcularStockReservado, calcularStockDisponible } from "@/lib/produccion-v2";
import { refUnidades } from "@/lib/resumen-sheets";
import { calcularAlertasStock } from "@/lib/ia-stock";
import type { SeveridadAlerta } from "@/lib/ia-stock";
import type { Insumo, TipoInsumo, TipoInventarioMovimiento, TipoItemStock, RicordoDataV2 } from "@/lib/types-v2";

const SEVERIDAD_LABEL: Record<SeveridadAlerta, string> = { critica: "Crítica", importante: "Importante", informativa: "Informativa" };
const SEVERIDAD_COLOR: Record<SeveridadAlerta, "red" | "orange" | "blue"> = { critica: "red", importante: "orange", informativa: "blue" };

const TIPOS_MOV: TipoInventarioMovimiento[] = ["compra", "produccion", "consumo", "venta", "conteo", "ajuste", "merma"];
const MOV_COLOR: Record<TipoInventarioMovimiento, "green" | "red" | "blue" | "orange" | "purple"> = {
  compra: "green",
  produccion: "green",
  venta: "red",
  consumo: "red",
  merma: "red",
  conteo: "blue",
  ajuste: "orange",
};

function insumoVacio(): Omit<Insumo, "id"> {
  return { nombre: "", tipo: "ingrediente", unidad: "", precio_actual: 0, controla_stock: true, stock_minimo: undefined, activo: true };
}

function MateriasPrimasTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [filtro, setFiltro] = useState<"todos" | TipoInsumo>("todos");
  const [search, setSearch] = useState("");
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(insumoVacio());
  const [contando, setContando] = useState<{ insumo: Insumo; cantidad: number } | null>(null);
  const [fusionando, setFusionando] = useState<{ insumo: Insumo; destinoId: string } | null>(null);

  const valorStock = valorStockInsumos(data);
  const bajoMinimo = data.insumos.filter((i) => i.controla_stock && i.stock_minimo != null && calcularStock(data, "insumo", i.id) < i.stock_minimo);
  const sinStockControlado = data.insumos.filter((i) => !i.controla_stock).length;

  // Por default solo se listan los insumos con stock controlado — la mayoría del catálogo real
  // (verduras que se compran al día, etc.) no lo tiene, y mostrar un "stock" que nadie carga ni
  // lee es puro ruido. "Mostrar todos" los trae de vuelta para poder editar precio/categoría.
  const filasInsumos = useMemo(
    () =>
      data.insumos
        .filter((i) => mostrarTodos || i.controla_stock)
        .filter((i) => filtro === "todos" || filtro === i.tipo)
        .filter((i) => !search || i.nombre.toLowerCase().includes(search.toLowerCase()))
        .map((i) => ({ tipo: "insumo" as const, id: i.id, nombre: i.nombre, sub: i.tipo, unidad: i.unidad, stock: calcularStock(data, "insumo", i.id), insumo: i })),
    [data, filtro, search, mostrarTodos]
  );

  function abrirNuevo() {
    setEditando(null);
    setForm(insumoVacio());
    setModalOpen(true);
  }
  function abrirEdicion(i: Insumo) {
    setEditando(i.id);
    setForm({ ...i });
    setModalOpen(true);
  }
  function guardar() {
    if (!form.nombre.trim() || !form.unidad.trim()) {
      toast("Nombre y unidad son obligatorios", "error");
      return;
    }
    if (form.precio_actual < 0) {
      toast("El precio no puede ser negativo — un precio negativo generaría un CMV negativo", "error");
      return;
    }
    if (editando) {
      setData((d) => ({ ...d, insumos: d.insumos.map((i) => (i.id === editando ? { ...i, ...form } : i)) }));
      toast("Insumo actualizado");
    } else {
      setData((d) => ({ ...d, insumos: [...d.insumos, { id: uid("INS"), ...form }] }));
      toast("Insumo creado");
    }
    setModalOpen(false);
  }

  function abrirConteo(insumo: Insumo, stockActual: number) {
    setContando({ insumo, cantidad: Math.round(stockActual * 100) / 100 });
  }

  // Igual que el conteo de productos terminados: resetea el stock calculado a la fecha de hoy al
  // valor observado, no se suma/resta sobre lo anterior.
  function guardarConteo() {
    if (!contando) return;
    setData((d) => ({
      ...d,
      inventario_movimientos: [
        ...d.inventario_movimientos,
        {
          id: uid("MOV"),
          fecha: new Date().toISOString().slice(0, 10),
          tipo: "conteo" as const,
          origen_tipo: "conteo_manual",
          item_tipo: "insumo" as const,
          item_id: contando.insumo.id,
          cantidad: contando.cantidad,
          notas: "Conteo físico",
        },
      ],
    }));
    toast(`Stock de ${contando.insumo.nombre} actualizado a ${fNum(contando.cantidad, 2)} ${contando.insumo.unidad}`);
    setContando(null);
  }

  function abrirFusion(insumo: Insumo) {
    setFusionando({ insumo, destinoId: "" });
  }

  // Fusionar un insumo duplicado con otro: mueve todas sus referencias (recetas, ajustes por
  // variante, ítems de compra, historial de precios, movimientos de inventario) al insumo que se
  // conserva, y recién ahí borra el duplicado — nunca se pierde el historial, solo queda bajo otro
  // id. No hay vuelta atrás (no es un "ajuste" auditable como un conteo), por eso pide confirmar.
  function guardarFusion() {
    if (!fusionando || !fusionando.destinoId) return;
    const { insumo, destinoId } = fusionando;
    const destino = data.insumos.find((i) => i.id === destinoId);
    if (!destino || destinoId === insumo.id) return;
    setData((d) => ({
      ...d,
      insumos: d.insumos.filter((i) => i.id !== insumo.id),
      receta_items: d.receta_items.map((ri) => (ri.insumo_id === insumo.id ? { ...ri, insumo_id: destinoId } : ri)),
      ajustes_receta_variante: d.ajustes_receta_variante.map((a) => (a.insumo_id === insumo.id ? { ...a, insumo_id: destinoId } : a)),
      compra_items: d.compra_items.map((ci) => (ci.insumo_id === insumo.id ? { ...ci, insumo_id: destinoId } : ci)),
      historial_precios: d.historial_precios.map((hp) => (hp.insumo_id === insumo.id ? { ...hp, insumo_id: destinoId } : hp)),
      inventario_movimientos: d.inventario_movimientos.map((m) =>
        m.item_tipo === "insumo" && m.item_id === insumo.id ? { ...m, item_id: destinoId } : m
      ),
    }));
    toast(`"${insumo.nombre}" fusionado con "${destino.nombre}" — recetas, compras y movimientos ya quedaron bajo ese insumo`);
    setFusionando(null);
  }

  return (
    <div>
      <StatGrid>
        <KpiCard label="Valor de stock (insumos)" value={fARS(valorStock)} color="gold" />
        <KpiCard label="Bajo mínimo" value={fNum(bajoMinimo.length, 0)} color={bajoMinimo.length > 0 ? "red" : "green"} />
      </StatGrid>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-[180px] max-w-[300px] flex-1">
          <SearchInput placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2.5">
          {!mostrarTodos && sinStockControlado > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setMostrarTodos(true)}>
              Mostrar también los {sinStockControlado} sin stock controlado
            </Button>
          )}
          {mostrarTodos && (
            <Button size="sm" variant="ghost" onClick={() => setMostrarTodos(false)}>
              Ocultar los que no controlan stock
            </Button>
          )}
          <Button onClick={abrirNuevo}>+ Nuevo insumo</Button>
        </div>
      </div>
      <FilterTabs
        value={filtro}
        onChange={(v) => setFiltro(v as typeof filtro)}
        options={[
          { value: "todos", label: "Todos" },
          { value: "ingrediente", label: "Ingredientes" },
          { value: "packaging", label: "Envases" },
        ]}
      />

      <Card>
        {filasInsumos.length === 0 ? (
          <EmptyState text="No hay resultados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Tipo</Th>
                  <Th>Stock</Th>
                  <Th>Mínimo</Th>
                  <Th>Precio actual</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filasInsumos.map((f) => (
                  <TrHover
                    key={f.id}
                    className={f.stock < 0 ? "bg-red-dim/50" : f.insumo?.stock_minimo != null && f.stock < f.insumo.stock_minimo ? "bg-red-dim/30" : ""}
                  >
                    <Td main>{f.nombre}</Td>
                    <Td>{f.sub}</Td>
                    <Td>
                      <span className={f.stock < 0 ? "text-red font-semibold" : ""}>
                        {fNum(f.stock, 2)} {f.unidad}
                      </span>
                      {f.stock < 0 && (
                        <Badge color="red">Stock negativo — revisar movimientos</Badge>
                      )}
                    </Td>
                    <Td>{f.insumo?.stock_minimo != null ? fNum(f.insumo.stock_minimo, 2) : "—"}</Td>
                    <Td>{f.insumo ? fARS(f.insumo.precio_actual) : "—"}</Td>
                    <Td className="whitespace-nowrap">
                      {f.insumo && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => abrirEdicion(f.insumo!)}>
                            Editar
                          </Button>
                          {f.insumo.controla_stock && (
                            <Button size="sm" variant="ghost" onClick={() => abrirConteo(f.insumo!, f.stock)}>
                              Contar stock
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => abrirFusion(f.insumo!)}>
                            Fusionar con otro
                          </Button>
                        </>
                      )}
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={fusionando != null}
        onClose={() => setFusionando(null)}
        title={`Fusionar "${fusionando?.insumo.nombre ?? ""}" con otro insumo`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFusionando(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarFusion} disabled={!fusionando?.destinoId}>
              Fusionar y borrar &ldquo;{fusionando?.insumo.nombre}&rdquo;
            </Button>
          </>
        }
      >
        {fusionando && (
          <FormGrid>
            <p className="col-span-full text-[12.5px] text-text3">
              Usá esto cuando el mismo insumo quedó cargado dos veces (ej. &ldquo;Bolsa al vacío&rdquo; duplicado). Elegí cuál de los
              dos insumos se conserva — las recetas, compras, historial de precios y movimientos de stock de &ldquo;
              {fusionando.insumo.nombre}&rdquo; pasan a ese insumo, y después se borra &ldquo;{fusionando.insumo.nombre}&rdquo;. No
              se puede deshacer.
            </p>
            <Field label="Conservar" full>
              <Select value={fusionando.destinoId} onChange={(e) => setFusionando({ ...fusionando, destinoId: e.target.value })}>
                <option value="">Seleccionar…</option>
                {data.insumos
                  .filter((i) => i.id !== fusionando.insumo.id)
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} ({i.unidad}, stock {fNum(calcularStock(data, "insumo", i.id), 2)})
                    </option>
                  ))}
              </Select>
            </Field>
          </FormGrid>
        )}
      </Modal>

      <Modal
        open={contando != null}
        onClose={() => setContando(null)}
        title={`Contar stock — ${contando?.insumo.nombre ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setContando(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarConteo}>Guardar conteo</Button>
          </>
        }
      >
        {contando && (
          <FormGrid>
            <Field label={`Cantidad física (${contando.insumo.unidad})`} full>
              <Input type="number" value={contando.cantidad} onChange={(e) => setContando({ ...contando, cantidad: Number(e.target.value) })} />
            </Field>
            <p className="col-span-full text-[12.5px] text-text3">
              Reemplaza el stock calculado de {contando.insumo.nombre} a partir de hoy — no se suma a lo anterior.
            </p>
          </FormGrid>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? "Editar insumo" : "Nuevo insumo"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Nombre" full>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoInsumo })}>
              <option value="ingrediente">Ingrediente</option>
              <option value="packaging">Packaging</option>
            </Select>
          </Field>
          <Field label="Categoría">
            <Select value={form.categoria_id ?? ""} onChange={(e) => setForm({ ...form, categoria_id: e.target.value || undefined })}>
              <option value="">Sin categoría</option>
              {categoriasPorAmbito(data, "insumo").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unidad">
            <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
          </Field>
          <Field label="Precio actual">
            <Input type="number" value={form.precio_actual} onChange={(e) => setForm({ ...form, precio_actual: Number(e.target.value) })} />
          </Field>
          <Field label="Stock mínimo">
            <Input
              type="number"
              value={form.stock_minimo ?? ""}
              onChange={(e) => setForm({ ...form, stock_minimo: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          <Field label="Controla stock">
            <Select value={form.controla_stock ? "si" : "no"} onChange={(e) => setForm({ ...form, controla_stock: e.target.value === "si" })}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function MovimientosTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tipo: "ajuste" as TipoInventarioMovimiento,
    item_tipo: "insumo" as TipoItemStock,
    item_id: "",
    cantidad: 0,
    notas: "",
  });

  const movimientos = useMemo(
    () =>
      data.inventario_movimientos
        .filter((m) => tipoFiltro === "todos" || m.tipo === tipoFiltro)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.inventario_movimientos, tipoFiltro]
  );

  function nombreItem(itemTipo: TipoItemStock, itemId: string) {
    if (itemTipo === "insumo") return data.insumos.find((i) => i.id === itemId)?.nombre ?? "(eliminado)";
    return data.productos.find((p) => p.id === itemId)?.nombre ?? "(eliminado)";
  }

  function registrar() {
    if (!form.item_id || form.cantidad === 0) {
      toast("Elegí un ítem y una cantidad distinta de 0", "error");
      return;
    }
    setData((d) => ({
      ...d,
      inventario_movimientos: [
        ...d.inventario_movimientos,
        { id: uid("MOV"), fecha: form.fecha, tipo: form.tipo, origen_tipo: "manual", item_tipo: form.item_tipo, item_id: form.item_id, cantidad: form.cantidad, notas: form.notas || undefined },
      ],
    }));
    toast("Movimiento registrado");
    setModalOpen(false);
    setForm({ ...form, item_id: "", cantidad: 0, notas: "" });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Registrar movimiento (conteo / ajuste / merma)</Button>
      </div>
      <FilterTabs
        value={tipoFiltro}
        onChange={setTipoFiltro}
        options={[{ value: "todos", label: "Todos" }, ...TIPOS_MOV.map((t) => ({ value: t, label: t }))]}
      />
      <Card>
        {movimientos.length === 0 ? (
          <EmptyState text="No hay movimientos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Tipo</Th>
                  <Th>Ítem</Th>
                  <Th>Cantidad</Th>
                  <Th>Origen</Th>
                  <Th>Notas</Th>
                </tr>
              </thead>
              <tbody>
                {movimientos.slice(0, 300).map((m) => (
                  <TrHover key={m.id}>
                    <Td>{m.fecha}</Td>
                    <Td>
                      <Badge color={MOV_COLOR[m.tipo]}>{m.tipo}</Badge>
                    </Td>
                    <Td main>{nombreItem(m.item_tipo, m.item_id)}</Td>
                    <Td className={m.cantidad >= 0 ? "text-green" : "text-red"}>{m.cantidad > 0 ? "+" : ""}{fNum(m.cantidad, 2)}</Td>
                    <Td>{m.origen_tipo ?? "—"}</Td>
                    <Td>{m.notas ?? "—"}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar movimiento manual"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={registrar}>Registrar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
          <Field label="Tipo">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoInventarioMovimiento })}>
              <option value="conteo">Conteo (resetea el stock a este valor)</option>
              <option value="ajuste">Ajuste (suma o resta)</option>
              <option value="merma">Merma</option>
            </Select>
          </Field>
          <Field label="Clase de ítem">
            <Select value={form.item_tipo} onChange={(e) => setForm({ ...form, item_tipo: e.target.value as TipoItemStock, item_id: "" })}>
              <option value="insumo">Insumo</option>
              <option value="producto">Producto terminado (por sabor)</option>
            </Select>
          </Field>
          <Field label="Ítem">
            <Select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {(form.item_tipo === "insumo" ? data.insumos.filter((i) => i.controla_stock) : data.productos.filter((p) => p.activo)).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cantidad (signo: + entra, − sale; en conteo es el valor observado)">
            <Input type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}

function AlertasStockTab() {
  const { data } = useStoreV2();
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const alertas = useMemo(() => calcularAlertasStock(data, hoy), [data, hoy]);
  const criticas = alertas.filter((a) => a.severidad === "critica");
  const importantes = alertas.filter((a) => a.severidad === "importante");

  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text3">
        Calculado a partir del libro de movimientos y de los pedidos Confirmado/En producción — nunca compra ni ajusta
        stock por sí sola, solo calcula días de cobertura y sugiere una cantidad a comprar. La decisión queda siempre
        del lado humano. Los insumos que solo se usan para el relleno (se preparan en una tanda mensual, no al ritmo
        diario/semanal de masa y packaging) no aparecen acá — se planifican desde Finanzas → Exportar a Sheets →
        RECETAS_RELLENO.
      </p>
      <StatGrid>
        <KpiCard label="Alertas críticas" value={fNum(criticas.length, 0)} color={criticas.length > 0 ? "red" : "green"} />
        <KpiCard label="Alertas importantes" value={fNum(importantes.length, 0)} color={importantes.length > 0 ? "orange" : "green"} />
        <KpiCard label="Insumos monitoreados" value={fNum(alertas.length, 0)} color="blue" />
      </StatGrid>
      {alertas.length === 0 ? (
        <EmptyState text="No hay insumos con control de stock activo." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Insumo</Th>
                <Th>Severidad</Th>
                <Th>Stock actual</Th>
                <Th>Consumo diario prom.</Th>
                <Th>Días de cobertura</Th>
                <Th>Necesidad pedidos pendientes</Th>
                <Th>Sugerido a comprar</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <TrHover key={a.insumo_id}>
                  <Td main>{a.insumo_nombre}</Td>
                  <Td>
                    <Badge color={SEVERIDAD_COLOR[a.severidad]}>{SEVERIDAD_LABEL[a.severidad]}</Badge>
                  </Td>
                  <Td>
                    {fNum(a.stock_actual, 2)} {a.unidad}
                  </Td>
                  <Td>
                    {fNum(a.consumo_diario_promedio, 2)} {a.unidad}/día
                    {a.variacion_consumo_pct !== null && (
                      <div className={`text-[11px] ${a.variacion_consumo_pct > 0 ? "text-orange" : "text-text3"}`}>
                        {a.variacion_consumo_pct > 0 ? "↑" : "↓"} {fNum(Math.abs(a.variacion_consumo_pct), 0)}% vs. período anterior
                      </div>
                    )}
                  </Td>
                  <Td className={a.dias_cobertura !== null && a.dias_cobertura < 7 ? "text-red" : ""}>
                    {a.dias_cobertura === null ? "—" : `~${Math.floor(a.dias_cobertura)} días`}
                  </Td>
                  <Td className={a.faltante_para_pedidos_pendientes > 0 ? "text-red" : ""}>
                    {fNum(a.necesidad_pedidos_pendientes, 2)} {a.unidad}
                    {a.faltante_para_pedidos_pendientes > 0 && (
                      <div className="text-[11px] text-red">
                        Faltan {fNum(a.faltante_para_pedidos_pendientes, 2)} {a.unidad}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {a.cantidad_sugerida_compra > 0 ? `${fNum(a.cantidad_sugerida_compra, 2)} ${a.unidad}` : "—"}
                  </Td>
                  <Td className="max-w-[280px] text-[11px] text-text3">{a.mensaje}</Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

function ProductosTerminadosTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [contando, setContando] = useState<{ producto: RicordoDataV2["productos"][number]; cajas: number } | null>(null);
  const umbral = data.configuracion.umbral_stock_bajo_producto;

  // Un solo stock por sabor (producto base), en unidades sueltas, compartido entre todas sus
  // presentaciones/canales — ver TipoItemStock en types-v2.ts. "Cajas ref." es solo una lectura
  // auxiliar (unidades / tamaño de caja típico de esa línea), no una presentación concreta.
  const filas = useMemo(
    () =>
      data.productos
        .filter((p) => p.activo)
        .filter((p) => !search || p.nombre.toLowerCase().includes(search.toLowerCase()))
        .map((p) => ({
          producto: p,
          fisico: calcularStock(data, "producto", p.id),
          reservado: calcularStockReservado(data, "producto", p.id),
          disponible: calcularStockDisponible(data, "producto", p.id),
        })),
    [data, search]
  );
  const bajoMinimo = filas.filter((f) => f.disponible < umbral);

  function abrirConteo(producto: RicordoDataV2["productos"][number], fisicoActual: number) {
    const ref = refUnidades(producto.linea);
    setContando({ producto, cajas: Math.round((fisicoActual / ref) * 100) / 100 });
  }

  // Un "conteo" resetea el stock físico conocido a la fecha de hoy al valor observado (no es un
  // ajuste que se suma/resta) — mismo mecanismo que ya existe para insumos (ver calcularStock).
  function guardarConteo() {
    if (!contando) return;
    const ref = refUnidades(contando.producto.linea);
    const unidades = Math.round(contando.cajas * ref);
    setData((d) => ({
      ...d,
      inventario_movimientos: [
        ...d.inventario_movimientos,
        {
          id: uid("MOV"),
          fecha: new Date().toISOString().slice(0, 10),
          tipo: "conteo" as const,
          origen_tipo: "conteo_manual",
          item_tipo: "producto" as const,
          item_id: contando.producto.id,
          cantidad: unidades,
          notas: `Conteo físico: ${fNum(contando.cajas, 2)} caja(s) de ${ref}u`,
        },
      ],
    }));
    toast(`Stock de ${contando.producto.nombre} actualizado a ${fNum(unidades, 0)} unidades`);
    setContando(null);
  }

  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text3">
        Stock de productos terminados por sabor — compartido entre todas sus presentaciones/canales de venta (una
        caja Mayorista de 8u y una Minorista de 12u del mismo sabor descuentan el mismo stock). El mínimo usado acá
        es el umbral general de Configuración → General (&ldquo;Stock bajo de producto&rdquo;, en unidades sueltas)
        — todavía no hay un mínimo particular por producto. &ldquo;Contar stock&rdquo; carga la cantidad física real
        que tenés de ese sabor (en cajas de referencia) y reemplaza el cálculo acumulado desde ahí en adelante.
      </p>
      <StatGrid>
        <KpiCard label="Productos activos" value={fNum(filas.length, 0)} color="blue" />
        <KpiCard label="Bajo mínimo" value={fNum(bajoMinimo.length, 0)} color={bajoMinimo.length > 0 ? "red" : "green"} />
      </StatGrid>
      <div className="mb-4 min-w-[180px] max-w-[300px]">
        <SearchInput placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card>
        {filas.length === 0 ? (
          <EmptyState text="No hay productos terminados activos." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Físico (unidades)</Th>
                  <Th>Reservado</Th>
                  <Th>Disponible</Th>
                  <Th>≈ cajas ref.</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <TrHover key={f.producto.id} className={f.disponible < umbral ? "bg-red-dim/30" : ""}>
                    <Td main>{f.producto.nombre}</Td>
                    <Td>{fNum(f.fisico, 0)}</Td>
                    <Td className="text-text3">{f.reservado > 0 ? fNum(f.reservado, 0) : "—"}</Td>
                    <Td className={f.disponible < 0 ? "text-red font-semibold" : ""}>{fNum(f.disponible, 0)}</Td>
                    <Td className="text-text3">{fNum(f.disponible / refUnidades(f.producto.linea), 1)}</Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => abrirConteo(f.producto, f.fisico)}>
                        Contar stock
                      </Button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={contando != null}
        onClose={() => setContando(null)}
        title={`Contar stock — ${contando?.producto.nombre ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setContando(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarConteo}>Guardar conteo</Button>
          </>
        }
      >
        {contando && (
          <FormGrid>
            <Field label={`Cantidad física (en cajas de ${refUnidades(contando.producto.linea)}u)`} full>
              <Input type="number" value={contando.cajas} onChange={(e) => setContando({ ...contando, cajas: Number(e.target.value) })} />
            </Field>
            <p className="col-span-full text-[12.5px] text-text3">
              = {fNum(contando.cajas * refUnidades(contando.producto.linea), 0)} unidades sueltas. Reemplaza el stock calculado de{" "}
              {contando.producto.nombre} a partir de hoy — no se suma a lo anterior.
            </p>
          </FormGrid>
        )}
      </Modal>
    </div>
  );
}

export function Inventario() {
  const [tab, setTab] = useState("materias_primas");
  return (
    <div>
      <PageHeader title="Inventario" sub="Materias primas, productos terminados y libro de movimientos" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "materias_primas", label: "Materias primas" },
          { value: "productos_terminados", label: "Productos terminados" },
          { value: "movimientos", label: "Movimientos" },
          { value: "alertas", label: "Alertas de stock (IA)" },
        ]}
      />
      {tab === "materias_primas" && <MateriasPrimasTab />}
      {tab === "productos_terminados" && <ProductosTerminadosTab />}
      {tab === "movimientos" && <MovimientosTab />}
      {tab === "alertas" && <AlertasStockTab />}
    </div>
  );
}
