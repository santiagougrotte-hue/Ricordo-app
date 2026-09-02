"use client";

import React, { useMemo, useRef, useState } from "react";
import { useStoreV2 } from "@/lib/store-v2";
import { useToast } from "@/lib/toast";
import { uid } from "@/lib/id";
import {
  PageHeader,
  Card,
  Button,
  FilterTabs,
  FormGrid,
  Field,
  Input,
  TableWrap,
  Th,
  Td,
  TrHover,
  EmptyState,
  Badge,
  InfoRow,
} from "@/components/ui";
import { fNum } from "@/lib/calc-v2";
import type { AmbitoCategoria, RicordoDocument } from "@/lib/types-v2";

function GeneralTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [tc, setTc] = useState(data.configuracion.tipo_cambio);

  function guardarTipoCambio() {
    setData((d) => ({ ...d, configuracion: { ...d.configuracion, tipo_cambio: tc } }));
    toast("Tipo de cambio actualizado");
  }

  function setUmbral<K extends keyof typeof data.configuracion>(key: K, value: (typeof data.configuracion)[K]) {
    setData((d) => ({ ...d, configuracion: { ...d.configuracion, [key]: value } }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Tipo de cambio">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field label="Valor ARS/USD">
            <Input type="number" value={tc.valor} onChange={(e) => setTc({ ...tc, valor: Number(e.target.value) })} />
          </Field>
          <Field label="Fuente">
            <Input value={tc.fuente} onChange={(e) => setTc({ ...tc, fuente: e.target.value })} placeholder="oficial, blue, MEP…" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={guardarTipoCambio}>Guardar</Button>
        </div>
      </Card>

      <Card title="Caja">
        <p className="mb-3 text-[12.5px] text-text3">
          Punto de partida del Flujo de caja (Finanzas → Tesorería → Flujo y proyección) antes de sumar cualquier
          movimiento — no es un ingreso ni un gasto, y nunca debería usarse para forzar el saldo con un movimiento
          artificial (para eso está &ldquo;Ajuste de saldo&rdquo; en Tesorería → Caja).
        </p>
        <Field label="Saldo inicial de caja">
          <Input
            type="number"
            value={data.configuracion.saldo_inicial_caja}
            onChange={(e) => setUmbral("saldo_inicial_caja", Number(e.target.value))}
          />
        </Field>
      </Card>

      <Card title="Umbrales de alerta">
        <FormGrid>
          <Field label="Stock bajo de producto">
            <Input
              type="number"
              value={data.configuracion.umbral_stock_bajo_producto}
              onChange={(e) => setUmbral("umbral_stock_bajo_producto", Number(e.target.value))}
            />
          </Field>
          <Field label="Días de riesgo mayorista">
            <Input
              type="number"
              value={data.configuracion.umbral_dias_mayorista_riesgo}
              onChange={(e) => setUmbral("umbral_dias_mayorista_riesgo", Number(e.target.value))}
            />
          </Field>
          <Field label="Compras/consumo — amarillo %">
            <Input
              type="number"
              value={data.configuracion.umbral_compras_consumo_amber}
              onChange={(e) => setUmbral("umbral_compras_consumo_amber", Number(e.target.value))}
            />
          </Field>
          <Field label="Compras/consumo — rojo %">
            <Input
              type="number"
              value={data.configuracion.umbral_compras_consumo_red}
              onChange={(e) => setUmbral("umbral_compras_consumo_red", Number(e.target.value))}
            />
          </Field>
        </FormGrid>
      </Card>

      <Card title="Envíos">
        <FormGrid>
          <Field label="Precio litro de nafta">
            <Input
              type="number"
              value={data.configuracion.envios.litro_nafta}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, litro_nafta: Number(e.target.value) })}
            />
          </Field>
          <Field label="Consumo cada 100km">
            <Input
              type="number"
              value={data.configuracion.envios.consumo_100km}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, consumo_100km: Number(e.target.value) })}
            />
          </Field>
          <Field label="Km margen gratis">
            <Input
              type="number"
              value={data.configuracion.envios.margen_gratis}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, margen_gratis: Number(e.target.value) })}
            />
          </Field>
          <Field label="Precio de envío fijo">
            <Input
              type="number"
              value={data.configuracion.envios.precio_envio_fijo}
              onChange={(e) => setUmbral("envios", { ...data.configuracion.envios, precio_envio_fijo: Number(e.target.value) })}
            />
          </Field>
        </FormGrid>
      </Card>
    </div>
  );
}

function CategoriasTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const [ambito, setAmbito] = useState<AmbitoCategoria>("producto");
  const [nombre, setNombre] = useState("");

  const filtradas = useMemo(() => data.categorias.filter((c) => c.ambito === ambito), [data.categorias, ambito]);

  function crear() {
    if (!nombre.trim()) {
      toast("El nombre es obligatorio", "error");
      return;
    }
    if (filtradas.some((c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
      toast("Ya existe una categoría con ese nombre", "error");
      return;
    }
    setData((d) => ({ ...d, categorias: [...d.categorias, { id: uid("CAT"), nombre: nombre.trim(), ambito, activo: true }] }));
    setNombre("");
    toast("Categoría creada");
  }

  function alternarActiva(id: string) {
    setData((d) => ({ ...d, categorias: d.categorias.map((c) => (c.id === id ? { ...c, activo: !c.activo } : c)) }));
  }

  return (
    <div>
      <FilterTabs
        value={ambito}
        onChange={(v) => setAmbito(v as AmbitoCategoria)}
        options={[
          { value: "producto", label: "Productos" },
          { value: "insumo", label: "Insumos" },
          { value: "financiero", label: "Financieras" },
        ]}
      />
      <Card>
        <div className="mb-3 flex gap-2">
          <Input placeholder="Nueva categoría…" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Button onClick={crear}>+ Agregar</Button>
        </div>
        {filtradas.length === 0 ? (
          <EmptyState text="No hay categorías en este ámbito." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => (
                  <TrHover key={c.id}>
                    <Td main>{c.nombre}</Td>
                    <Td>
                      <Badge color={c.activo ? "green" : "red"}>{c.activo ? "Activa" : "Inactiva"}</Badge>
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => alternarActiva(c.id)}>
                        {c.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </Td>
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

function MigracionTab() {
  const { data, metadata } = useStoreV2();
  const revision = data.datos_pendientes_revision;
  const legacyClaves = Object.keys(data.legacy ?? {});

  const porSeccion = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of revision) mapa.set(r.seccion, (mapa.get(r.seccion) ?? 0) + 1);
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [revision]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Migración al esquema V2">
        <InfoRow label="Migrado desde esquema" value={`V${metadata.desde_version}`} />
        <InfoRow label="Fecha de migración" value={new Date(metadata.migrado_en).toLocaleString("es-AR")} />
        <InfoRow label="Casos que requieren revisión manual" value={fNum(revision.length, 0)} />
      </Card>

      <Card title="Pendientes de revisión, por sección">
        {porSeccion.length === 0 ? (
          <EmptyState text="No quedaron casos pendientes de revisión." />
        ) : (
          <TableWrap>
            <table className="mb-3 w-full">
              <thead>
                <tr>
                  <Th>Sección</Th>
                  <Th>Casos</Th>
                </tr>
              </thead>
              <tbody>
                {porSeccion.map(([seccion, n]) => (
                  <TrHover key={seccion}>
                    <Td main>{seccion}</Td>
                    <Td>{n}</Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {revision.length > 0 && (
          <ul className="flex flex-col gap-2">
            {revision.slice(0, 50).map((r) => (
              <li key={r.id} className="rounded-md border border-border bg-surface2/40 p-2.5 text-[12.5px] text-text2">
                {r.motivo}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {legacyClaves.length > 0 && (
        <Card title="Datos preservados sin lugar en el esquema nuevo (legacy)">
          <p className="text-[12.5px] text-text3">
            {legacyClaves.join(", ")} — se conservan tal cual estaban, no se muestran en ninguna pantalla porque no tenían uso
            en la app anterior.
          </p>
        </Card>
      )}
    </div>
  );
}

function BackupTab() {
  const { data, setData } = useStoreV2();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  function exportar() {
    const documento: RicordoDocument = { schema_version: 2, metadata: { migrado_en: new Date().toISOString(), desde_version: 1 }, data };
    const blob = new Blob([JSON.stringify(documento, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ricordo_backup_v2_${new Date().toISOString().slice(0, 10)}.json`;
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
        if (parsed?.schema_version === 2 && parsed.data) {
          setData(parsed.data);
          toast("Datos importados");
        } else {
          toast("El archivo no tiene el formato esquema V2 esperado", "error");
        }
      } catch {
        toast("Archivo inválido", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <Card title="Copia de seguridad">
      <p className="mb-3 text-[12.5px] text-text3">
        El backup se guarda en el formato versionado nuevo ({"{"}schema_version: 2{"}"}). Nunca se borra el original: cada
        exportación es un archivo aparte que podés guardar donde quieras.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={exportar}>💾 Exportar datos</Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          📂 Importar datos
        </Button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={importar} />
      </div>
    </Card>
  );
}

export function Configuracion() {
  const [tab, setTab] = useState("general");
  return (
    <div>
      <PageHeader title="Configuración" sub="Parámetros generales, categorías, migración y respaldo" />
      <FilterTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "general", label: "General" },
          { value: "categorias", label: "Categorías" },
          { value: "migracion", label: "Migración" },
          { value: "backup", label: "Backup" },
        ]}
      />
      {tab === "general" && <GeneralTab />}
      {tab === "categorias" && <CategoriasTab />}
      {tab === "migracion" && <MigracionTab />}
      {tab === "backup" && <BackupTab />}
    </div>
  );
}
