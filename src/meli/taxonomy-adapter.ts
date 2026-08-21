import { gunzipSync } from "node:zlib";
import { MELI_API_ORIGIN } from "./endpoints.js";
import { parseRetryAfter } from "./resilience.js";
import type { MarketplaceTaxonomyAdapter } from "../taxonomy/adapter.js";
import {
  TaxonomyError,
  taxonomyInvalidResponse,
  withTaxonomyErrorDetails,
  type TaxonomySafeErrorDetails,
} from "../taxonomy/errors.js";
import { calculateInternalChecksum, parseCategoryDetail, parseMeliCategoryTree, parseSiteCategories } from "../taxonomy/parser.js";
import { TaxonomyTree } from "../taxonomy/tree.js";
import {
  MARKETPLACE_MERCADO_LIVRE,
  type CategoryDetail,
  type SiteCategory,
  type TaxonomyCategoryNode,
  type TaxonomyResponseDiagnostics,
  type TaxonomyTopLevelKind,
  type TaxonomyTreeEnvelope,
} from "../taxonomy/types.js";

export const AUTOMOTIVE_ROOT_CATEGORY_ID = "MLB5672";

export const TAXONOMY_LIMITS = Object.freeze({
  maxCompressedBytes: 64 * 1024 * 1024,
  maxProcessedBytes: 256 * 1024 * 1024,
  maxNodes: 100_000,
  maxDepth: 64,
  pointTimeoutMs: 10_000,
  dumpTimeoutMs: 60_000,
  maxAttempts: 3,
});

interface TaxonomyLimits {
  maxCompressedBytes: number;
  maxProcessedBytes: number;
  maxNodes: number;
  maxDepth: number;
  pointTimeoutMs: number;
  dumpTimeoutMs: number;
  maxAttempts: number;
}

export interface MeliTaxonomyAdapterOptions {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  randomImpl?: () => number;
  clock?: () => Date;
  limits?: Partial<TaxonomyLimits>;
}

type TaxonomyOperation = "LIST_SITE_CATEGORIES" | "FETCH_CATEGORY" | "FETCH_CATEGORY_TREE";

interface TaxonomyHttpResult {
  payload: unknown;
  headers: Readonly<Record<string, string>>;
  diagnostics: Readonly<TaxonomyResponseDiagnostics>;
}

interface BodyReadResult {
  bytes: Buffer;
  transportBytes: number;
  processedBytes: number;
  bodyHadGzipMagic: boolean;
}

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const SAFE_RESPONSE_HEADERS = ["x-content-created", "x-content-md5", "etag", "last-modified"] as const;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertMlbSite(siteId: string): "MLB" {
  if (siteId !== "MLB") {
    throw new TaxonomyError("TAXONOMY_UNSUPPORTED_SITE", "Site de taxonomia não suportado");
  }
  return siteId;
}

function assertMlbCategoryId(categoryId: string): string {
  if (!/^MLB\d+$/.test(categoryId)) {
    throw new TaxonomyError("TAXONOMY_INVALID_RESPONSE", "ID de categoria inválido");
  }
  return categoryId;
}

function taxonomyUrl(path: string): URL {
  const url = new URL(path, MELI_API_ORIGIN);
  if (url.origin !== MELI_API_ORIGIN) {
    throw new TaxonomyError("TAXONOMY_HTTP_ERROR", "Destino de taxonomia não permitido");
  }
  const allowed = /^\/sites\/MLB\/categories(?:\/all)?$/.test(url.pathname)
    || /^\/categories\/MLB\d+$/.test(url.pathname);
  if (!allowed || url.search || url.hash) {
    throw new TaxonomyError("TAXONOMY_HTTP_ERROR", "Endpoint de taxonomia não permitido");
  }
  return url;
}

function validateFinalResponseUrl(response: Response): void {
  if (!response.url) return;
  const finalUrl = new URL(response.url);
  if (finalUrl.origin !== MELI_API_ORIGIN) {
    throw new TaxonomyError("TAXONOMY_HTTP_ERROR", "Redirect de taxonomia não permitido");
  }
}

function safeHeaders(headers: Headers): Readonly<Record<string, string>> {
  const selected: Record<string, string> = {};
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null && value.length <= 512 && /^[\x20-\x7E]+$/.test(value)) selected[name] = value;
  }
  return Object.freeze(selected);
}

