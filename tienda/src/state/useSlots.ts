import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DeliveryMethod, DeliverySlot } from '../lib/types';

export function useSlots(method: DeliveryMethod) {
  const [slots, setSlots] = useState<DeliverySlot[] | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSlots(await api.listSlots(method));
    } catch {
      setSlots([]);
    }
  }, [method]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { slots, refresh };
}
