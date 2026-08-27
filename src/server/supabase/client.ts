import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadSupabaseServerConfig, type SupabaseServerConfig } from "./config.js";

export const SUPABASE_REQUEST_TIMEOUT = "SUPABASE_REQUEST_TIMEOUT";
export const SUPABASE_REQUEST_ABORTED = "SUPABASE_REQUEST_ABORTED";

export interface SupabaseServerClientOptions {
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export function createSupabaseTimeoutFetch(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("CONFIG_SUPABASE_TIMEOUT_INVALID");
  }
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw new Error(SUPABASE_REQUEST_ABORTED);
    const controller = new AbortController();
    let timedOut = false;
    const upstreamSignal = init?.signal;
    const abortFromUpstream = (): void => controller.abort();
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch {
      throw new Error(timedOut ? SUPABASE_REQUEST_TIMEOUT : SUPABASE_REQUEST_ABORTED);
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    }
  };
}

export function createSupabaseServerClient(
  config: SupabaseServerConfig,
  options: SupabaseServerClientOptions = {},
): SupabaseClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return createClient(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(options.timeoutMs === undefined && options.fetchImpl === undefined
      ? {}
      : { global: { fetch: options.timeoutMs === undefined ? fetchImpl : createSupabaseTimeoutFetch(fetchImpl, options.timeoutMs) } }),
  });
}

let cachedClient: SupabaseClient | undefined;

export function getSupabaseServerClient(): SupabaseClient {
  cachedClient ??= createSupabaseServerClient(loadSupabaseServerConfig());
  return cachedClient;
}
