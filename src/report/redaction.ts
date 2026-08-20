const SENSITIVE_KEYS = /^(?:access_token|refresh_token|client_secret|code|code_verifier|authorization|cookie|session_secret|supabase_secret_key|apikey)$/i;

export function redactText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "[REDACTED_AUTHORIZATION]")
    .replace(/\bAPP_USR-[A-Za-z0-9-]+\b/g, "[REDACTED_ACCESS_TOKEN]")
    .replace(/\bTG-[A-Za-z0-9-]+\b/g, "[REDACTED_REFRESH_TOKEN]")
    .replace(/\bsb_secret_[A-Za-z0-9._-]+\b/gi, "[REDACTED_SUPABASE_SECRET]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/((?:access_token|refresh_token|client_secret|code_verifier|session_secret|supabase_secret_key|apikey)["'=:\s]+)[^\s&,}\"]+/gi, "$1[REDACTED]");
}

export function sanitizeForReport(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(sanitizeForReport);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SENSITIVE_KEYS.test(key))
        .map(([key, child]) => [key, sanitizeForReport(child)]),
    );
  }
  return value;
}

export function reportContainsSecret(report: string, knownSecrets: string[] = []): boolean {
  const patterns = [/Bearer\s+\S+/i, /\bAPP_USR-\S+/i, /\bTG-\S+/i, /\bsb_secret_\S+/i, /postgres(?:ql)?:\/\/\S+/i, /"(?:access_token|refresh_token|client_secret|code_verifier|supabase_secret_key|apikey)"\s*:/i];
  return patterns.some((pattern) => pattern.test(report)) || knownSecrets.filter(Boolean).some((secret) => report.includes(secret));
}
