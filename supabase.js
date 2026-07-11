import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://psnjoztbtdkoryopyynw.supabase.co";
const SUPABASE_ANON_KEY =
  "sb_publishable_GBfDqt98lx-nlo56B7Wkeg_RbRLluNq";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
      },
    })
  : null;