import { useStore } from "./store";
import type { RicordoData } from "./types";

type ArrayKeys = {
  [K in keyof RicordoData]: RicordoData[K] extends unknown[] ? K : never;
}[keyof RicordoData];

export function useEntityCrud<T>(
  key: ArrayKeys,
  idField: keyof T & string = "id" as keyof T & string
) {
  const { data, setData } = useStore();
  const items = (data[key] as unknown as T[]) ?? [];

  const add = (item: T) =>
    setData((d) => ({ ...d, [key]: [...(d[key] as unknown as T[]), item] }));

  const update = (id: T[keyof T], patch: Partial<T>) =>
    setData((d) => ({
      ...d,
      [key]: (d[key] as unknown as T[]).map((x) => (x[idField] === id ? { ...x, ...patch } : x)),
    }));

  const remove = (id: T[keyof T]) =>
    setData((d) => ({
      ...d,
      [key]: (d[key] as unknown as T[]).filter((x) => x[idField] !== id),
    }));

  const setAll = (next: T[]) => setData((d) => ({ ...d, [key]: next }));

  return { items, add, update, remove, setAll };
}
