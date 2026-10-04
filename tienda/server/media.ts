// Fotos y videos de productos: Netlify Blobs (store "product-media"), servidos en /media/<clave>.
export interface MediaStore {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export async function netlifyMedia(): Promise<MediaStore> {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name: 'product-media', consistency: 'strong' });
  return {
    async put(key, data, contentType) {
      await store.set(key, data, { metadata: { contentType } });
    },
    async get(key) {
      const r = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!r) return null;
      return { data: r.data as ArrayBuffer, contentType: String(r.metadata?.contentType ?? 'application/octet-stream') };
    },
    async delete(key) {
      await store.delete(key);
    },
  };
}

export function memoryMedia(): MediaStore & { keys: () => string[] } {
  const m = new Map<string, { data: ArrayBuffer; contentType: string }>();
  return {
    async put(k, data, contentType) { m.set(k, { data, contentType }); },
    async get(k) { return m.get(k) ?? null; },
    async delete(k) { m.delete(k); },
    keys: () => [...m.keys()],
  };
}
