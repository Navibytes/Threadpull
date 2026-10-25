// Server Supabase client: service-role key, bypasses RLS. Server code only (route handlers, scripts, the agent);
// components/ must never import it (tests/architecture.test.ts). Returns null when the env vars are missing,
// so callers can fall back (files, memory) instead of failing.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function serverClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return client;
}