function isJsonContentType(value: string | null): boolean {
  return value !== null && /^application\/json(?:\s*;\s*charset=[^;\s]+)?$/i.test(value.trim());
}

function safeDiagnosticHeader(value: string | null): string | null {
  if (value === null) return null;
  if (value.length > 128 || !/^[\x20-\x7E]+$/.test(value)) return "[INVALID_OR_TOO_LONG]";
  if (/Bearer\s+|APP_USR-|\bTG-|sb_secret_|postgres(?:ql)?:\/\/|access_token|refresh_token|client_secret|authorization|cookie|supabase_secret_key|apikey/i.test(value)) {
    return "[REDACTED]";
  }
  return value;
}

function numericContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function getTopLevelKind(value: unknown): TaxonomyTopLevelKind {
  if (value === null) return "NULL";
  if (Array.isArray(value)) return "ARRAY";
  if (typeof value === "object") return "OBJECT";
  if (typeof value === "string") return "STRING";
  if (typeof value === "number") return "NUMBER";
  if (typeof value === "boolean") return "BOOLEAN";
  return "OTHER";
}

function responseDiagnostics(details: Partial<TaxonomySafeErrorDetails>): Readonly<TaxonomyResponseDiagnostics> {
  return Object.freeze({
    status: details.status ?? null,
    operation: details.operation ?? null,
    contentType: details.contentType ?? null,
    contentEncoding: details.contentEncoding ?? null,
    contentLength: details.contentLength ?? null,
    transportBytes: details.transportBytes ?? null,
    processedBytes: details.processedBytes ?? null,
    bodyHadGzipMagic: details.bodyHadGzipMagic ?? null,
    topLevelKind: details.topLevelKind ?? null,
    topLevelArrayLength: details.topLevelArrayLength ?? null,
    topLevelObjectKeyCount: details.topLevelObjectKeyCount ?? null,
  });
}

