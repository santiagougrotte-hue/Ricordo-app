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
import type { Insumo, TipoInsumo, TipoInventarioMovimiento } from "@/lib/types-v2";

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

function StockTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [filtro, setFiltro] = useState<"todos" | TipoInsumo | "producto">("todos");
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
  const filasProductos = useMemo(
    () =>
      (filtro === "todos" || filtro === "producto"
        ? data.producto_variantes
            .filter((v) => v.activo)
            .filter((v) => !search || v.nombre.toLowerCase().includes(search.toLowerCase()))
            .map((v) => ({ tipo: "producto_variante" as const, id: v.id, nombre: v.nombre, sub: "producto terminado", unidad: "unidad", stock: calcularStock(data, "producto_variante", v.id), insumo: null }))
        : []),
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
          { value: "packaging", label: "Packaging" },
          { value: "producto", label: "Productos terminados" },
        ]}
      />

      <Card>
        {filasInsumos.length + filasProductos.length === 0 ? (
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
                {[...filasInsumos, ...filasProductos].map((f) => (
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
    item_tipo: "insumo" as "insumo" | "producto_variante",
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

  function nombreItem(itemTipo: "insumo" | "producto_variante", itemId: string) {
    if (itemTipo === "insumo") return data.insumos.find((i) => i.id === itemId)?.nombre ?? "(eliminado)";
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
            <Select value={form.item_tipo} onChange={(e) => setForm({ ...form, item_tipo: e.target.value as "insumo" | "producto_variante", item_id: "" })}>
              <option value="insumo">Insumo</option>
              <option value="producto_variante">Producto terminado</option>
            </Select>
          </Field>
          <Field label="Ítem">
            <Select value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {(form.item_tipo === "insumo" ? data.insumos : data.producto_variantes).map((x) => (
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

export function Inventario() {
  const [tab, setTab] = useState("stock");
  return (
    <div>
      <PageHeader title="Inventario" sub="Insumos, productos terminados y libro de movimientos" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "stock", label: "Insumos y stock" },
          { value: "movimientos", label: "Movimientos" },
        ]}
      />
      {tab === "stock" ? <StockTab /> : <MovimientosTab />}
    </div>
  );
}
