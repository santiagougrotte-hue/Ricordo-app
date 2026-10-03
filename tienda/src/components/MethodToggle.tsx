import { useStore } from '../state/store';
import { Icon } from './Icon';

export function MethodToggle() {
  const { method, setMethod, settings } = useStore();
  if (!settings?.pickupEnabled) return null;
  return (
    <fieldset className="method">
      <legend className="sr">¿Cómo lo recibís?</legend>
      <label className={method === 'delivery' ? 'on' : ''}>
        <input type="radio" name="method" checked={method === 'delivery'} onChange={() => setMethod('delivery')} />
        <Icon name="moto" size={20} /> Te lo llevamos
      </label>
      <label className={method === 'pickup' ? 'on' : ''}>
        <input type="radio" name="method" checked={method === 'pickup'} onChange={() => setMethod('pickup')} />
        <Icon name="local" size={20} /> Lo retiro
      </label>
    </fieldset>
  );
}