function isGzip(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function readLimitedBody(response: Response, limits: TaxonomyLimits): Promise<BodyReadResult> {
  const contentLength = response.headers.get("content-length");
  const contentEncoding = response.headers.get("content-encoding")?.toLowerCase() ?? null;
  if (contentLength !== null) {
    const declared = Number(contentLength);
    const declaredLimit = contentEncoding === "gzip" ? limits.maxCompressedBytes : limits.maxProcessedBytes;
    if (Number.isFinite(declared) && declared > declaredLimit) {
      throw new TaxonomyError("TAXONOMY_RESPONSE_TOO_LARGE", "Resposta de taxonomia excede o limite");
    }
  }
  if (!response.body) {
    throw taxonomyInvalidResponse("EMPTY_BODY", {
      transportBytes: 0,
      processedBytes: 0,
      bodyHadGzipMagic: false,
    });
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  let gzipBytes = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = Buffer.from(result.value);
      chunks.push(chunk);
      received += chunk.byteLength;
      if (received >= 2 && chunks.length > 0) gzipBytes = isGzip(Buffer.concat(chunks, Math.min(received, 2)));
      const activeLimit = gzipBytes ? limits.maxCompressedBytes : limits.maxProcessedBytes;
      if (received > activeLimit) {
        await reader.cancel();
        throw new TaxonomyError("TAXONOMY_RESPONSE_TOO_LARGE", "Resposta de taxonomia excede o limite");
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (received === 0) {
    throw taxonomyInvalidResponse("EMPTY_BODY", {
      transportBytes: 0,
      processedBytes: 0,
      bodyHadGzipMagic: false,
    });
  }
  const receivedBody = Buffer.concat(chunks, received);
  if (!isGzip(receivedBody)) {
    return {
      bytes: receivedBody,
      transportBytes: received,
      processedBytes: received,
      bodyHadGzipMagic: false,
    };
  }
  try {
    const processedBody = gunzipSync(receivedBody, { maxOutputLength: limits.maxProcessedBytes });
    return {
      bytes: processedBody,
      transportBytes: received,
      processedBytes: processedBody.byteLength,
      bodyHadGzipMagic: true,
    };
  } catch (error) {
    if (error instanceof TaxonomyError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/larger than|buffer too large|output length/i.test(message)) {
      throw new TaxonomyError("TAXONOMY_RESPONSE_TOO_LARGE", "Resposta de taxonomia excede o limite");
    }
    throw taxonomyInvalidResponse("GZIP_INVALID", {
      transportBytes: received,
      processedBytes: null,
      bodyHadGzipMagic: true,
    });
  }
}

function parseJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw taxonomyInvalidResponse("JSON_INVALID", { processedBytes: bytes.byteLength });
  }
}

function retryDelay(attempt: number, retryAfter: string | null, random: () => number): number {
  const fromHeader = parseRetryAfter(retryAfter);
  const exponentialWithJitter = 250 * 2 ** attempt + Math.floor(random() * 100);
  return Math.min(fromHeader ?? exponentialWithJitter, 5_000);
}

export class MeliTaxonomyAdapter implements MarketplaceTaxonomyAdapter {
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly sleepImpl: (milliseconds: number) => Promise<void>;
  private readonly randomImpl: () => number;
  private readonly clock: () => Date;
  private readonly limits: TaxonomyLimits;

  constructor(options: MeliTaxonomyAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.getAccessToken = options.getAccessToken ?? (async () => null);
    this.sleepImpl = options.sleepImpl ?? sleep;
    this.randomImpl = options.randomImpl ?? Math.random;
    this.clock = options.clock ?? (() => new Date());
    this.limits = Object.freeze({ ...TAXONOMY_LIMITS, ...options.limits });
  }

  private async request(path: string, operation: TaxonomyOperation, timeoutMs: number): Promise<TaxonomyHttpResult> {
    const url = taxonomyUrl(path);
    for (let attempt = 0; attempt < this.limits.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const accessToken = await this.getAccessToken();
        const headers = new Headers({
          Accept: "application/json",
          "User-Agent": "AutoAchado.AI/Taxonomy-0B3B1",
        });
        if (accessToken !== null) {
          if (accessToken.length === 0) throw new TaxonomyError("TAXONOMY_INVALID_RESPONSE", "Provider de autenticação inválido");
          headers.set("Authorization", `Bearer ${accessToken}`);
        }
        const response = await this.fetchImpl(url, {
          method: "GET",
          headers,
          signal: controller.signal,
          redirect: "manual",
        });
        validateFinalResponseUrl(response);

        if (TRANSIENT_STATUS.has(response.status) && attempt + 1 < this.limits.maxAttempts) {
          await response.body?.cancel();
          await this.sleepImpl(retryDelay(attempt, response.headers.get("retry-after"), this.randomImpl));
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) {
            throw new TaxonomyError("TAXONOMY_RATE_LIMITED", "Limite da API de taxonomia atingido", {
              status: response.status,
              operation,
              retryable: true,
            });
          }
          throw new TaxonomyError("TAXONOMY_HTTP_ERROR", `API de taxonomia respondeu HTTP ${response.status}`, {
            status: response.status,
            operation,
            retryable: TRANSIENT_STATUS.has(response.status),
          });
        }
        const diagnosticBase: Partial<TaxonomySafeErrorDetails> = {
          status: response.status,
          operation,
          contentType: safeDiagnosticHeader(response.headers.get("content-type")),
          contentEncoding: safeDiagnosticHeader(response.headers.get("content-encoding")),
          contentLength: numericContentLength(response.headers.get("content-length")),
        };
        if (!isJsonContentType(response.headers.get("content-type"))) {
          await response.body?.cancel();
          throw taxonomyInvalidResponse("CONTENT_TYPE_INVALID", diagnosticBase);
        }
        const contentEncoding = response.headers.get("content-encoding")?.toLowerCase() ?? null;
        if (contentEncoding !== null && contentEncoding !== "identity" && contentEncoding !== "gzip") {
          await response.body?.cancel();
          throw taxonomyInvalidResponse("CONTENT_ENCODING_INVALID", diagnosticBase);
        }
        let body: BodyReadResult;
        try {
          body = await readLimitedBody(response, this.limits);
        } catch (error) {
          if (error instanceof TaxonomyError) throw withTaxonomyErrorDetails(error, diagnosticBase);
          throw error;
        }
        const bodyDiagnostics: Partial<TaxonomySafeErrorDetails> = {
          ...diagnosticBase,
          transportBytes: body.transportBytes,
          processedBytes: body.processedBytes,
          bodyHadGzipMagic: body.bodyHadGzipMagic,
        };
        let payload: unknown;
        try {
          payload = parseJson(body.bytes);
        } catch (error) {
          if (error instanceof TaxonomyError) throw withTaxonomyErrorDetails(error, bodyDiagnostics);
          throw error;
        }
        const topLevelKind = getTopLevelKind(payload);
        const completeDiagnostics: Partial<TaxonomySafeErrorDetails> = {
          ...bodyDiagnostics,
          topLevelKind,
          topLevelArrayLength: topLevelKind === "ARRAY" ? (payload as unknown[]).length : null,
          topLevelObjectKeyCount: topLevelKind === "OBJECT" ? Object.keys(payload as Record<string, unknown>).length : null,
        };
        return {
          payload,
          headers: safeHeaders(response.headers),
          diagnostics: responseDiagnostics(completeDiagnostics),
        };
      } catch (error) {
        if (error instanceof TaxonomyError) throw error;
        const timedOut = error instanceof Error && error.name === "AbortError";
        if (attempt + 1 < this.limits.maxAttempts) {
          await this.sleepImpl(retryDelay(attempt, null, this.randomImpl));
          continue;
        }
        throw new TaxonomyError(
          timedOut ? "TAXONOMY_TIMEOUT" : "TAXONOMY_HTTP_ERROR",
          timedOut ? "Timeout na API de taxonomia" : "Falha transitória na API de taxonomia",
          { operation, retryable: true },
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new TaxonomyError("TAXONOMY_HTTP_ERROR", "Falha inesperada na API de taxonomia", { operation });
  }

  async listSiteCategories(siteId: string): Promise<readonly SiteCategory[]> {
    const supportedSite = assertMlbSite(siteId);
    const response = await this.request(`/sites/${supportedSite}/categories`, "LIST_SITE_CATEGORIES", this.limits.pointTimeoutMs);
    try {
      return parseSiteCategories(response.payload, supportedSite);
    } catch (error) {
      if (error instanceof TaxonomyError) throw withTaxonomyErrorDetails(error, response.diagnostics);
      throw error;
    }
  }

  async fetchCategory(categoryId: string): Promise<CategoryDetail> {
    const validCategoryId = assertMlbCategoryId(categoryId);
    const response = await this.request(`/categories/${validCategoryId}`, "FETCH_CATEGORY", this.limits.pointTimeoutMs);
    try {
      const detail = parseCategoryDetail(response.payload, "MLB");
      if (detail.externalCategoryId !== validCategoryId) {
        throw taxonomyInvalidResponse("CATEGORY_SHAPE_INVALID");
      }
      return detail;
    } catch (error) {
      if (error instanceof TaxonomyError) throw withTaxonomyErrorDetails(error, response.diagnostics);
      throw error;
    }
  }

  async fetchCategoryTree(siteId: string): Promise<TaxonomyTreeEnvelope> {
    const supportedSite = assertMlbSite(siteId);
    const response = await this.request(`/sites/${supportedSite}/categories/all`, "FETCH_CATEGORY_TREE", this.limits.dumpTimeoutMs);
    let nodes: readonly TaxonomyCategoryNode[];
    try {
      nodes = parseMeliCategoryTree(response.payload, supportedSite, {
        maxNodes: this.limits.maxNodes,
        maxDepth: this.limits.maxDepth,
      });
      new TaxonomyTree(nodes, {
        maxNodes: this.limits.maxNodes,
        maxDepth: this.limits.maxDepth,
        requiredRootId: AUTOMOTIVE_ROOT_CATEGORY_ID,
      });
    } catch (error) {
      if (error instanceof TaxonomyError) throw withTaxonomyErrorDetails(error, response.diagnostics);
      throw error;
    }
    const internalChecksum = calculateInternalChecksum(nodes);
    return Object.freeze({
      marketplaceKey: MARKETPLACE_MERCADO_LIVRE,
      siteId: supportedSite,
      sourceVersion: `sha256:${internalChecksum}`,
      sourceContentCreated: response.headers["x-content-created"] ?? null,
      sourceContentMd5: response.headers["x-content-md5"] ?? null,
      internalChecksum,
      fetchedAt: this.clock().toISOString(),
      nodes,
      responseDiagnostics: response.diagnostics,
    });
  }
}
