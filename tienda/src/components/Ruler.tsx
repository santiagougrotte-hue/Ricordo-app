/** Regla de cartón: avance en cajas hacia el mínimo, el envío gratis y el tope de descuento. */
export function Ruler({ boxes, min, free, maxDiscountAt }: { boxes: number; min: number; free: number | null; maxDiscountAt: number | null }) {
  const end = Math.max(maxDiscountAt ?? 0, free ?? 0, min, 1);
  const pct = Math.min(boxes / end, 1) * 100;
  const marks = [
    min > 0 && { at: min, label: 'Mínimo' },
    free !== null && { at: free, label: 'Envío gratis' },
    maxDiscountAt !== null && { at: maxDiscountAt, label: 'Máx. descuento' },
  ].filter(Boolean) as { at: number; label: string }[];
  const cajas = (n: number) => `${n} ${n === 1 ? 'caja' : 'cajas'}`;
  const desc = `Llevás ${cajas(boxes)}` + marks.map((m) => `; ${m.label.toLowerCase()}: ${cajas(m.at)}`).join('');
  return (
    <div className="ruler" role="img" aria-label={desc}>
      {marks.map((m, i) => {
        const at = (m.at / end) * 100;
        // Si dos marcas quedan muy juntas, la segunda va abajo.
        const low = i > 0 && at - (marks[i - 1].at / end) * 100 < 22;
        return (
          <span key={m.label} className={'ruler-flag' + (at > 80 ? ' end' : '') + (low ? ' under' : '')} style={{ left: `${at}%` }}>
            {m.label}
          </span>
        );
      })}
      <div className="ruler-track">
        <div className="ruler-fill" style={{ width: `${pct}%` }} />
        {Array.from({ length: end - 1 }, (_, i) => <span key={i} className="ruler-tick" style={{ left: `${((i + 1) / end) * 100}%` }} aria-hidden="true" />)}
      </div>
    </div>
  );
}
