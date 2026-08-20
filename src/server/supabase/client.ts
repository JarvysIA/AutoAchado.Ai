import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseServerConfig, type SupabaseServerConfig } from "./config.js";

export function createSupabaseServerClient(config: SupabaseServerConfig): SupabaseClient {
  return createClient(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let cachedClient: SupabaseClient | undefined;

export function getSupabaseServerClient(): SupabaseClient {
  cachedClient ??= createSupabaseServerClient(loadSupabaseServerConfig());
  return cachedClient;
}
