import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { loadConfig, type AppConfig } from "./config.js";
import { sendHtml, redirect } from "./http/responses.js";
import { requestUrl } from "./http/router.js";
import { buildAuthorizationUrl } from "./oauth/client.js";
import { createCodeChallenge, generateCodeVerifier, generateState, isStateFresh, validateState } from "./oauth/pkce.js";
import {
  clearAuthorizationCookie,
  clearOAuthCookie,
  createAuthorizationCookie,
  createOAuthCookie,
  readAuthorizationSession,
  readOAuthTransaction,
} from "./oauth/session.js";
import type { InitialAuthorizationOutcome, InitialAuthorizationService } from "./server/oauth/initial-authorization.js";
import { createMeliInitialAuthorizationService } from "./server/oauth/factory.js";
import { authorizationResultPage, errorPage, homePage } from "./ui/pages.js";
import { dashboardPage } from "./ui/dashboard.js";

type CallbackOutcome = InitialAuthorizationOutcome | "STATE_INVALID" | "PKCE_INVALID";

export interface AppDependencies {
  loadAppConfig(): AppConfig;
  createInitialAuthorizationService(config: AppConfig): Pick<InitialAuthorizationService, "authorize">;
  runConfiguredDiscoveryLiveSmoke(): Promise<unknown>;
  createCorrelationId(): string;
  logDiscoveryLiveEvent(event: Readonly<Record<string, string | number | null>>): void;
}

const DEFAULT_DEPENDENCIES: AppDependencies = {
  loadAppConfig: loadConfig,
  createInitialAuthorizationService: createMeliInitialAuthorizationService,
  runConfiguredDiscoveryLiveSmoke: async () => (
    await import("./server/discovery/live-smoke.js")
  ).runConfiguredDiscoveryLiveSmoke(),
  createCorrelationId: randomUUID,
  logDiscoveryLiveEvent: (event) => console.info(JSON.stringify(event)),
};

const DISCOVERY_LIVE_ROUTE = "/__internal/0b3d-b/live-smoke";
const DISCOVERY_LIVE_HTTP_CONTRACT = "commerce-discovery-live-smoke-http/v1";
const DISCOVERY_LIVE_BODY_LIMIT = 32;
const DISCOVERY_LIVE_RESPONSE_LIMIT = 64 * 1024;

type SafeScalar = string | number | boolean | null;

function sendJson(response: ServerResponse, status: number, value: unknown, correlationId?: string): boolean {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, "utf8") > DISCOVERY_LIVE_RESPONSE_LIMIT) return false;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...(correlationId ? { "X-AutoAchado-Correlation-Id": correlationId } : {}),
  });
  response.end(body);
  return true;
}

function concealedNotFound(response: ServerResponse): void {
  sendHtml(response, 404, errorPage("Não encontrado", "Rota inexistente."));
}

function normalizedHost(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!
    .replace(/:443$/, "").replace(/\.$/, "");
  return normalized.length > 0 ? normalized : null;
}

function mediaType(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

async function readBoundedBody(request: IncomingMessage): Promise<{ body: string; tooLarge: boolean }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > DISCOVERY_LIVE_BODY_LIMIT) return { body: "", tooLarge: true };
    chunks.push(buffer);
  }
  return { body: Buffer.concat(chunks).toString("utf8"), tooLarge: false };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeRecord(value: unknown, keys: readonly string[]): Readonly<Record<string, SafeScalar>> | null {
  const source = record(value);
  if (!source) return null;
  const output: Record<string, SafeScalar> = {};
  for (const key of keys) {
    const entry = source[key];
    if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean" && entry !== null) {
      return null;
    }
    output[key] = entry;
  }
  return Object.freeze(output);
}

const METRIC_KEYS = [
  "eligibleCategories", "selectedCategories", "attemptedCategories", "successfulCategories",
  "failedCategories", "emptyCategories", "notAttemptedCategories", "apiRequests", "retryCount",
  "rawHighlights", "productHighlights", "itemHighlights", "userProductHighlights", "unsupportedHighlights",
  "acceptedCandidates", "uniqueCandidates", "duplicateOccurrences", "rateLimited", "registryReadMs",
  "planningMs", "apiMs", "dedupMs", "persistenceMs", "totalMs",
] as const;

function safeIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return null;
  return Object.freeze(value.slice(0, 10));
}

