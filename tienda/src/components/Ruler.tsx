import { money } from '../lib/money';

/** Regla de cartón: avance hacia la compra mínima y hacia el envío gratis. */
export function Ruler({ subtotal, minOrder, freeFrom }: { subtotal: number; minOrder: number; freeFrom: number | null }) {
  const end = Math.max(freeFrom ?? minOrder, minOrder, 1);
  const pct = Math.min(subtotal / end, 1) * 100;
  const marks = [
    minOrder > 0 && { at: (minOrder / end) * 100, label: 'Mínimo' },
    freeFrom !== null && { at: (freeFrom / end) * 100, label: 'Envío gratis' },
  ].filter(Boolean) as { at: number; label: string }[];
  const desc =
    `Llevás ${money(subtotal)}` +
    (minOrder > 0 ? `; mínimo ${money(minOrder)}` : '') +
    (freeFrom !== null ? `; envío gratis desde ${money(freeFrom)}` : '');
  return (
    <div className="ruler" role="img" aria-label={desc}>
      {marks.map((m) => (
        <span key={m.label} className={'ruler-flag' + (m.at > 80 ? ' end' : '')} style={{ left: `${m.at}%` }}>
          {m.label}
        </span>
      ))}
      <div className="ruler-track">
        <div className="ruler-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
