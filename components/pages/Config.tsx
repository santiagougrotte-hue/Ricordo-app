"use client";

import React, { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { STORAGE_KEY } from "@/lib/types";
import type { Pedido, Cliente, Producto, Compra, Ingrediente, Proveedor } from "@/lib/types";
import { fNum, pvr } from "@/lib/calc";
import { toCSV, descargarCSV, type ColumnaCSV } from "@/lib/csv";
import { Card, PageHeader, Field, Input, Button, InfoRow, TableWrap, Th, Td, TrHover, EmptyState, Select } from "@/components/ui";

type EntidadExportable = "pedidos" | "clientes" | "productos" | "compras" | "ingredientes" | "proveedores";

const COLUMNAS_PEDIDOS: ColumnaCSV<Pedido>[] = [
  { header: "ID pedido", value: (r) => r.id_pedido },
  { header: "Fecha", value: (r) => r.fecha },
  { header: "Cliente", value: (r) => r.id_cliente },
  { header: "Producto", value: (r) => r.nombre_producto },
  { header: "Cantidad", value: (r) => r.cantidad },
  { header: "Precio unitario", value: (r) => r.precio_unitario },
  { header: "Descuento", value: (r) => r.descuento_monto },
  { header: "Precio neto", value: (r) => r.precio_neto },
  { header: "Estado", value: (r) => r.estado },
  { header: "Canal", value: (r) => r.canal },
  { header: "Estado de pago", value: (r) => r.estado_pago ?? "Pagado" },
  { header: "Monto pagado", value: (r) => r.monto_pagado ?? "" },
  { header: "Fecha entrega", value: (r) => r.fecha_entrega ?? "" },
  { header: "Fecha vencimiento", value: (r) => r.fecha_vencimiento ?? "" },
  { header: "Método de pago", value: (r) => r.metodo_pago ?? "" },
  { header: "Notas", value: (r) => r.notas ?? "" },
];

const COLUMNAS_CLIENTES: ColumnaCSV<Cliente>[] = [
  { header: "ID", value: (r) => r.id },
  { header: "Nombre", value: (r) => r.nombre },
  { header: "Canal", value: (r) => r.canal },
  { header: "Dirección", value: (r) => r.direccion ?? "" },
  { header: "Teléfono", value: (r) => r.telefono ?? "" },
  { header: "Email", value: (r) => r.email ?? "" },
  { header: "Fecha alta", value: (r) => r.fecha_alta ?? "" },
  { header: "Activo", value: (r) => (r.activo === false ? "No" : "Sí") },
  { header: "Notas", value: (r) => r.notas ?? "" },
];

const COLUMNAS_PRODUCTOS: ColumnaCSV<Producto>[] = [
  { header: "ID", value: (r) => r.id },
  { header: "Nombre", value: (r) => r.nombre },
  { header: "Categoría", value: (r) => r.categoria ?? "" },
  { header: "Canal", value: (r) => r.canal ?? "" },
  { header: "Precio de venta", value: (r) => r.precio_venta },
  { header: "Activo", value: (r) => (r.activo ? "Sí" : "No") },
];

const COLUMNAS_COMPRAS: ColumnaCSV<Compra>[] = [
  { header: "ID", value: (r) => r.id },
  { header: "Fecha", value: (r) => r.fecha },
  { header: "Proveedor", value: (r) => r.id_proveedor },
  { header: "Descripción", value: (r) => r.descripcion ?? "" },
  { header: "Total", value: (r) => r.total },
  { header: "Método de pago", value: (r) => r.metodo_pago ?? "" },
  { header: "Anulada", value: (r) => (r.anulada ? "Sí" : "No") },
  { header: "Notas", value: (r) => r.notas ?? "" },
];

const COLUMNAS_INGREDIENTES: ColumnaCSV<Ingrediente>[] = [
  { header: "ID", value: (r) => r.id },
  { header: "Nombre", value: (r) => r.nombre },
  { header: "Unidad", value: (r) => r.unidad },
  { header: "Categoría", value: (r) => r.categoria ?? "" },
  { header: "Precio de referencia", value: (r) => r.precio_ref },
  { header: "Precio vigente", value: (r) => pvr(r) },
  { header: "Stock mínimo", value: (r) => r.stock_minimo ?? "" },
];

const COLUMNAS_PROVEEDORES: ColumnaCSV<Proveedor>[] = [
  { header: "ID", value: (r) => r.id },
  { header: "Nombre", value: (r) => r.nombre },
  { header: "Contacto", value: (r) => r.contacto ?? "" },
  { header: "Teléfono", value: (r) => r.telefono ?? "" },
  { header: "Email", value: (r) => r.email ?? "" },
  { header: "Activo", value: (r) => (r.activo === false ? "No" : "Sí") },
  { header: "Notas", value: (r) => r.notas ?? "" },
];

const ENTIDADES_EXPORTABLES: { value: EntidadExportable; label: string }[] = [
  { value: "pedidos", label: "Pedidos" },
  { value: "clientes", label: "Clientes" },
  { value: "productos", label: "Productos" },
  { value: "compras", label: "Compras" },
  { value: "ingredientes", label: "Ingredientes" },
  { value: "proveedores", label: "Proveedores" },
];

export function Config() {
  const { data, setData, resetToEmpty, reloadSeed } = useStore();
  const { toast } = useToast();
  const [valor, setValor] = useState(data.tipo_cambio.valor);
  const [fuente, setFuente] = useState(data.tipo_cambio.fuente);
  const [pctReinversion, setPctReinversion] = useState(data.caja_inteligente.porcentaje_reinversion);
  const [pctSeguridad, setPctSeguridad] = useState(data.caja_inteligente.porcentaje_seguridad);
  const [entidadCSV, setEntidadCSV] = useState<EntidadExportable>("pedidos");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalTokensIa = useMemo(
    () => data.ia_log.reduce((acc, l) => acc + l.tokens_entrada + l.tokens_salida, 0),
    [data.ia_log]
  );
  const iaLogReciente = useMemo(() => [...data.ia_log].reverse().slice(0, 20), [data.ia_log]);

  function guardarTipoCambio() {
    setData((d) => ({ ...d, tipo_cambio: { valor, fuente } }));
    toast("Tipo de cambio actualizado");
  }

  function guardarDistribucion() {
    if (pctReinversion + pctSeguridad > 100) {
      toast("La suma de los porcentajes no puede superar 100%", "error");
      return;
    }
    setData((d) => ({
      ...d,
      caja_inteligente: { ...d.caja_inteligente, porcentaje_reinversion: pctReinversion, porcentaje_seguridad: pctSeguridad },
    }));
    toast("Distribución de fondos actualizada");
  }

  function exportar() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ricordo_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado");
  }

  function exportarCSV() {
    const hoy = new Date().toISOString().slice(0, 10);
    let csv: string;
    switch (entidadCSV) {
      case "pedidos":
        csv = toCSV(data.pedidos, COLUMNAS_PEDIDOS);
        break;
      case "clientes":
        csv = toCSV(data.clientes, COLUMNAS_CLIENTES);
        break;
      case "productos":
        csv = toCSV(data.productos, COLUMNAS_PRODUCTOS);
        break;
      case "compras":
        csv = toCSV(data.compras, COLUMNAS_COMPRAS);
        break;
      case "ingredientes":
        csv = toCSV(data.ingredientes, COLUMNAS_INGREDIENTES);
        break;
      case "proveedores":
        csv = toCSV(data.proveedores, COLUMNAS_PROVEEDORES);
        break;
    }
    descargarCSV(`ricordo_${entidadCSV}_${hoy}.csv`, csv);
    toast("CSV exportado");
  }

  function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        setData(parsed);
        toast("Datos importados");
      } catch {
        toast("Archivo inválido", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div>
      <PageHeader title="Config" sub="Configuración general del sistema" />

      <Card title="Tipo de cambio" className="mb-4">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Valor ARS/USD">
            <Input type="number" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
          </Field>
          <Field label="Fuente">
            <Input value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="oficial, blue, MEP…" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardarTipoCambio}>Guardar</Button>
        </div>
      </Card>

      <Card title="Distribución de fondos" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Porcentajes de la caja disponible que se reservan para reinversión y seguridad — ver Finanzas → Distribución de fondos.
        </p>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="% Reinversión">
            <Input type="number" min={0} max={100} value={pctReinversion} onChange={(e) => setPctReinversion(Number(e.target.value))} />
          </Field>
          <Field label="% Seguridad">
            <Input type="number" min={0} max={100} value={pctSeguridad} onChange={(e) => setPctSeguridad(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardarDistribucion}>Guardar</Button>
        </div>
      </Card>

      <Card title="Datos generales" className="mb-4">
        <InfoRow label="Clave de almacenamiento" value={STORAGE_KEY} />
        <InfoRow label="Productos" value={data.productos.length} />
        <InfoRow label="Clientes" value={data.clientes.length} />
        <InfoRow label="Pedidos" value={data.pedidos.length} />
        <InfoRow label="Ingredientes" value={data.ingredientes.length} />
      </Card>

      <Card title="Uso de IA" className="mb-4">
        {data.ia_log.length === 0 ? (
          <EmptyState text="Todavía no se hizo ninguna llamada a la IA." />
        ) : (
          <>
            <InfoRow label="Llamadas registradas" value={fNum(data.ia_log.length, 0)} />
            <InfoRow label="Tokens totales (entrada + salida)" value={fNum(totalTokensIa, 0)} />
            <div className="mt-3">
              <TableWrap>
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Función</Th>
                      <Th>Tokens entrada</Th>
                      <Th>Tokens salida</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {iaLogReciente.map((l, i) => (
                      <TrHover key={i}>
                        <Td>{new Date(l.fecha).toLocaleString("es-AR")}</Td>
                        <Td main>{l.funcion}</Td>
                        <Td>{fNum(l.tokens_entrada, 0)}</Td>
                        <Td>{fNum(l.tokens_salida, 0)}</Td>
                      </TrHover>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      <Card title="Exportar a CSV / Excel" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Datos a exportar">
            <Select value={entidadCSV} onChange={(e) => setEntidadCSV(e.target.value as EntidadExportable)}>
              {ENTIDADES_EXPORTABLES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={exportarCSV}>📊 Exportar CSV</Button>
        </div>
      </Card>

      <Card title="Copia de seguridad">
        <div className="flex flex-wrap gap-3">
          <Button onClick={exportar}>💾 Exportar datos</Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            📂 Importar datos
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importar} />
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("¿Vaciar todos los datos? Esta acción no se puede deshacer.")) {
                resetToEmpty();
                toast("Datos vaciados", "info");
              }
            }}
          >
            Vaciar datos
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm("¿Restaurar los datos de ejemplo originales?")) {
                reloadSeed();
                toast("Datos de ejemplo restaurados");
              }
            }}
          >
            Restaurar datos de ejemplo
          </Button>
        </div>
      </Card>
    </div>
  );
}