function sanitizeLiveSmokeResult(value: unknown): Record<string, unknown> | null {
  const source = record(value);
  if (!source) return null;
  const registry = safeRecord(source.registry, ["eligible", "tierA", "tierB", "digest"]);
  const selected = safeRecord(source.selected, ["total", "tierA", "tierB"]);
  const oauth = safeRecord(source.oauth, ["outcome"]);
  const metrics = safeRecord(source.metrics, METRIC_KEYS);
  const timings = safeRecord(source.timings, ["registryReadMs", "planningMs", "oauthMs", "totalMs"]);
  const proof = record(source.persistenceProof);
  const samples = record(source.samples);
  if (!registry || !selected || !oauth || !metrics || !timings || !proof || !samples || !Array.isArray(source.categoryOutcomes)) {
    return null;
  }
  const before = safeRecord(proof.before, ["scan_runs", "highlight_snapshots"]);
  const after = safeRecord(proof.after, ["scan_runs", "highlight_snapshots"]);
  const productIds = safeIds(samples.productIds);
  const itemIds = safeIds(samples.itemIds);
  const userProductIds = safeIds(samples.userProductIds);
  const categoryOutcomes = source.categoryOutcomes.map((outcome) => safeRecord(outcome, [
    "externalCategoryId", "priorityTier", "status", "errorCode", "rawHighlights", "productHighlights",
    "itemHighlights", "userProductHighlights", "unsupportedHighlights", "requestCount", "retryCount", "durationMs",
  ]));
  if (!before || !after || proof.unchanged !== true || !productIds || !itemIds || !userProductIds
    || categoryOutcomes.some((outcome) => outcome === null)) return null;
  if (typeof source.contractVersion !== "string" || (source.status !== "COMPLETED" && source.status !== "COMPLETED_WITH_ERRORS")
    || source.mode !== "SMOKE" || source.persistenceMode !== "DRY_RUN"
    || (source.fatalErrorCode !== null && typeof source.fatalErrorCode !== "string")
    || typeof source.multiCategoryProvenance !== "number") return null;
  return {
    contractVersion: source.contractVersion,
    status: source.status,
    mode: source.mode,
    persistenceMode: source.persistenceMode,
    registry,
    selected,
    oauth,
    fatalErrorCode: source.fatalErrorCode,
    multiCategoryProvenance: source.multiCategoryProvenance,
    categoryOutcomes,
    metrics,
    persistenceProof: { before, after, unchanged: true },
    samples: { productIds, itemIds, userProductIds },
    timings,
  };
}

function liveSmokeHttpOutcome(result: Record<string, unknown>): { status: number; gateStatus: string } {
  const metrics = result.metrics as Record<string, SafeScalar>;
  const fatal = result.fatalErrorCode;
  const strictPass = result.status === "COMPLETED" && metrics.failedCategories === 0
    && metrics.notAttemptedCategories === 0 && fatal === null && metrics.rateLimited === false;
  if (strictPass) return { status: 200, gateStatus: "PASS_0B3D_B_LIMITED_LIVE_DISCOVERY_SMOKE" };
  if (metrics.rateLimited === true || fatal === "DISCOVERY_RATE_LIMIT_STOP") {
    return { status: 429, gateStatus: "PARTIAL_0B3D_B_RATE_LIMIT_STOP" };
  }
  if (fatal === "DISCOVERY_AUTH_FATAL" || fatal === "DISCOVERY_GLOBAL_TRANSPORT_STOP"
    || fatal === "DISCOVERY_ADAPTER_CONTRACT_DRIFT") {
    return { status: 502, gateStatus: "BLOCKED_0B3D_B_LIVE_ADAPTER_FAILURE" };
  }
  return { status: 207, gateStatus: "PARTIAL_0B3D_B_LIVE_SMOKE_CATEGORY_FAILURE" };
}

function safeErrorCode(error: unknown): string {
  const value = record(error)?.code;
  return typeof value === "string" ? value : "DISCOVERY_LIVE_UNEXPECTED";
}

