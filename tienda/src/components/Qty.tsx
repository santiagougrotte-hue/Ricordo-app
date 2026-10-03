import { Icon } from './Icon';

export function Qty({ value, max, onChange, name, min = 0 }: { value: number; max: number; onChange: (n: number) => void; name: string; min?: 0 | 1 }) {
  const canRemove = min === 0 && value <= 1;
  return (
    <div className="qty" role="group" aria-label={`Cantidad de ${name}`}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={min === 1 && value <= 1} aria-label={canRemove ? `Sacar ${name}` : `Restar una caja de ${name}`}>
        <Icon name={canRemove ? 'basura' : 'menos'} size={20} />
      </button>
      <output aria-live="polite" aria-label={`${value} cajas`}>{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Sumar una caja de ${name}`}>
        <Icon name="mas" size={20} />
      </button>
    </div>
  );
}
