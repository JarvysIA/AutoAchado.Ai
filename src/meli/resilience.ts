export interface RetryDecision {
  retry: boolean;
  delayMs: number;
}

export const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

export function retryDecision(
  status: number,
  attempt: number,
  retryAfter: string | null,
  random = Math.random,
): RetryDecision {
  if (!TRANSIENT_STATUSES.has(status) || attempt >= 2) {
    return { retry: false, delayMs: 0 };
  }
  const headerDelay = parseRetryAfter(retryAfter);
  const exponential = 250 * 2 ** attempt;
  const jitter = Math.floor(random() * 100);
  return { retry: true, delayMs: Math.min(headerDelay ?? exponential + jitter, 5_000) };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
