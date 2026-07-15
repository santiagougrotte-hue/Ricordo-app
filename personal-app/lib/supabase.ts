import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether Supabase is configured. When false, the app runs in local-only
 * mode (localStorage only, no auth gate, no cross-device sync). */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured ? createClient(url!, anonKey!) : null;
