// server-only admin client (do NOT import in client components)
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // service role key; never expose to browser
  { auth: { persistSession: false } }
);
