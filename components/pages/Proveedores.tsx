"use client";

import React, { useMemo, useState } from "react";
import { Paperclip } from "lucide-react";
import { useEntityCrud } from "@/lib/useEntity";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { useStore } from "@/lib/store";
import { comparadorProveedores, fichaProveedor, fARS, fPct } from "@/lib/calc";
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
  Textarea,
  Badge,
} from "@/components/ui";
import { Modal } from "@/components/Modal";
import { FileAttach } from "@/components/FileAttach";
import type { Adjunto, Proveedor } from "@/lib/types";

function emptyForm() {
  return {
    nombre: "",
    contacto: "",
    telefono: "",
    email: "",
    direccion: "",
    notas: "",
    documento: undefined as Adjunto | undefined,
  };
}

export function Proveedores() {
  const { items, add, update } = useEntityCrud<Proveedor>("proveedores");
  const { data } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [mostrarBajas, setMostrarBajas] = useState(false);

  const visibles = items.filter((p) => mostrarBajas || p.activo !== false);

  // Soft-delete: un proveedor con historial de compras nunca se borra físicamente.
  function eliminar(id: string) {
    if (!confirm("¿Dar de baja este proveedor? Su historial de compras se conserva.")) return;
    update(id, { activo: false });
    toast("Proveedor dado de baja", "info");
  }
  function reactivar(id: string) {
    update(id, { activo: true });
    toast("Proveedor reactivado");
  }

  const comparador = useMemo(() => comparadorProveedores(data), [data]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }
  function openEdit(p: Proveedor) {
    setEditing(p.id);
    setForm({
      nombre: p.nombre,
      contacto: p.contacto ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      direccion: p.direccion ?? "",
      notas: p.notas ?? "",
      documento: p.documento,
    });
    setModalOpen(true);
  }
  function save() {
    if (!form.nombre) {
      toast("Ingresá un nombre", "error");
      return;
    }
    if (editing) update(editing, form);
    else add({ id: uid("PROV"), ...form });
    toast(editing ? "Proveedor actualizado" : "Proveedor creado");
    setModalOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Proveedores"
        right={
          <>
            <Button variant={mostrarBajas ? "primary" : "ghost"} onClick={() => setMostrarBajas((v) => !v)}>
              {mostrarBajas ? "Ocultar dados de baja" : "Mostrar dados de baja"}
            </Button>
            <Button onClick={openNew}>+ Nuevo</Button>
          </>
        }
      />
      <Card color="blue">
        {visibles.length === 0 ? (
          <EmptyState text="Sin proveedores registrados." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Contacto</Th>
                  <Th>Teléfono</Th>
                  <Th>Dirección</Th>
                  <Th>Compras</Th>
                  <Th>Total comprado</Th>
                  <Th>Precio promedio</Th>
                  <Th title="Insumos con al menos una compra registrada a este proveedor">Insumos</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const ficha = fichaProveedor(data, p.id);
                  return (
                  <TrHover key={p.id} className={p.activo === false ? "opacity-50" : undefined}>
                    <Td main>
                      <div className="flex items-center gap-1.5">
                        {p.nombre}
                        {p.documento && (
                          <a
                            href={p.documento.data}
                            download={p.documento.nombre}
                            title={p.documento.nombre}
                            className="text-text3 hover:text-accent"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </Td>
                    <Td>{p.contacto || "—"}</Td>
                    <Td>{p.telefono || "—"}</Td>
                    <Td>{p.direccion || "—"}</Td>
                    <Td>{ficha.cantidadCompras}</Td>
                    <Td>{fARS(ficha.totalComprado)}</Td>
                    <Td>{ficha.cantidadCompras > 0 ? fARS(ficha.precioPromedioCompra) : "—"}</Td>
                    <Td>
                      <span title={ficha.insumosSuministrados.join(", ")}>
                        {ficha.insumosSuministrados.length > 0 ? ficha.insumosSuministrados.length : "—"}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          Editar
                        </Button>
                        {p.activo === false ? (
                          <Button size="sm" variant="green" onClick={() => reactivar(p.id)}>
                            Reactivar
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => eliminar(p.id)}>
                            Dar de baja
                          </Button>
                        )}
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

      {comparador.length > 0 && (
        <Card title="Comparador de proveedores" className="mt-4" color="orange">
          <p className="mb-3 text-[12.5px] text-text3">
            Insumos con compras registradas a más de un proveedor — solo tiene sentido comparar cuando hay opciones.
          </p>
          <div className="flex flex-col gap-4">
            {comparador.map((c) => (
              <div key={c.id_ingrediente}>
                <div className="mb-1.5 text-[12.5px] font-semibold text-text">{c.nombreIngrediente}</div>
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>Proveedor</Th>
                        <Th>Último precio</Th>
                        <Th>Fecha última compra</Th>
                        <Th>Precio promedio</Th>
                        <Th>Compras</Th>
                        <Th>Diferencia</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.proveedores.map((p) => (
                        <TrHover key={p.id_proveedor}>
                          <Td main>{p.nombreProveedor}</Td>
                          <Td>{fARS(p.ultimoPrecio)}</Td>
                          <Td>{p.fechaUltimaCompra}</Td>
                          <Td>{fARS(p.precioPromedio)}</Td>
                          <Td>{p.cantidadCompras}</Td>
                          <Td>
                            {p.diferenciaPct === 0 ? (
                              <Badge color="green">Más barato</Badge>
                            ) : (
                              <Badge color="red">+{fPct(p.diferenciaPct)}</Badge>
                            )}
                          </Td>
                        </TrHover>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar Proveedor" : "Nuevo Proveedor"}
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
          <Field label="Contacto">
            <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          </Field>
          <Field label="Email" full>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Dirección" full>
            <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </Field>
          <Field label="Notas" full>
            <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Field>
          <Field label="Documento" full>
            <FileAttach value={form.documento} onChange={(documento) => setForm({ ...form, documento })} />
          </Field>
        </FormGrid>
      </Modal>
    </div>
  );
}
