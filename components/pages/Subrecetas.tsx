"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import { costoUnitarioSubreceta, fARS, fNum } from "@/lib/calc";
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
import type { Subreceta, RecetaUnidadLinea } from "@/lib/types";

function emptyForm() {
  return { nombre: "", categoria: "", rendimiento: 0, unidad: "g" };
}

/** Editor de la lista de ingredientes de la subreceta — mismo patrón que masa/relleno en
 * ProductoBaseEditor, pero acá vive local porque solo lo usa esta pantalla. */
function EditorReceta({
  lineas,
  onChange,
  nombreIngrediente,
  ingredientesDisponibles,
}: {
  lineas: RecetaUnidadLinea[];
  onChange: (lineas: RecetaUnidadLinea[]) => void;
  nombreIngrediente: (id: string) => string;
  ingredientesDisponibles: { id: string; nombre: string }[];
}) {
  const [draftIng, setDraftIng] = useState("");
  const [draftCant, setDraftCant] = useState(0);

  function agregar() {
    if (!draftIng || draftCant <= 0) return;
    onChange([...lineas, { id: uid("RU"), id_ingrediente: draftIng, cantidad: draftCant }]);
    setDraftIng("");
    setDraftCant(0);
  }
  function quitar(id: string) {
    onChange(lineas.filter((l) => l.id !== id));
  }
  function editarCantidad(id: string, cantidad: number) {
    onChange(lineas.map((l) => (l.id === id ? { ...l, cantidad } : l)));
  }

  return (
    <div>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_90px]">
        <Select value={draftIng} onChange={(e) => setDraftIng(e.target.value)}>
          <option value="">Seleccionar ingrediente…</option>
          {ingredientesDisponibles.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </Select>
        <Input type="number" value={draftCant} onChange={(e) => setDraftCant(Number(e.target.value))} placeholder="Cantidad" />
        <Button size="sm" onClick={agregar} className="justify-center">
          + Agregar
        </Button>
      </div>
      {lineas.length === 0 ? (
        <EmptyState text="Sin ingredientes todavía." />
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Ingrediente</Th>
                <Th>Cantidad</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <TrHover key={l.id}>
                  <Td main>{nombreIngrediente(l.id_ingrediente)}</Td>
                  <Td>
                    <Input type="number" value={l.cantidad} onChange={(e) => editarCantidad(l.id, Number(e.target.value))} className="w-24" />
                  </Td>
                  <Td>
                    <Button size="sm" variant="danger" onClick={() => quitar(l.id)}>
                      Quitar
                    </Button>
                  </Td>
                </TrHover>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  );
}

/** Componentes elaborados con receta propia (ej. Salsa Pomodoro) que un producto puede usar
 * como si fuera un ingrediente más — costoUnitarioSubreceta() deriva su costo de sus propios
 * ingredientes, nunca se tipea a mano. Se usan como "insumo adicional" al editar un producto de
 * venta (ProductoVentaEditor → excepciones, tipo Subreceta). */
export function Subrecetas() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [receta, setReceta] = useState<RecetaUnidadLinea[]>([]);
  const [mostrarBajas, setMostrarBajas] = useState(false);

  const visibles = data.subrecetas.filter((s) => mostrarBajas || s.activo !== false);
  const nombreIngrediente = (id: string) => data.ingredientes.find((i) => i.id === id)?.nombre ?? id;
  const ingredientesDisponibles = data.ingredientes.map((i) => ({ id: i.id, nombre: i.nombre }));

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setReceta([]);
    setModalOpen(true);
  }
  function openEdit(s: Subreceta) {
    setEditing(s.id);
    setForm({ nombre: s.nombre, categoria: s.categoria ?? "", rendimiento: s.rendimiento, unidad: s.unidad });
    setReceta(s.receta.map((l) => ({ ...l })));
    setModalOpen(true);
  }
  function save() {
    if (!form.nombre || form.rendimiento <= 0) {
      toast("Completá nombre y rendimiento", "error");
      return;
    }
    if (editing) {
      setData((d) => ({
        ...d,
        subrecetas: d.subrecetas.map((s) => (s.id === editing ? { ...s, ...form, receta } : s)),
      }));
      toast("Subreceta actualizada");
    } else {
      setData((d) => ({ ...d, subrecetas: [...d.subrecetas, { id: uid("SUB"), ...form, receta }] }));
      toast("Subreceta creada");
    }
    setModalOpen(false);
  }
  // Soft-delete: una subreceta usada por productos no se borra en duro — se da de baja y su
  // costo sigue disponible para el historial de esos productos.
  function eliminar(id: string) {
    if (!confirm("¿Dar de baja esta subreceta? Los productos que ya la usan conservan su costo histórico.")) return;
    setData((d) => ({ ...d, subrecetas: d.subrecetas.map((s) => (s.id === id ? { ...s, activo: false } : s)) }));
    toast("Subreceta dada de baja", "info");
  }
  function reactivar(id: string) {
    setData((d) => ({ ...d, subrecetas: d.subrecetas.map((s) => (s.id === id ? { ...s, activo: true } : s)) }));
    toast("Subreceta reactivada");
  }

  const costoDraft = (() => {
    if (form.rendimiento <= 0) return 0;
    const total = receta.reduce((acc, l) => acc + l.cantidad * (data.ingredientes.find((i) => i.id === l.id_ingrediente)?.precio_vigente ?? data.ingredientes.find((i) => i.id === l.id_ingrediente)?.precio_ref ?? 0), 0);
    return total / form.rendimiento;
  })();

  return (
    <div>
      <PageHeader
        title="Subrecetas"
        sub="Componentes elaborados (ej. salsas) con su propia receta, reutilizables en varios productos"
        right={
          <>
            <Button variant={mostrarBajas ? "primary" : "ghost"} onClick={() => setMostrarBajas((v) => !v)}>
              {mostrarBajas ? "Ocultar dadas de baja" : "Mostrar dadas de baja"}
            </Button>
            <Button onClick={openNew}>+ Nueva Subreceta</Button>
          </>
        }
      />

      <Card>
        {visibles.length === 0 ? (
          <EmptyState text="Sin subrecetas registradas." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Categoría</Th>
                  <Th>Rendimiento</Th>
                  <Th>Ingredientes</Th>
                  <Th title="Costo por unidad de rendimiento (ej. por gramo)">Costo unitario</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((s) => (
                  <TrHover key={s.id} className={s.activo === false ? "opacity-50" : undefined}>
                    <Td main>{s.nombre}</Td>
                    <Td>{s.categoria || "—"}</Td>
                    <Td>
                      {fNum(s.rendimiento, 0)} {s.unidad}
                    </Td>
                    <Td>{s.receta.length}</Td>
                    <Td>{fARS(costoUnitarioSubreceta(data, s.id))}</Td>
                    <Td>
                      <Badge color={s.activo === false ? "red" : "green"}>{s.activo === false ? "De baja" : "Activa"}</Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                          Editar
                        </Button>
                        {s.activo === false ? (
                          <Button size="sm" variant="green" onClick={() => reactivar(s.id)}>
                            Reactivar
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => eliminar(s.id)}>
                            Dar de baja
                          </Button>
                        )}
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
        title={editing ? "Editar Subreceta" : "Nueva Subreceta"}
        wide
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
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Salsa Pomodoro" />
          </Field>
          <Field label="Categoría">
            <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
          </Field>
          <Field label="Unidad de rendimiento">
            <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="g, ml, unidad…" />
          </Field>
          <Field label="Rendimiento total" full>
            <Input
              type="number"
              value={form.rendimiento}
              onChange={(e) => setForm({ ...form, rendimiento: Number(e.target.value) })}
              placeholder="Cuánto da la receta completa, ej. 2500 (g)"
            />
          </Field>
        </FormGrid>

        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 text-[13px] font-semibold text-text2">Receta</div>
          <EditorReceta
            lineas={receta}
            onChange={setReceta}
            nombreIngrediente={nombreIngrediente}
            ingredientesDisponibles={ingredientesDisponibles}
          />
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface2/40 p-4">
          <InfoRow
            label={`Costo por ${form.unidad || "unidad"}`}
            value={fARS(costoDraft)}
            color="gold"
          />
        </div>
      </Modal>
    </div>
  );
}
