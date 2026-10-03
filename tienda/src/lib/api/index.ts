import type { StoreApi } from './types';
import { createDemoApi } from './demo';
import { createSupabaseApi } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Sin variables de Supabase la tienda corre en modo demo con datos de ejemplo. */
export const api: StoreApi = url && key ? createSupabaseApi(url, key) : createDemoApi();
