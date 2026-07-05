import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "PASTE_SUPABASE_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_SUPABASE_ANON_KEY_HERE";

export const isSupabaseConfigured = SUPABASE_URL !== "PASTE_SUPABASE_URL_HERE" && SUPABASE_ANON_KEY !== "PASTE_SUPABASE_ANON_KEY_HERE";

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false
      }
    })
  : null;
