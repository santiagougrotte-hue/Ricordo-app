"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
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
import { calcularStockReservado, calcularStockDisponible, stockRestanteLote } from "@/lib/produccion-v2";
import { calcularAlertasStock } from "@/lib/ia-stock";
import type { SeveridadAlerta } from "@/lib/ia-stock";
import type { Insumo, TipoInsumo, TipoInventarioMovimiento, TipoItemStock, Preparacion, PreparacionRecetaItem } from "@/lib/types-v2";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(insumoVacio());

  const valorStock = valorStockInsumos(data);
  const bajoMinimo = data.insumos.filter((i) => i.controla_stock && i.stock_minimo != null && calcularStock(data, "insumo", i.id) < i.stock_minimo);

  const filasInsumos = useMemo(
    () =>
      data.insumos
        .filter((i) => filtro === "todos" || filtro === i.tipo)
        .filter((i) => !search || i.nombre.toLowerCase().includes(search.toLowerCase()))
        .map((i) => ({ tipo: "insumo" as const, id: i.id, nombre: i.nombre, sub: i.tipo, unidad: i.unidad, stock: calcularStock(data, "insumo", i.id), insumo: i })),
    [data, filtro, search]
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
        <Button onClick={abrirNuevo}>+ Nuevo insumo</Button>
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
                    <Td>{f.insumo && <Button size="sm" variant="ghost" onClick={() => abrirEdicion(f.insumo!)}>Editar</Button>}</Td>
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
    if (itemTipo === "preparacion") return data.preparaciones.find((p) => p.id === itemId)?.nombre ?? "(eliminada)";
    return data.producto_variantes.find((v) => v.id === itemId)?.nombre ?? "(eliminado)";
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
              <option value="preparacion">Preparación</option>
              <option value="producto_variante">Producto terminado</option>
            </Select>
          </Field>
          <Field label="Ítem">
            <Select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {(form.item_tipo === "insumo" ? data.insumos : form.item_tipo === "preparacion" ? data.preparaciones : data.producto_variantes).map((x) => (
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
        del lado humano.
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

function preparacionVacia(): Omit<Preparacion, "id"> {
  return { nombre: "", unidad: "g", controla_stock: true, stock_minimo: undefined, activo: true };
}

function PreparacionesTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(preparacionVacia());
  const [recetaModal, setRecetaModal] = useState<string | null>(null);
  const [lotesModal, setLotesModal] = useState<string | null>(null);

  const filas = useMemo(
    () =>
      data.preparaciones.map((p) => ({
        prep: p,
        fisico: calcularStock(data, "preparacion", p.id),
        reservado: calcularStockReservado(data, "preparacion", p.id),
        disponible: calcularStockDisponible(data, "preparacion", p.id),
      })),
    [data]
  );

  function abrirNueva() {
    setEditando(null);
    setForm(preparacionVacia());
    setModalOpen(true);
  }
  function abrirEdicion(p: Preparacion) {
    setEditando(p.id);
    setForm({ ...p });
    setModalOpen(true);
  }
  function guardar() {
    if (!form.nombre.trim() || !form.unidad.trim()) {
      toast("Nombre y unidad son obligatorios", "error");
      return;
    }
    if (editando) {
      setData((d) => ({ ...d, preparaciones: d.preparaciones.map((p) => (p.id === editando ? { ...p, ...form } : p)) }));
      toast("Preparación actualizada");
    } else {
      setData((d) => ({ ...d, preparaciones: [...d.preparaciones, { id: uid("PREP"), ...form }] }));
      toast("Preparación creada");
    }
    setModalOpen(false);
  }

  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text3">
        Rellenos, masas y salsas base que se elaboran aparte, con su propio stock y lote — antes de usarse en la
        receta de un producto terminado (Productos → ficha del producto → Receta por unidad → &ldquo;Relleno desde
        preparación&rdquo;).
      </p>
      <div className="mb-4 flex justify-end">
        <Button onClick={abrirNueva}>+ Nueva preparación</Button>
      </div>
      <Card>
        {filas.length === 0 ? (
          <EmptyState text="No hay preparaciones cargadas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Físico</Th>
                  <Th>Reservado</Th>
                  <Th>Disponible</Th>
                  <Th>Mínimo</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map(({ prep, fisico, reservado, disponible }) => (
                  <TrHover key={prep.id} className={prep.stock_minimo != null && disponible < prep.stock_minimo ? "bg-red-dim/30" : ""}>
                    <Td main>{prep.nombre}</Td>
                    <Td>
                      {fNum(fisico, 2)} {prep.unidad}
                    </Td>
                    <Td className="text-text3">
                      {reservado > 0 ? `${fNum(reservado, 2)} ${prep.unidad}` : "—"}
                    </Td>
                    <Td className={disponible < 0 ? "text-red font-semibold" : ""}>
                      {fNum(disponible, 2)} {prep.unidad}
                    </Td>
                    <Td>{prep.stock_minimo != null ? `${fNum(prep.stock_minimo, 2)} ${prep.unidad}` : "—"}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => abrirEdicion(prep)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRecetaModal(prep.id)}>
                          Receta
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLotesModal(prep.id)}>
                          Lotes
                        </Button>
                      </div>
                    </Td>
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
        title={editando ? "Editar preparación" : "Nueva preparación"}
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
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Relleno de calabaza" />
          </Field>
          <Field label="Unidad de stock">
            <Select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
              <option value="g">Gramos (g)</option>
              <option value="kg">Kilos (kg)</option>
            </Select>
          </Field>
          <Field label="Stock mínimo">
            <Input
              type="number"
              value={form.stock_minimo ?? ""}
              onChange={(e) => setForm({ ...form, stock_minimo: e.target.value ? Number(e.target.value) : undefined })}
            />
          </Field>
          <Field label="Activa">
            <Select value={form.activo ? "si" : "no"} onChange={(e) => setForm({ ...form, activo: e.target.value === "si" })}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Modal>

      {recetaModal && <RecetaPreparacionModal preparacionId={recetaModal} onClose={() => setRecetaModal(null)} />}
      {lotesModal && <LotesPreparacionModal preparacionId={lotesModal} onClose={() => setLotesModal(null)} />}
    </div>
  );
}

function RecetaPreparacionModal({ preparacionId, onClose }: { preparacionId: string; onClose: () => void }) {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const preparacion = data.preparaciones.find((p) => p.id === preparacionId)!;
  const receta = data.preparacion_recetas.find((r) => r.preparacion_id === preparacionId);
  const items = data.preparacion_receta_items.filter((i) => i.preparacion_id === preparacionId);
  const [rendimiento, setRendimiento] = useState(receta?.rendimiento_referencia ?? 0);

  function guardarRendimiento() {
    if (rendimiento <= 0) {
      toast("El rendimiento de referencia tiene que ser mayor a 0", "error");
      return;
    }
    setData((d) => {
      const yaExiste = d.preparacion_recetas.some((r) => r.preparacion_id === preparacionId);
      return {
        ...d,
        preparacion_recetas: yaExiste
          ? d.preparacion_recetas.map((r) => (r.preparacion_id === preparacionId ? { ...r, rendimiento_referencia: rendimiento } : r))
          : [...d.preparacion_recetas, { id: uid("PR"), preparacion_id: preparacionId, rendimiento_referencia: rendimiento }],
      };
    });
    toast("Rendimiento de referencia guardado");
  }

  function agregarInsumo() {
    const primerInsumo = data.insumos[0];
    if (!primerInsumo) {
      toast("Cargá al menos un insumo en Inventario → Materias primas primero", "error");
      return;
    }
    setData((d) => ({
      ...d,
      preparacion_receta_items: [...d.preparacion_receta_items, { id: uid("PRI"), preparacion_id: preparacionId, insumo_id: primerInsumo.id, cantidad: 0 }],
    }));
  }
  function actualizarInsumo(id: string, patch: Partial<PreparacionRecetaItem>) {
    setData((d) => ({ ...d, preparacion_receta_items: d.preparacion_receta_items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  }
  function quitarInsumo(id: string) {
    setData((d) => ({ ...d, preparacion_receta_items: d.preparacion_receta_items.filter((i) => i.id !== id) }));
  }

  return (
    <Modal open onClose={onClose} title={`Receta — ${preparacion.nombre}`} footer={<Button onClick={onClose}>Cerrar</Button>}>
      <p className="mb-3 text-[12.5px] text-text3">
        Cantidades de insumos para obtener el rendimiento de referencia cargado abajo — nunca se asume un rendimiento,
        se carga a mano. Al planificar una cantidad distinta, todo se escala proporcionalmente.
      </p>
      <FormGrid>
        <Field label={`Rendimiento de referencia (${preparacion.unidad})`}>
          <Input type="number" value={rendimiento} onChange={(e) => setRendimiento(Number(e.target.value))} />
        </Field>
        <Field label=" ">
          <Button onClick={guardarRendimiento}>Guardar rendimiento</Button>
        </Field>
      </FormGrid>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">Insumos</span>
          <Button size="sm" variant="ghost" onClick={agregarInsumo}>
            + Agregar insumo
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState text="Sin insumos cargados todavía." />
        ) : (
          items.map((item) => {
            const insumo = data.insumos.find((i) => i.id === item.insumo_id);
            return (
              <div key={item.id} className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface2/40 p-2.5">
                <Select value={item.insumo_id} onChange={(e) => actualizarInsumo(item.id, { insumo_id: e.target.value })} className="flex-1">
                  {data.insumos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} ({i.unidad})
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  placeholder={`Cantidad (${insumo?.unidad ?? ""})`}
                  className="w-32"
                  value={item.cantidad}
                  onChange={(e) => actualizarInsumo(item.id, { cantidad: Number(e.target.value) })}
                />
                <button onClick={() => quitarInsumo(item.id)} className="text-red hover:text-red/70">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

function LotesPreparacionModal({ preparacionId, onClose }: { preparacionId: string; onClose: () => void }) {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const preparacion = data.preparaciones.find((p) => p.id === preparacionId)!;
  const lotes = useMemo(
    () =>
      data.lotes_preparacion
        .filter((l) => l.preparacion_id === preparacionId)
        .map((lote) => ({ lote, restante: stockRestanteLote(data, lote.id) }))
        .sort((a, b) => b.lote.fecha_elaboracion.localeCompare(a.lote.fecha_elaboracion)),
    [data, preparacionId]
  );
  const [ajusteLote, setAjusteLote] = useState<string | null>(null);
  const [cantidadAjuste, setCantidadAjuste] = useState(0);
  const [motivoAjuste, setMotivoAjuste] = useState("");

  function registrarMerma() {
    if (!ajusteLote || cantidadAjuste <= 0 || !motivoAjuste.trim()) {
      toast("Elegí cantidad (mayor a 0) y motivo", "error");
      return;
    }
    const lote = data.lotes_preparacion.find((l) => l.id === ajusteLote)!;
    setData((d) => ({
      ...d,
      inventario_movimientos: [
        ...d.inventario_movimientos,
        {
          id: uid("MOV"),
          fecha: new Date().toISOString().slice(0, 10),
          tipo: "merma",
          origen_tipo: "manual",
          item_tipo: "preparacion",
          item_id: lote.preparacion_id,
          cantidad: -cantidadAjuste,
          lote_id: lote.id,
          notas: motivoAjuste,
        },
      ],
    }));
    toast("Merma registrada");
    setAjusteLote(null);
    setCantidadAjuste(0);
    setMotivoAjuste("");
  }

  return (
    <Modal open onClose={onClose} title={`Lotes — ${preparacion.nombre}`} footer={<Button onClick={onClose}>Cerrar</Button>}>
      {lotes.length === 0 ? (
        <EmptyState text="Todavía no se elaboró ningún lote de esta preparación." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Elaborado</Th>
                <Th>Obtenido</Th>
                <Th>Restante</Th>
                <Th>Costo/kg</Th>
                <Th>Ubicación</Th>
                <Th>Vence</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {lotes.map(({ lote, restante }) => (
                <TrHover key={lote.id}>
                  <Td>{lote.fecha_elaboracion}</Td>
                  <Td>
                    {fNum(lote.cantidad_obtenida, 2)} {preparacion.unidad}
                  </Td>
                  <Td className={restante <= 0 ? "text-text3" : ""}>
                    {fNum(restante, 2)} {preparacion.unidad}
                  </Td>
                  <Td>{fARS(lote.costo_total / Math.max(lote.cantidad_obtenida / 1000, 0.001))}</Td>
                  <Td>{lote.ubicacion ?? "—"}</Td>
                  <Td>{lote.vencimiento ?? "—"}</Td>
                  <Td>
                    {restante > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setAjusteLote(lote.id)}>
                        Merma/ajuste
                      </Button>
                    )}
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {ajusteLote && (
        <div className="mt-4 rounded-md border border-border bg-surface2/40 p-3">
          <FormGrid>
            <Field label="Cantidad a descontar">
              <Input type="number" value={cantidadAjuste} onChange={(e) => setCantidadAjuste(Number(e.target.value))} />
            </Field>
            <Field label="Motivo" full>
              <Input value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} placeholder="Se venció, se contaminó, etc." />
            </Field>
          </FormGrid>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAjusteLote(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={registrarMerma}>
              Registrar merma
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ProductosTerminadosTab() {
  const { data } = useStoreV2();
  const [search, setSearch] = useState("");
  const umbral = data.configuracion.umbral_stock_bajo_producto;

  const filas = useMemo(
    () =>
      data.producto_variantes
        .filter((v) => v.activo)
        .filter((v) => !search || v.nombre.toLowerCase().includes(search.toLowerCase()))
        .map((v) => ({
          variante: v,
          fisico: calcularStock(data, "producto_variante", v.id),
          reservado: calcularStockReservado(data, "producto_variante", v.id),
          disponible: calcularStockDisponible(data, "producto_variante", v.id),
        })),
    [data, search]
  );
  const bajoMinimo = filas.filter((f) => f.disponible < umbral);

  return (
    <div>
      <p className="mb-4 text-[12.5px] text-text3">
        Cajas de pasta, pizzas, lasañas y demás productos terminados listos para vender. El mínimo usado acá es el
        umbral general de Configuración → General (&ldquo;Stock bajo de producto&rdquo;) — todavía no hay un mínimo
        particular por producto.
      </p>
      <StatGrid>
        <KpiCard label="Variantes activas" value={fNum(filas.length, 0)} color="blue" />
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
                  <Th>Físico</Th>
                  <Th>Reservado</Th>
                  <Th>Disponible</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <TrHover key={f.variante.id} className={f.disponible < umbral ? "bg-red-dim/30" : ""}>
                    <Td main>{f.variante.nombre}</Td>
                    <Td>{fNum(f.fisico, 0)}</Td>
                    <Td className="text-text3">{f.reservado > 0 ? fNum(f.reservado, 0) : "—"}</Td>
                    <Td className={f.disponible < 0 ? "text-red font-semibold" : ""}>{fNum(f.disponible, 0)}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

export function Inventario() {
  const [tab, setTab] = useState("materias_primas");
  return (
    <div>
      <PageHeader title="Inventario" sub="Materias primas, preparaciones, productos terminados y libro de movimientos" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "materias_primas", label: "Materias primas" },
          { value: "preparaciones", label: "Preparaciones" },
          { value: "productos_terminados", label: "Productos terminados" },
          { value: "movimientos", label: "Movimientos" },
          { value: "alertas", label: "Alertas de stock (IA)" },
        ]}
      />
      {tab === "materias_primas" && <MateriasPrimasTab />}
      {tab === "preparaciones" && <PreparacionesTab />}
      {tab === "productos_terminados" && <ProductosTerminadosTab />}
      {tab === "movimientos" && <MovimientosTab />}
      {tab === "alertas" && <AlertasStockTab />}
    </div>
  );
}
