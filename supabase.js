import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://psnjoztbtdkoryopyynw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_GBfDqt98lx-nlo56B7Wkeg_RbRLluNq";

export const isSupabaseConfigured =
  SUPABASE_ANON_KEY !== "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    })
  : null;