function liveSmokeErrorOutcome(code: string): { status: number; gateStatus: string; errorCode: string } {
  if (code === "DISCOVERY_LIVE_REGISTRY_MISMATCH" || code === "DISCOVERY_LIVE_PLAN_MISMATCH") {
    return { status: 409, gateStatus: "BLOCKED_0B3D_B_LIVE_PLAN_MISMATCH", errorCode: code };
  }
  if (code === "DISCOVERY_LIVE_OPERATION_ALREADY_USED") {
    return { status: 409, gateStatus: "BLOCKED_0B3D_B_LIVE_OPERATION_ALREADY_USED", errorCode: code };
  }
  if (code === "DISCOVERY_LIVE_OAUTH_UNAVAILABLE" || code === "DISCOVERY_LIVE_DEPENDENCY_FAILED") {
    return { status: 503, gateStatus: "BLOCKED_0B3D_B_LIVE_DEPENDENCY_UNAVAILABLE", errorCode: code };
  }
  if (code === "DISCOVERY_LIVE_PERSISTENCE_VIOLATION") {
    return { status: 500, gateStatus: "BLOCKED_0B3D_B_LIVE_PERSISTENCE_VIOLATION", errorCode: code };
  }
  return { status: 500, gateStatus: "BLOCKED_0B3D_B_LIVE_UNEXPECTED", errorCode: "DISCOVERY_LIVE_UNEXPECTED" };
}

const SUCCESS_OUTCOMES = new Set<CallbackOutcome>([
  "AUTHORIZED_AND_STORED",
  "REAUTHORIZED_AND_STORED",
  "AUTHORIZATION_ALREADY_ACTIVE",
]);

function callbackStatus(outcome: CallbackOutcome): number {
  if (SUCCESS_OUTCOMES.has(outcome)) return 200;
  if (outcome === "USER_MISMATCH") return 403;
  if (outcome === "LOCK_BUSY" || outcome === "STATE_NOT_ALLOWED") return 409;
  if (outcome === "STATE_INVALID" || outcome === "PKCE_INVALID" || outcome === "TOKEN_EXCHANGE_FAILED") return 400;
  return 500;
}

function validVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function sendCallbackResult(
  response: ServerResponse,
  outcome: CallbackOutcome,
  cookies: string[],
): void {
  sendHtml(response, callbackStatus(outcome), authorizationResultPage(outcome), { "Set-Cookie": cookies });
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  overrides: Partial<AppDependencies> = {},
): Promise<void> {
  const dependencies: AppDependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const url = requestUrl(request);
  const method = request.method ?? "GET";

  if (["/api/discovery/preview", "/api/discovery/latest-snapshots", "/api/discovery/smoke", "/api/discovery/sweep"].includes(url.pathname)) {
    try {
      const config = dependencies.loadAppConfig();
      const session = readAuthorizationSession(request.headers.cookie, config.sessionSecret);
      if (!session || session.userId !== 296984475) {
        sendJson(response, 401, { errorCode: "AUTHORIZATION_REQUIRED" });
        return;
      }
      const previewing = url.pathname.endsWith("/preview");
      const reading = previewing || url.pathname.endsWith("latest-snapshots");
      if (method !== (reading ? "GET" : "POST")) {
        sendJson(response, 405, { errorCode: "METHOD_NOT_ALLOWED" });
        return;
      }
      if (!reading && request.headers.origin !== new URL(config.redirectUri).origin) {
        sendJson(response, 403, { errorCode: "ORIGIN_NOT_ALLOWED" });
        return;
      }
      const operational = await import("./server/discovery/operational.js");
      if (previewing) {
        const id = url.searchParams.get("id") ?? "";
        const type = url.searchParams.get("type") ?? "";
        if (!(type === "USER_PRODUCT" ? /^MLBU\d{1,20}$/.test(id) : ["ITEM", "PRODUCT"].includes(type) && /^MLB\d{1,20}$/.test(id))) {
          sendJson(response, 400, { errorCode: "INVALID_PREVIEW_ID" });
          return;
        }
        const { configuredProductPreview } = await import("./server/discovery/product-preview.js");
        sendJson(response, 200, await configuredProductPreview(operational.createOperationalDiscoveryAdapter().client, id, type));
        return;
      }
      const result = reading ? await operational.createOperationalDiscoveryAdapter().latestSnapshots()
        : await operational.runConfiguredDiscoveryLiveSmoke(url.pathname.endsWith("sweep") ? "FULL_SWEEP" : "SMOKE");
      sendJson(response, 200, result);
    } catch {
      sendJson(response, 503, { errorCode: "DISCOVERY_OPERATION_FAILED" });
    }
    return;
  }
  if (url.pathname === DISCOVERY_LIVE_ROUTE) {
    if (process.env.VERCEL_ENV !== "production" || process.env.VERCEL_TARGET_ENV !== "production") {
      concealedNotFound(response);
      return;
    }
    const expectedHost = normalizedHost(process.env.VERCEL_URL);
    if (!expectedHost || normalizedHost(request.headers.host) !== expectedHost) {
      concealedNotFound(response);
      return;
    }
    if (method !== "POST") {
      concealedNotFound(response);
      return;
    }
    if (url.searchParams.size !== 0) {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_QUERY_NOT_PERMITTED" });
      return;
    }
    if (mediaType(request.headers["content-type"]) !== "application/json") {
      sendJson(response, 415, { errorCode: "DISCOVERY_LIVE_UNSUPPORTED_MEDIA_TYPE" });
      return;
    }
    if ((request as unknown as { body?: unknown }).body !== undefined) {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_PREPARSED_BODY_PRESENT" });
      return;
    }
    let bounded;
    try {
      bounded = await readBoundedBody(request);
    } catch {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_BODY_READ_FAILED" });
      return;
    }
    if (bounded.tooLarge) {
      sendJson(response, 413, { errorCode: "DISCOVERY_LIVE_BODY_TOO_LARGE" });
      return;
    }
    if (bounded.body.length === 0) {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_BODY_EMPTY" });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bounded.body);
    } catch {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_JSON_PARSE_FAILED" });
      return;
    }
    const recordValue = record(parsed);
    if (!recordValue) {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_BODY_NOT_OBJECT" });
      return;
    }
    if (Object.keys(recordValue).length !== 0) {
      sendJson(response, 400, { errorCode: "DISCOVERY_LIVE_OBJECT_NOT_EMPTY" });
      return;
    }

    const correlationId = dependencies.createCorrelationId();
    const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null;
    const routeStartedAt = performance.now();
    dependencies.logDiscoveryLiveEvent({
      event: "DISCOVERY_LIVE_ROUTE_ACCEPTED",
      correlationId,
      deploymentId,
    });
    try {
      const safeResult = sanitizeLiveSmokeResult(await dependencies.runConfiguredDiscoveryLiveSmoke());
      if (!safeResult) throw new Error("invalid internal contract");
      const outcome = liveSmokeHttpOutcome(safeResult);
      const metrics = safeResult.metrics as Record<string, SafeScalar>;
      const responseBody = {
        contractVersion: DISCOVERY_LIVE_HTTP_CONTRACT,
        correlationId,
        gateStatus: outcome.gateStatus,
        deployment: {
          id: deploymentId,
          url: process.env.VERCEL_URL ?? null,
          region: process.env.VERCEL_REGION ?? null,
        },
        result: safeResult,
      };
      if (!sendJson(response, outcome.status, responseBody, correlationId)) {
        const fallback = liveSmokeErrorOutcome("DISCOVERY_LIVE_RESPONSE_TOO_LARGE");
        sendJson(response, fallback.status, {
          contractVersion: DISCOVERY_LIVE_HTTP_CONTRACT,
          correlationId,
          gateStatus: fallback.gateStatus,
          errorCode: fallback.errorCode,
        }, correlationId);
        dependencies.logDiscoveryLiveEvent({
          event: "DISCOVERY_LIVE_ROUTE_FAILED",
          correlationId,
          deploymentId,
          code: fallback.errorCode,
          durationMs: Math.max(0, Math.round(performance.now() - routeStartedAt)),
        });
        return;
      }
      dependencies.logDiscoveryLiveEvent({
        event: "DISCOVERY_LIVE_ROUTE_COMPLETED",
        correlationId,
        deploymentId,
        status: outcome.gateStatus,
        selectedCount: typeof metrics.selectedCategories === "number" ? metrics.selectedCategories : 0,
        attemptedCount: typeof metrics.attemptedCategories === "number" ? metrics.attemptedCategories : 0,
        apiRequests: typeof metrics.apiRequests === "number" ? metrics.apiRequests : 0,
        retryCount: typeof metrics.retryCount === "number" ? metrics.retryCount : 0,
        durationMs: Math.max(0, Math.round(performance.now() - routeStartedAt)),
      });
    } catch (error) {
      const outcome = liveSmokeErrorOutcome(safeErrorCode(error));
      sendJson(response, outcome.status, {
        contractVersion: DISCOVERY_LIVE_HTTP_CONTRACT,
        correlationId,
        gateStatus: outcome.gateStatus,
        errorCode: outcome.errorCode,
      }, correlationId);
      dependencies.logDiscoveryLiveEvent({
        event: "DISCOVERY_LIVE_ROUTE_FAILED",
        correlationId,
        deploymentId,
        code: outcome.errorCode,
        durationMs: Math.max(0, Math.round(performance.now() - routeStartedAt)),
      });
    }
    return;
  }

  if (method === "GET" && url.pathname === "/") {
    try {
      const config = dependencies.loadAppConfig();
      const session = readAuthorizationSession(request.headers.cookie, config.sessionSecret);
      sendHtml(response, 200, homePage(Boolean(session), session ? `user_id: ${session.userId}` : undefined));
    } catch {
      sendHtml(response, 200, homePage(false));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/dashboard") {
    try {
      const config = dependencies.loadAppConfig();
      const session = readAuthorizationSession(request.headers.cookie, config.sessionSecret);
      const rawUserId = session ? String(session.userId) : "";
      const isAuth = Boolean(session);
      sendHtml(
        response,
        200,
        dashboardPage({
          authorized: isAuth,
          userId: isAuth ? (rawUserId || "296984475") : undefined,
        }),
      );
    } catch {
      sendHtml(response, 200, dashboardPage({ authorized: false }));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/auth/start") {
    try {
      const config = dependencies.loadAppConfig();
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = createCodeChallenge(verifier);
      const cookie = createOAuthCookie({ state, verifier, createdAt: Date.now() }, config.sessionSecret);
      redirect(response, buildAuthorizationUrl(config, state, challenge), [cookie]);
    } catch {
      sendHtml(response, 500, errorPage("Configuração incompleta", "CONFIG_ERROR"));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/auth/mercadolivre/callback") {
    const clearedCookies = [clearOAuthCookie(), clearAuthorizationCookie()];
    let config: AppConfig;
    try {
      config = dependencies.loadAppConfig();
    } catch {
      sendCallbackResult(response, "CONFIG_ERROR", clearedCookies);
      return;
    }

    const code = url.searchParams.get("code");
    const receivedState = url.searchParams.get("state");
    if (!code) {
      sendCallbackResult(response, "TOKEN_EXCHANGE_FAILED", clearedCookies);
      return;
    }
    if (!receivedState) {
      sendCallbackResult(response, "STATE_INVALID", clearedCookies);
      return;
    }
    const transaction = readOAuthTransaction(request.headers.cookie, config.sessionSecret);
    if (!transaction || !validVerifier(transaction.verifier)) {
      sendCallbackResult(response, "PKCE_INVALID", clearedCookies);
      return;
    }
    if (!isStateFresh(transaction.createdAt) || !validateState(transaction.state, receivedState)) {
      sendCallbackResult(response, "STATE_INVALID", clearedCookies);
      return;
    }

    let result;
    try {
      result = await dependencies.createInitialAuthorizationService(config).authorize(code, transaction.verifier);
    } catch {
      sendCallbackResult(response, "CONFIG_ERROR", clearedCookies);
      return;
    }

    if (SUCCESS_OUTCOMES.has(result.outcome)) {
      if (!result.externalUserId || !Number.isSafeInteger(result.externalUserId)) {
        sendCallbackResult(response, "CONTROL_PLANE_FAILED", clearedCookies);
        return;
      }
      const safeSession = createAuthorizationCookie({
        authorized: true,
        userId: result.externalUserId,
        authorizedAt: Date.now(),
      }, config.sessionSecret);
      sendCallbackResult(response, result.outcome, [clearOAuthCookie(), safeSession]);
      return;
    }

    sendCallbackResult(response, result.outcome, clearedCookies);
    return;
  }

  if (method === "POST" && (
    url.pathname === "/probe"
    || url.pathname === "/probe/alternative"
    || url.pathname === "/probe/direct-items"
    || url.pathname === "/probe/catalog-products"
  )) {
    sendHtml(response, 410, errorPage(
      "Probe manual encerrado",
      "Tokens não são mais mantidos na sessão. Nenhuma coleta foi iniciada.",
    ));
    return;
  }

  if (method === "GET" && (url.pathname === "/report" || url.pathname === "/report.md")) {
    sendHtml(response, 404, errorPage("Relatório não persistido", "Nenhum relatório persistente está disponível."));
    return;
  }

  sendHtml(response, 404, errorPage("Não encontrado", "Rota inexistente."));
}
