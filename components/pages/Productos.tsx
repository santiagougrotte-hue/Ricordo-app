"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { calcCosto, fARS, fPct } from "@/lib/calc";
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
  Select,
  Badge,
  InfoRow,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { Producto } from "@/lib/types";

function emptyForm() {
  return { nombre: "", categoria: "", id_base: "", precio_venta: 0, activo: true };
}

export function Productos() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [verReceta, setVerReceta] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(p: Producto) {
    setEditing(p.id);
    setForm({ nombre: p.nombre, categoria: p.categoria ?? "", id_base: p.id_base, precio_venta: p.precio_venta, activo: p.activo });
    setModalOpen(true);
  }
  function save() {
    if (!form.nombre) {
      toast("Ingresá un nombre", "error");
      return;
    }
    if (editing) {
      setData((d) => ({
        ...d,
        productos: d.productos.map((p) =>
          p.id === editing ? { ...p, ...form, id_base: form.id_base || p.id } : p
        ),
      }));
      toast("Producto actualizado");
    } else {
      const id = uid("PROD");
      setData((d) => ({ ...d, productos: [...d.productos, { id, ...form, id_base: form.id_base || id }] }));
      toast("Producto creado");
    }
    setModalOpen(false);
  }
  function eliminar(id: string) {
    setData((d) => ({ ...d, productos: d.productos.filter((p) => p.id !== id) }));
    toast("Producto eliminado", "info");
  }

  const prodReceta = verReceta ? data.productos.find((p) => p.id === verReceta) : null;
  const lineasReceta = verReceta ? data.recetas.filter((r) => r.id_producto === verReceta) : [];
  const costoReceta = verReceta ? calcCosto(data, verReceta) : 0;
  const margenReceta =
    prodReceta && prodReceta.precio_venta > 0 ? ((prodReceta.precio_venta - costoReceta) / prodReceta.precio_venta) * 100 : 0;

  return (
    <div>
      <PageHeader title="Productos" sub="Catálogo con recetas y costos" right={<Button onClick={openNew}>+ Nuevo</Button>} />

      <Card>
        {data.productos.length === 0 ? (
          <EmptyState text="Sin productos registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Base</Th>
                  <Th>Precio venta</Th>
                  <Th>Costo</Th>
                  <Th>Margen %</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {data.productos.map((p) => {
                  const costo = calcCosto(data, p.id);
                  const margen = p.precio_venta > 0 ? ((p.precio_venta - costo) / p.precio_venta) * 100 : 0;
                  const base = data.productos.find((b) => b.id === p.id_base);
                  return (
                    <TrHover key={p.id}>
                      <Td main>{p.nombre}</Td>
                      <Td>{p.id_base !== p.id && base ? base.nombre : "—"}</Td>
                      <Td>{fARS(p.precio_venta)}</Td>
                      <Td>{fARS(costo)}</Td>
                      <Td>
                        <Badge color={margen >= 50 ? "green" : margen >= 30 ? "orange" : "red"}>{fPct(margen)}</Badge>
                      </Td>
                      <Td>
                        <Badge color={p.activo ? "green" : "red"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                      </Td>
                      <Td>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => setVerReceta(p.id)}>
                            Receta
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                            Editar
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => eliminar(p.id)}>
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar Producto" : "Nuevo Producto"}
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
          <Field label="Categoría">
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          </Field>
          <Field label="Producto base (variante de)">
            <Select value={form.id_base} onChange={(e) => setForm({ ...form, id_base: e.target.value })}>
              <option value="">— Es un producto base —</option>
              {data.productos
                .filter((p) => p.id !== editing)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Precio de venta">
            <Input
              type="number"
              value={form.precio_venta}
              onChange={(e) => setForm({ ...form, precio_venta: Number(e.target.value) })}
            />
          </Field>
          <Field label="Activo">
            <Select value={form.activo ? "1" : "0"} onChange={(e) => setForm({ ...form, activo: e.target.value === "1" })}>
              <option value="1">Sí</option>
              <option value="0">No</option>
            </Select>
          </Field>
        </FormGrid>
      </Modal>

      <Modal open={!!verReceta} onClose={() => setVerReceta(null)} title={`Receta — ${prodReceta?.nombre ?? ""}`}>
        {lineasReceta.length === 0 ? (
          <EmptyState text="Este producto no tiene receta cargada." />
        ) : (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Tipo</Th>
                    <Th>Concepto</Th>
                    <Th>Cantidad</Th>
                    <Th>Costo</Th>
                  </tr>
                </thead>
                <tbody>
                  {lineasReceta.map((r) => {
                    let nombre = r.concepto;
                    let costoUnit = 0;
                    if (r.tipo === "Ingrediente") {
                      const ing = data.ingredientes.find((i) => i.id === r.concepto);
                      nombre = ing?.nombre ?? r.concepto;
                      costoUnit = ing ? (ing.precio_vigente ?? ing.precio_ref) : 0;
                    } else if (r.tipo === "Packaging") {
                      const pkg = data.packaging.find((p) => p.id === r.concepto);
                      nombre = pkg?.nombre ?? r.concepto;
                      costoUnit = pkg?.precio ?? 0;
                    } else {
                      const cf = data.costos_fijos.find((c) => c.id === r.concepto);
                      nombre = cf?.descripcion ?? r.concepto;
                      costoUnit = cf?.monto ?? 0;
                    }
                    return (
                      <TrHover key={r.id}>
                        <Td>{r.tipo}</Td>
                        <Td main>{nombre}</Td>
                        <Td>{r.cantidad}</Td>
                        <Td>{fARS(r.cantidad * costoUnit)}</Td>
                      </TrHover>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <div className="mt-4">
              <InfoRow label="Costo total" value={fARS(costoReceta)} color="gold" />
              <InfoRow label="Precio de venta" value={fARS(prodReceta?.precio_venta ?? 0)} />
              <InfoRow label="Margen" value={fPct(margenReceta)} color={margenReceta >= 30 ? "green" : "red"} />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
