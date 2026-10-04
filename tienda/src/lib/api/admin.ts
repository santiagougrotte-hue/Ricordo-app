import type { AdminApi } from './adminTypes';
import { createAdminDemo } from './adminDemo';
import { createAdminSupabase } from './adminSupabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Este módulo solo lo importa el panel (chunk aparte): supabase-js completo no pesa en la tienda.
export const adminApi: AdminApi = url && key ? createAdminSupabase(url, key) : createAdminDemo();
