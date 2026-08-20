import { assertOfficialApiUrl } from "./endpoints";
import { retryDecision, sleep } from "./resilience";

export interface ApiResponse<T> {
  status: number;
  data: T | null;
  headers: Record<string, string>;
  durationMs: number;
  approximateBytes: number;
}

export interface MeliClientOptions {
  accessToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

const OBSERVED_HEADERS = [
  "etag",
  "last-modified",
  "x-content-created",
  "x-content-md5",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];

export class MeliApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody?: unknown,
  ) {
    super(message);
  }
}

export class MeliClient {
  readonly observedHeaders: Array<Record<string, string>> = [];
  private readonly accessToken: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(options: MeliClientOptions = {}) {
    this.accessToken = options.accessToken;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? sleep;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path, { method: "GET" });
  }

  async getHeadersOnly(path: string): Promise<ApiResponse<null>> {
    return this.request<null>(path, { method: "GET" }, true);
  }

  async request<T>(path: string, init: RequestInit, headersOnly = false): Promise<ApiResponse<T>> {
    const url = assertOfficialApiUrl(path);
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const started = performance.now();
      try {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json");
        headers.set("User-Agent", "AutoAchado-API-Probe/0A-LIVE");
        if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
        const response = await this.fetchImpl(url, { ...init, headers, signal: controller.signal });
        const durationMs = Math.round(performance.now() - started);
        const selectedHeaders = Object.fromEntries(
          OBSERVED_HEADERS.flatMap((name) => {
            const value = response.headers.get(name);
            return value === null ? [] : [[name, value]];
          }),
        );
        if (Object.keys(selectedHeaders).length > 0) this.observedHeaders.push(selectedHeaders);
        const decision = retryDecision(response.status, attempt, response.headers.get("retry-after"));
        if (decision.retry) {
          await response.body?.cancel();
          await this.sleepImpl(decision.delayMs);
          continue;
        }
        if (headersOnly) {
          await response.body?.cancel();
          return { status: response.status, data: null, headers: selectedHeaders, durationMs, approximateBytes: 0 };
        }
        const text = await response.text();
        let data: unknown = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { unparseable_response: true };
          }
        }
        if (!response.ok) {
          throw new MeliApiError(`Mercado Livre respondeu HTTP ${response.status}`, response.status, data);
        }
        return {
          status: response.status,
          data: data as T,
          headers: selectedHeaders,
          durationMs,
          approximateBytes: Buffer.byteLength(text),
        };
      } catch (error) {
        if (error instanceof MeliApiError) throw error;
        if (attempt >= 2) {
          const message = error instanceof Error && error.name === "AbortError" ? "Timeout na API oficial" : "Falha transitória na API oficial";
          throw new MeliApiError(message, 0);
        }
        await this.sleepImpl(250 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new MeliApiError("Falha inesperada", 0);
  }
}
