"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { fARS, fPct, pvr } from "@/lib/calc";
import {
  PageHeader,
  Button,
  Card,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  FormGrid,
  Field,
  Input,
  SearchInput,
  Badge,
  FilterTabs,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Wizard } from "@/components/Wizard";
import type { Ingrediente, Packaging } from "@/lib/types";

function emptyForm() {
  return { nombre: "", unidad: "", categoria: "", precio_ref: 0, stock_minimo: 0, peso_unitario_g: 0 };
}

function IngredientesTab() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const filtrados = useMemo(
    () => data.ingredientes.filter((i) => !search || i.nombre.toLowerCase().includes(search.toLowerCase())),
    [data.ingredientes, search]
  );

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(i: Ingrediente) {
    setEditing(i.id);
    setForm({
      nombre: i.nombre,
      unidad: i.unidad,
      categoria: i.categoria ?? "",
      precio_ref: i.precio_ref,
      stock_minimo: i.stock_minimo ?? 0,
      peso_unitario_g: i.peso_unitario_g ?? 0,
    });
    setModalOpen(true);
  }

  function save() {
    if (!form.nombre || !form.unidad) {
      toast("Completá nombre y unidad", "error");
      return;
    }
    if (editing) {
      const prev = data.ingredientes.find((i) => i.id === editing);
      setData((d) => ({
        ...d,
        ingredientes: d.ingredientes.map((i) => (i.id === editing ? { ...i, ...form } : i)),
        historial_precios:
          prev && prev.precio_ref !== form.precio_ref
            ? [
                ...d.historial_precios,
                {
                  id: uid("HIST"),
                  id_insumo: editing,
                  insumo: form.nombre,
                  precio_anterior: prev.precio_ref,
                  precio_nuevo: form.precio_ref,
                  fecha: new Date().toISOString().slice(0, 10),
                },
              ]
            : d.historial_precios,
      }));
      toast("Insumo actualizado");
    } else {
      setData((d) => ({
        ...d,
        ingredientes: [...d.ingredientes, { id: uid("ING"), ...form, precio_vigente: null, seguimiento_stock: false }],
      }));
      toast("Insumo creado");
    }
    setModalOpen(false);
  }

  function toggleSeguimiento(id: string) {
    setData((d) => ({
      ...d,
      ingredientes: d.ingredientes.map((i) => (i.id === id ? { ...i, seguimiento_stock: !i.seguimiento_stock } : i)),
    }));
  }

  function eliminar(id: string) {
    setData((d) => ({ ...d, ingredientes: d.ingredientes.filter((i) => i.id !== id) }));
    toast("Insumo eliminado", "info");
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="max-w-xs flex-1">
          <SearchInput placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={openNew}>+ Nuevo Insumo</Button>
      </div>

      <Card>
        {filtrados.length === 0 ? (
          <EmptyState text="Sin insumos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Unidad</Th>
                  <Th>Precio ref.</Th>
                  <Th>Precio vigente</Th>
                  <Th>Variación</Th>
                  <Th title="Solo aplica a insumos comprados por unidad que pesan (ej. huevo)">Peso unit.</Th>
                  <Th>Seguim. stock</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((i) => {
                  const vigente = pvr(i);
                  const variacion = i.precio_ref > 0 ? ((vigente - i.precio_ref) / i.precio_ref) * 100 : 0;
                  return (
                    <TrHover key={i.id}>
                      <Td main>{i.nombre}</Td>
                      <Td>{i.unidad}</Td>
                      <Td>{fARS(i.precio_ref)}</Td>
                      <Td>{fARS(vigente)}</Td>
                      <Td>
                        {variacion === 0 ? (
                          "—"
                        ) : (
                          <Badge color={variacion > 0 ? "red" : "green"}>
                            {variacion > 0 ? "+" : ""}
                            {fPct(variacion)}
                          </Badge>
                        )}
                      </Td>
                      <Td>{i.peso_unitario_g ? `${i.peso_unitario_g} g` : "—"}</Td>
                      <Td>
                        <button
                          onClick={() => toggleSeguimiento(i.id)}
                          className={`rounded-full px-2.5 py-1 text-[11px] ${
                            i.seguimiento_stock ? "bg-green-dim text-green" : "bg-surface3 text-text3"
                          }`}
                        >
                          {i.seguimiento_stock ? "Activo" : "Inactivo"}
                        </button>
                      </Td>
                      <Td>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(i)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => eliminar(i.id)}>
                            Eliminar
                          </Button>
                        </div>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {editing ? (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Editar Insumo"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={save}>Guardar</Button>
            </>
          }
        >
          <FormGrid>
            <Field label="Nombre" full>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Unidad">
              <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="kg, litro, unidad…" />
            </Field>
            <Field label="Categoría">
              <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
            </Field>
            <Field label="Precio de referencia">
              <Input
                type="number"
                value={form.precio_ref}
                onChange={(e) => setForm({ ...form, precio_ref: Number(e.target.value) })}
              />
            </Field>
            <Field label="Stock mínimo">
              <Input
                type="number"
                value={form.stock_minimo}
                onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })}
              />
            </Field>
            <Field label="Peso unitario (g)">
              <Input
                type="number"
                value={form.peso_unitario_g}
                onChange={(e) => setForm({ ...form, peso_unitario_g: Number(e.target.value) })}
                placeholder="Solo si se compra por unidad y pesa (ej. huevo)"
              />
            </Field>
          </FormGrid>
        </Modal>
      ) : (
        <Wizard
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Nuevo Insumo"
          finishLabel="Crear insumo"
          onFinish={save}
          steps={[
            {
              title: "Datos básicos",
              validate: () => (!form.nombre || !form.unidad ? "Completá nombre y unidad" : null),
              content: (
                <FormGrid>
                  <Field label="Nombre" full>
                    <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                  </Field>
                  <Field label="Unidad">
                    <Input
                      value={form.unidad}
                      onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                      placeholder="kg, litro, unidad…"
                    />
                  </Field>
                  <Field label="Categoría">
                    <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
                  </Field>
                </FormGrid>
              ),
            },
            {
              title: "Precio y stock",
              content: (
                <FormGrid>
                  <Field label="Precio de referencia">
                    <Input
                      type="number"
                      value={form.precio_ref}
                      onChange={(e) => setForm({ ...form, precio_ref: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Stock mínimo">
                    <Input
                      type="number"
                      value={form.stock_minimo}
                      onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Peso unitario (g)">
                    <Input
                      type="number"
                      value={form.peso_unitario_g}
                      onChange={(e) => setForm({ ...form, peso_unitario_g: Number(e.target.value) })}
                      placeholder="Solo si se compra por unidad y pesa (ej. huevo)"
                    />
                  </Field>
                </FormGrid>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

function PackagingTab() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", unidad: "", precio: 0 });

  function openNew() {
    setEditing(null);
    setForm({ nombre: "", unidad: "", precio: 0 });
    setModalOpen(true);
  }
  function openEdit(p: Packaging) {
    setEditing(p.id);
    setForm({ nombre: p.nombre, unidad: p.unidad, precio: p.precio });
    setModalOpen(true);
  }
  function save() {
    if (!form.nombre) {
      toast("Ingresá un nombre", "error");
      return;
    }
    if (editing) {
      setData((d) => ({ ...d, packaging: d.packaging.map((p) => (p.id === editing ? { ...p, ...form } : p)) }));
      toast("Packaging actualizado");
    } else {
      setData((d) => ({ ...d, packaging: [...d.packaging, { id: uid("PKG"), ...form }] }));
      toast("Packaging creado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    setData((d) => ({ ...d, packaging: d.packaging.filter((p) => p.id !== id) }));
    toast("Eliminado", "info");
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>+ Nuevo Packaging</Button>
      </div>
      <Card>
        {data.packaging.length === 0 ? (
          <EmptyState text="Sin ítems de packaging." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Unidad</Th>
                  <Th>Precio</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {data.packaging.map((p) => (
                  <TrHover key={p.id}>
                    <Td main>{p.nombre}</Td>
                    <Td>{p.unidad}</Td>
                    <Td>{fARS(p.precio)}</Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => eliminar(p.id)}>
                          Eliminar
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
        title={editing ? "Editar Packaging" : "Nuevo Packaging"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Guardar</Button>
          </>
        }
      >
        <FormGrid>
          <Field label="Nombre" full>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </Field>
          <Field label="Unidad">
            <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} />
          </Field>
          <Field label="Precio">
            <Input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: Number(e.target.value) })} />
          </Field>
        </FormGrid>
      </Modal>
    </>
  );
}

export function Insumos() {
  const [tab, setTab] = useState("ingredientes");
  return (
    <div>
      <PageHeader title="Insumos" sub="Materia prima y packaging con historial de precios" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "ingredientes", label: "Ingredientes" },
          { value: "packaging", label: "Packaging" },
        ]}
      />
      {tab === "ingredientes" ? <IngredientesTab /> : <PackagingTab />}
    </div>
  );
}
