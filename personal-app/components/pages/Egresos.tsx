"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import type { GastoCuota, GastoUnico } from "@/lib/types";
import { cuotaEnMes, cuotaMensual, fARS } from "@/lib/calc";
import { todayISO } from "@/lib/date";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Td,
  Th,
  TrHover,
  TableWrap,
} from "@/components/ui";
import { Modal } from "@/components/Modal";

function emptyFormUnico() {
  return { fecha: todayISO(), monto: "", descripcion: "", categoria: "" };
}

function emptyFormCuota() {
  return { descripcion: "", montoTotal: "", cantidadCuotas: "", fechaInicio: todayISO(), categoria: "" };
}

function estadoCuota(g: GastoCuota, mesActual: number, anioActual: number): { label: string; color: "green" | "gold" | "blue" } {
  const n = cuotaEnMes(g, mesActual, anioActual);
  if (n !== null) return { label: `Cuota ${n}/${g.cantidadCuotas}`, color: "green" };
  const [y, m] = g.fechaInicio.split("-").map(Number);
  const inicioIdx = y * 12 + (m - 1);
  const actualIdx = anioActual * 12 + (mesActual - 1);
  return actualIdx < inicioIdx ? { label: "Todavía no empieza", color: "blue" } : { label: "Finalizado", color: "gold" };
}

