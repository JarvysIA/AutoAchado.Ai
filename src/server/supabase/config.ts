export const SUPABASE_CONFIG_ERRORS = {
  urlMissing: "CONFIG_SUPABASE_URL_MISSING",
  urlInvalid: "CONFIG_SUPABASE_URL_INVALID",
  secretMissing: "CONFIG_SUPABASE_SECRET_KEY_MISSING",
  secretInvalid: "CONFIG_SUPABASE_SECRET_KEY_INVALID",
} as const;

export interface SupabaseServerConfig {
  url: string;
  secretKey: string;
}

export function loadSupabaseServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): SupabaseServerConfig {
  const rawUrl = env.SUPABASE_URL?.trim();
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (!rawUrl) throw new Error(SUPABASE_CONFIG_ERRORS.urlMissing);
  if (!secretKey) throw new Error(SUPABASE_CONFIG_ERRORS.secretMissing);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(SUPABASE_CONFIG_ERRORS.urlInvalid);
  }
  if (url.protocol !== "https:") throw new Error(SUPABASE_CONFIG_ERRORS.urlInvalid);
  if (!secretKey.startsWith("sb_secret_")) {
    throw new Error(SUPABASE_CONFIG_ERRORS.secretInvalid);
  }
  return { url: url.toString().replace(/\/$/, ""), secretKey };
}
