"use client";

import React, { useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { STORAGE_KEY } from "@/lib/types";
import { fNum } from "@/lib/calc";
import { migrarAV2, type ReporteMigracion } from "@/lib/migration/v2";
import { Card, PageHeader, Field, Input, Button, InfoRow, TableWrap, Th, Td, TrHover, EmptyState, Badge } from "@/components/ui";

export function Config() {
  const { data, setData, resetToEmpty, reloadSeed } = useStore();
  const { toast } = useToast();
  const [valor, setValor] = useState(data.tipo_cambio.valor);
  const [fuente, setFuente] = useState(data.tipo_cambio.fuente);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reporteV2, setReporteV2] = useState<ReporteMigracion | null>(null);

  function generarReporteV2() {
    const { reporte } = migrarAV2(data);
    setReporteV2(reporte);
  }

  const totalTokensIa = useMemo(
    () => data.ia_log.reduce((acc, l) => acc + l.tokens_entrada + l.tokens_salida, 0),
    [data.ia_log]
  );
  const iaLogReciente = useMemo(() => [...data.ia_log].reverse().slice(0, 20), [data.ia_log]);

  function guardarTipoCambio() {
    setData((d) => ({ ...d, tipo_cambio: { valor, fuente } }));
    toast("Tipo de cambio actualizado");
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

      <Card title="Migración a esquema V2" className="mb-4">
        <p className="mb-3 text-[12.5px] text-text3">
          Genera una vista previa de cómo quedarían tus datos con el esquema nuevo (productos con
          variantes, un solo libro de inventario, finanzas unificadas). No guarda nada — corre
          sobre los datos actuales y solo muestra el resultado.
        </p>
        <div className="mb-3">
          <Button onClick={generarReporteV2}>Generar reporte de migración</Button>
        </div>
        {reporteV2 && <ReporteMigracionVista reporte={reporteV2} />}
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

function ReporteMigracionVista({ reporte }: { reporte: ReporteMigracion }) {
  const secciones = Object.entries(reporte.conteos);
  return (
    <div>
      <TableWrap>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Sección</Th>
              <Th>Migrados</Th>
              <Th>Fusionados</Th>
            </tr>
          </thead>
          <tbody>
            {secciones.map(([seccion, { migrados, fusionados }]) => (
              <TrHover key={seccion}>
                <Td main>{seccion}</Td>
                <Td>{fNum(migrados, 0)}</Td>
                <Td>{fusionados > 0 ? fNum(fusionados, 0) : "—"}</Td>
              </TrHover>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <ListaRevision titulo="Conflictos (dos fuentes no coinciden)" color="red" items={reporte.conflictos} />
      <ListaRevision titulo="Referencias faltantes" color="orange" items={reporte.referencias_faltantes} />
      <ListaRevision titulo="Revisión manual" color="purple" items={reporte.revision_manual} />
    </div>
  );
}

function ListaRevision({
  titulo,
  color,
  items,
}: {
  titulo: string;
  color: "red" | "orange" | "purple";
  items: ReporteMigracion["conflictos"];
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-text2">{titulo}</span>
        <Badge color={items.length === 0 ? "green" : color}>{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <EmptyState text="Sin casos." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-surface2/40 p-2.5 text-[12.5px] text-text2">
              {item.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