export function Egresos() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [formUnico, setFormUnico] = useState<ReturnType<typeof emptyFormUnico> | null>(null);
  const [editingUnicoId, setEditingUnicoId] = useState<string | null>(null);
  const [formCuota, setFormCuota] = useState<ReturnType<typeof emptyFormCuota> | null>(null);
  const [editingCuotaId, setEditingCuotaId] = useState<string | null>(null);

  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const anioActual = now.getFullYear();

  const listaUnicos = useMemo(
    () => [...data.gastosUnicos].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [data.gastosUnicos]
  );
  const listaCuotas = useMemo(
    () => [...data.gastosCuotas].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)),
    [data.gastosCuotas]
  );

  // Gastos únicos
  function openUnico(g?: GastoUnico) {
    if (g) {
      setEditingUnicoId(g.id);
      setFormUnico({ fecha: g.fecha, monto: String(g.monto), descripcion: g.descripcion, categoria: g.categoria });
    } else {
      setEditingUnicoId(null);
      setFormUnico(emptyFormUnico());
    }
  }

  function saveUnico() {
    if (!formUnico) return;
    const monto = Number(formUnico.monto);
    if (!formUnico.descripcion.trim() || !monto || monto <= 0) {
      toast("Completá descripción y un monto válido.", "error");
      return;
    }
    const payload: GastoUnico = {
      id: editingUnicoId ?? uid("GTU"),
      fecha: formUnico.fecha,
      monto,
      descripcion: formUnico.descripcion.trim(),
      categoria: formUnico.categoria.trim(),
    };
    setData((d) => ({
      ...d,
      gastosUnicos: editingUnicoId
        ? d.gastosUnicos.map((g) => (g.id === editingUnicoId ? payload : g))
        : [...d.gastosUnicos, payload],
    }));
    toast(editingUnicoId ? "Gasto actualizado." : "Gasto agregado.");
    setFormUnico(null);
    setEditingUnicoId(null);
  }

  function eliminarUnico(id: string) {
    setData((d) => ({ ...d, gastosUnicos: d.gastosUnicos.filter((g) => g.id !== id) }));
    toast("Gasto eliminado.", "info");
    setFormUnico(null);
    setEditingUnicoId(null);
  }

  // Gastos en cuotas
  function openCuota(g?: GastoCuota) {
    if (g) {
      setEditingCuotaId(g.id);
      setFormCuota({
        descripcion: g.descripcion,
        montoTotal: String(g.montoTotal),
        cantidadCuotas: String(g.cantidadCuotas),
        fechaInicio: g.fechaInicio,
        categoria: g.categoria,
      });
    } else {
      setEditingCuotaId(null);
      setFormCuota(emptyFormCuota());
    }
  }

  function saveCuota() {
    if (!formCuota) return;
    const montoTotal = Number(formCuota.montoTotal);
    const cantidadCuotas = Math.round(Number(formCuota.cantidadCuotas));
    if (!formCuota.descripcion.trim() || !montoTotal || montoTotal <= 0 || !cantidadCuotas || cantidadCuotas <= 0) {
      toast("Completá descripción, monto total y cantidad de cuotas válidos.", "error");
      return;
    }
    const payload: GastoCuota = {
      id: editingCuotaId ?? uid("GTC"),
      descripcion: formCuota.descripcion.trim(),
      montoTotal,
      cantidadCuotas,
      fechaInicio: formCuota.fechaInicio,
      categoria: formCuota.categoria.trim(),
    };
    setData((d) => ({
      ...d,
      gastosCuotas: editingCuotaId
        ? d.gastosCuotas.map((g) => (g.id === editingCuotaId ? payload : g))
        : [...d.gastosCuotas, payload],
    }));
    toast(editingCuotaId ? "Gasto en cuotas actualizado." : "Gasto en cuotas agregado.");
    setFormCuota(null);
    setEditingCuotaId(null);
  }

  function eliminarCuota(id: string) {
    setData((d) => ({ ...d, gastosCuotas: d.gastosCuotas.filter((g) => g.id !== id) }));
    toast("Gasto en cuotas eliminado.", "info");
    setFormCuota(null);
    setEditingCuotaId(null);
  }

  return (
    <div>
      <PageHeader title="Egresos" sub="Gastos únicos y gastos en cuotas" />

      <Card
        title="Gastos únicos"
        className="mb-4"
        right={<Button size="sm" onClick={() => openUnico()}>+ Nuevo gasto</Button>}
      >
        {listaUnicos.length === 0 ? (
          <EmptyState icon="🧾" text="Todavía no cargaste gastos únicos." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {listaUnicos.map((g) => (
                  <TrHover key={g.id}>
                    <Td>{g.fecha}</Td>
                    <Td main>{g.descripcion}</Td>
                    <Td>{g.categoria || "—"}</Td>
                    <Td className="text-red">{fARS(g.monto)}</Td>
                    <Td>
                      <button onClick={() => openUnico(g)} className="text-text3 hover:text-accent">
                        Editar
                      </button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card
        title="Gastos en cuotas"
        right={<Button size="sm" onClick={() => openCuota()}>+ Nuevo gasto en cuotas</Button>}
      >
        {listaCuotas.length === 0 ? (
          <EmptyState icon="💳" text="Todavía no cargaste gastos en cuotas." />
        ) : (
          <TableWrap>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <Th>Descripción</Th>
                  <Th>Categoría</Th>
                  <Th>Monto total</Th>
                  <Th>Cuota mensual</Th>
                  <Th>Inicio</Th>
                  <Th>Estado</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {listaCuotas.map((g) => {
                  const estado = estadoCuota(g, mesActual, anioActual);
                  return (
                    <TrHover key={g.id}>
                      <Td main>{g.descripcion}</Td>
                      <Td>{g.categoria || "—"}</Td>
                      <Td>{fARS(g.montoTotal)}</Td>
                      <Td className="text-red">{fARS(cuotaMensual(g))}</Td>
                      <Td>{g.fechaInicio}</Td>
                      <Td>
                        <Badge color={estado.color}>{estado.label}</Badge>
                      </Td>
                      <Td>
                        <button onClick={() => openCuota(g)} className="text-text3 hover:text-accent">
                          Editar
                        </button>
                      </Td>
                    </TrHover>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {/* Modal gasto único */}
      <Modal
        open={formUnico !== null}
        onClose={() => {
          setFormUnico(null);
          setEditingUnicoId(null);
        }}
        title={editingUnicoId ? "Editar gasto" : "Nuevo gasto único"}
        footer={
          <>
            {editingUnicoId && (
              <Button variant="danger" onClick={() => eliminarUnico(editingUnicoId)}>
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setFormUnico(null)}>Cancelar</Button>
            <Button onClick={saveUnico}>Guardar</Button>
          </>
        }
      >
        {formUnico && (
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Fecha">
              <Input type="date" value={formUnico.fecha} onChange={(e) => setFormUnico({ ...formUnico, fecha: e.target.value })} />
            </Field>
            <Field label="Monto">
              <Input
                type="number"
                min={0}
                value={formUnico.monto}
                onChange={(e) => setFormUnico({ ...formUnico, monto: e.target.value })}
              />
            </Field>
            <Field label="Descripción" full>
              <Input
                value={formUnico.descripcion}
                onChange={(e) => setFormUnico({ ...formUnico, descripcion: e.target.value })}
                placeholder="Supermercado, nafta, salidas…"
              />
            </Field>
            <Field label="Categoría" full>
              <Input
                value={formUnico.categoria}
                onChange={(e) => setFormUnico({ ...formUnico, categoria: e.target.value })}
                placeholder="Comida, Transporte, Ocio…"
              />
            </Field>
          </div>
        )}
      </Modal>

      {/* Modal gasto en cuotas */}
      <Modal
        open={formCuota !== null}
        onClose={() => {
          setFormCuota(null);
          setEditingCuotaId(null);
        }}
        title={editingCuotaId ? "Editar gasto en cuotas" : "Nuevo gasto en cuotas"}
        footer={
          <>
            {editingCuotaId && (
              <Button variant="danger" onClick={() => eliminarCuota(editingCuotaId)}>
                Eliminar
              </Button>
            )}
            <Button variant="ghost" onClick={() => setFormCuota(null)}>Cancelar</Button>
            <Button onClick={saveCuota}>Guardar</Button>
          </>
        }
      >
        {formCuota && (
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Descripción" full>
              <Input
                value={formCuota.descripcion}
                onChange={(e) => setFormCuota({ ...formCuota, descripcion: e.target.value })}
                placeholder="Notebook, viaje, electrodoméstico…"
              />
            </Field>
            <Field label="Monto total">
              <Input
                type="number"
                min={0}
                value={formCuota.montoTotal}
                onChange={(e) => setFormCuota({ ...formCuota, montoTotal: e.target.value })}
              />
            </Field>
            <Field label="Cantidad de cuotas">
              <Input
                type="number"
                min={1}
                value={formCuota.cantidadCuotas}
                onChange={(e) => setFormCuota({ ...formCuota, cantidadCuotas: e.target.value })}
              />
            </Field>
            <Field label="Fecha de inicio (1ra cuota)">
              <Input
                type="date"
                value={formCuota.fechaInicio}
                onChange={(e) => setFormCuota({ ...formCuota, fechaInicio: e.target.value })}
              />
            </Field>
            <Field label="Categoría">
              <Input
                value={formCuota.categoria}
                onChange={(e) => setFormCuota({ ...formCuota, categoria: e.target.value })}
                placeholder="Tecnología, Viajes…"
              />
            </Field>
            {formCuota.montoTotal && formCuota.cantidadCuotas && Number(formCuota.cantidadCuotas) > 0 && (
              <div className="col-span-full text-[11.5px] text-text3">
                Impacto mensual estimado:{" "}
                <span className="font-medium text-text2">
                  {fARS(Number(formCuota.montoTotal) / Number(formCuota.cantidadCuotas))}
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
