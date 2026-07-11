import { createClient } from "https://esm.sh/@supabase/supabase-js";


export const isSupabaseConfigured =
  SUPABASE_ANON_KEY !== "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    })
  : null;