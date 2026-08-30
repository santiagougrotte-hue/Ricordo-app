"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { cuentasPorCobrar, totalCuentasPorCobrar, aplicarCobroAPedido, sincronizarCajaDePedidos, fARS } from "@/lib/calc";
import { PageHeader, Card, StatGrid, KpiCard, TableWrap, Th, Td, TrHover, EmptyState, Button, Field, Input, Badge } from "@/components/ui";
import { Modal } from "@/components/Modal";

export function CuentasPorCobrar() {
  const { data, setData } = useStore();
  const { toast } = useToast();
  const [cobrarPedidoId, setCobrarPedidoId] = useState<string | null>(null);
  const [cobrarMonto, setCobrarMonto] = useState(0);

  const cuentas = useMemo(() => cuentasPorCobrar(data), [data]);
  const total = useMemo(() => totalCuentasPorCobrar(data), [data]);
  const totalAtrasado = useMemo(
    () => cuentas.filter((c) => (c.diasAtraso ?? 0) > 0).reduce((acc, c) => acc + c.saldo, 0),
    [cuentas]
  );

  function abrirCobrar(idPedido: string, saldo: number) {
    setCobrarPedidoId(idPedido);
    setCobrarMonto(saldo);
  }

  function confirmarCobro() {
    if (!cobrarPedidoId || cobrarMonto <= 0) {
      toast("Ingresá un monto mayor a 0", "error");
      return;
    }
    setData((d) => {
      const pedidos = aplicarCobroAPedido(d.pedidos, cobrarPedidoId, cobrarMonto);
      const lineasDelPedido = pedidos.filter((p) => p.id_pedido === cobrarPedidoId);
      return { ...d, pedidos, caja_movimientos: sincronizarCajaDePedidos(d.caja_movimientos, lineasDelPedido) };
    });
    toast("Cobro registrado");
    setCobrarPedidoId(null);
  }

  return (
    <div>
      <PageHeader title="Cuentas por Cobrar" sub="Pedidos entregados con saldo pendiente de cobro" />

      <StatGrid>
        <KpiCard label="Total adeudado" value={fARS(total)} color={total > 0 ? "red" : "green"} />
        <KpiCard label="Vencido" value={fARS(totalAtrasado)} color={totalAtrasado > 0 ? "red" : "green"} />
        <KpiCard label="Pedidos con saldo" value={String(cuentas.length)} />
      </StatGrid>

      <Card className="mt-4">
        {cuentas.length === 0 ? (
          <EmptyState text="No hay saldos pendientes — todo cobrado." />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Pedido</Th>
                  <Th>Total</Th>
                  <Th>Pagado</Th>
                  <Th>Saldo</Th>
                  <Th>Vencimiento</Th>
                  <Th>Días de atraso</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => (
                  <TrHover key={c.pedido.id_detalle}>
                    <Td main>
                      <span className="flex items-center gap-1.5">
                        {c.cliente?.nombre ?? "—"}
                        {c.cliente?.canal === "Mayorista" && <Badge color="purple">Mayorista</Badge>}
                      </span>
                    </Td>
                    <Td>
                      {c.pedido.id_pedido} — {c.pedido.nombre_producto}
                    </Td>
                    <Td>{fARS(c.total)}</Td>
                    <Td>{fARS(c.pagado)}</Td>
                    <Td main>{fARS(c.saldo)}</Td>
                    <Td>{c.pedido.fecha_vencimiento ?? "—"}</Td>
                    <Td>
                      {c.diasAtraso === null ? (
                        "—"
                      ) : c.diasAtraso > 0 ? (
                        <Badge color="red">{c.diasAtraso} días</Badge>
                      ) : (
                        <Badge color="green">Al día</Badge>
                      )}
                    </Td>
                    <Td>
                      <Button size="sm" onClick={() => abrirCobrar(c.pedido.id_pedido, c.saldo)}>
                        Cobrar
                      </Button>
                    </Td>
                  </TrHover>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Modal
        open={cobrarPedidoId !== null}
        onClose={() => setCobrarPedidoId(null)}
        title="Cobrar pedido"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCobrarPedidoId(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarCobro}>Registrar cobro</Button>
          </>
        }
      >
        <Field label="Monto cobrado ahora">
          <Input type="number" value={cobrarMonto} onChange={(e) => setCobrarMonto(Number(e.target.value))} />
        </Field>
      </Modal>
    </div>
  );
}
