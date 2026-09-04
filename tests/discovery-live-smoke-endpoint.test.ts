import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest, type AppDependencies } from "../src/app.js";

const ROUTE = "/__internal/0b3d-b/live-smoke";

interface CapturedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

function liveResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: "commerce-discovery-live-smoke/v1",
    status: "COMPLETED",
    mode: "SMOKE",
    persistenceMode: "DRY_RUN",
    registry: { eligible: 144, tierA: 28, tierB: 116, digest: "digest" },
    selected: { total: 4, tierA: 2, tierB: 2 },
    oauth: { outcome: "ROTATED" },
    fatalErrorCode: null,
    multiCategoryProvenance: 1,
    categoryOutcomes: Array.from({ length: 4 }, (_, index) => ({
      externalCategoryId: `MLB${index + 1}`,
      priorityTier: index < 2 ? "A" : "B",
      status: "SUCCESS",
      errorCode: null,
      rawHighlights: 4,
      productHighlights: 1,
      itemHighlights: 1,
      userProductHighlights: 1,
      unsupportedHighlights: 1,
      requestCount: 1,
      retryCount: 0,
      durationMs: 2,
    })),
    metrics: {
      eligibleCategories: 144,
      selectedCategories: 4,
      attemptedCategories: 4,
      successfulCategories: 4,
      failedCategories: 0,
      emptyCategories: 0,
      notAttemptedCategories: 0,
      apiRequests: 4,
      retryCount: 0,
      rawHighlights: 16,
      productHighlights: 4,
      itemHighlights: 4,
      userProductHighlights: 4,
      unsupportedHighlights: 4,
      acceptedCandidates: 4,
      uniqueCandidates: 1,
      duplicateOccurrences: 3,
      rateLimited: false,
      registryReadMs: 1,
      planningMs: 1,
      apiMs: 8,
      dedupMs: 1,
      persistenceMs: 0,
      totalMs: 12,
    },
    persistenceProof: {
      before: { scan_runs: 0, highlight_snapshots: 0 },
      after: { scan_runs: 0, highlight_snapshots: 0 },
      unchanged: true,
    },
    samples: { productIds: ["MLB1"], itemIds: ["MLB2"], userProductIds: ["MLBU3"] },
    timings: { registryReadMs: 1, planningMs: 1, oauthMs: 1, totalMs: 12 },
    ...overrides,
  };
}

function request(
  method: string,
  url = ROUTE,
  body: string | Readable = "{}",
  headers: Record<string, string> = {},
  attachedBody?: unknown,
): IncomingMessage {
  const stream = typeof body === "string" ? Readable.from(body.length > 0 ? [Buffer.from(body)] : []) : body;
  return Object.assign(stream, {
    method,
    url,
    headers: {
      host: "b1-immutable.vercel.app",
      "content-type": "application/json",
      ...headers,
    },
    ...(attachedBody !== undefined ? { body: attachedBody } : {}),
  }) as IncomingMessage;
}

async function invoke(options: {
  method?: string;
  url?: string;
  body?: string | Readable;
  attachedBody?: unknown;
  headers?: Record<string, string>;
  result?: unknown;
  error?: unknown;
} = {}) {
  const run = options.error === undefined
    ? vi.fn().mockResolvedValue(options.result ?? liveResult())
    : vi.fn().mockRejectedValue(options.error);
  const log = vi.fn();
  const dependencies: Partial<AppDependencies> = {
    runConfiguredDiscoveryLiveSmoke: run,
    createCorrelationId: () => "11111111-2222-4333-8444-555555555555",
    logDiscoveryLiveEvent: log,
  };
  const captured: CapturedResponse = { status: 0, headers: {}, body: "" };
  const response = {
    writeHead(status: number, headers: Record<string, string | string[]>) {
      captured.status = status;
      captured.headers = headers;
      return this;
    },
    end(body?: string) {
      captured.body = body ?? "";
      return this;
    },
  } as unknown as ServerResponse;
  await handleRequest(request(
    options.method ?? "POST",
    options.url ?? ROUTE,
    options.body ?? "{}",
    options.headers,
    options.attachedBody,
  ), response, dependencies);
  return { captured, run, log };
}

describe("temporary protected discovery live-smoke endpoint", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    vi.stubEnv("VERCEL_URL", "b1-immutable.vercel.app");
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_b1");
    vi.stubEnv("VERCEL_REGION", "gru1");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("reconhece somente a rota exata e chama o service uma vez", async () => {
    const accepted = await invoke();
    expect(accepted.captured.status).toBe(200);
    expect(accepted.run).toHaveBeenCalledTimes(1);
    const other = await invoke({ url: "/__internal/0b3d-b/live-smoke-other" });
    expect(other.captured.status).toBe(404);
    expect(other.run).not.toHaveBeenCalled();
  });

  it.each([
    ["VERCEL_ENV", "", 404],
    ["VERCEL_ENV", "preview", 404],
    ["VERCEL_TARGET_ENV", "", 404],
    ["VERCEL_TARGET_ENV", "preview", 404],
  ] as const)("oculta a rota quando %s=%s", async (name, value, expected) => {
    vi.stubEnv(name, value);
    const context = await invoke();
    expect(context.captured.status).toBe(expected);
    expect(context.run).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong.example", 404],
    ["autoachado-ai.vercel.app", 404],
    ["B1-IMMUTABLE.VERCEL.APP", 200],
    ["b1-immutable.vercel.app.", 200],
    ["b1-immutable.vercel.app:443", 200],
  ] as const)("normaliza e valida Host %s", async (host, status) => {
    const context = await invoke({ headers: { host } });
    expect(context.captured.status).toBe(status);
    expect(context.run).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });

  it.each(["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"])("oculta método %s sem ler serviço", async (method) => {
    const context = await invoke({ method, body: "CANARY_BODY_SHOULD_NOT_BE_READ" });
    expect(context.captured.status).toBe(404);
    expect(context.run).not.toHaveBeenCalled();
  });

  it("rejeita qualquer query após normalização do rewrite", async () => {
    const context = await invoke({ url: `${ROUTE}?mode=SMOKE` });
    expect(context.captured.status).toBe(400);
    expect(JSON.parse(context.captured.body)).toEqual({ errorCode: "DISCOVERY_LIVE_QUERY_NOT_PERMITTED" });
    expect(context.run).not.toHaveBeenCalled();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", ""])("rejeita content-type %s", async (contentType) => {
    const context = await invoke({ headers: { "content-type": contentType } });
    expect(context.captured.status).toBe(415);
    expect(JSON.parse(context.captured.body)).toEqual({ errorCode: "DISCOVERY_LIVE_UNSUPPORTED_MEDIA_TYPE" });
    expect(context.run).not.toHaveBeenCalled();
  });

  it("aceita application/json com charset", async () => {
    expect((await invoke({ headers: { "content-type": "Application/JSON; charset=utf-8" } })).captured.status).toBe(200);
  });

  it("rejeita request com body pré-processado", async () => {
    const context = await invoke({ attachedBody: {} });
    expect(context.captured.status).toBe(400);
    expect(JSON.parse(context.captured.body)).toEqual({ errorCode: "DISCOVERY_LIVE_PREPARSED_BODY_PRESENT" });
    expect(context.run).not.toHaveBeenCalled();
  });

  it("rejeita falha de leitura do stream do body", async () => {
    const failingStream = new Readable({
      read() {
        this.destroy(new Error("stream read error"));
      },
    });
    const context = await invoke({ body: failingStream });
    expect(context.captured.status).toBe(400);
    expect(JSON.parse(context.captured.body)).toEqual({ errorCode: "DISCOVERY_LIVE_BODY_READ_FAILED" });
    expect(context.run).not.toHaveBeenCalled();
  });

  it.each([
    ["", "DISCOVERY_LIVE_BODY_EMPTY"],
    ["{", "DISCOVERY_LIVE_JSON_PARSE_FAILED"],
    ["[]", "DISCOVERY_LIVE_BODY_NOT_OBJECT"],
    ["null", "DISCOVERY_LIVE_BODY_NOT_OBJECT"],
    ["1", "DISCOVERY_LIVE_BODY_NOT_OBJECT"],
    ["true", "DISCOVERY_LIVE_BODY_NOT_OBJECT"],
    ["\"value\"", "DISCOVERY_LIVE_BODY_NOT_OBJECT"],
    ["{\"mode\":\"SMOKE\"}", "DISCOVERY_LIVE_OBJECT_NOT_EMPTY"],
    ["{\"persist\":false}", "DISCOVERY_LIVE_OBJECT_NOT_EMPTY"],
    ["{\"category\":\"MLB1\"}", "DISCOVERY_LIVE_OBJECT_NOT_EMPTY"],
    ["{\"operationId\":\"caller\"}", "DISCOVERY_LIVE_OBJECT_NOT_EMPTY"],
  ] as const)(
    "rejeita body sem contrato operacional %s com erro sanitizado %s",
    async (body, errorCode) => {
      const context = await invoke({ body });
      expect(context.captured.status).toBe(400);
      expect(JSON.parse(context.captured.body)).toEqual({ errorCode });
      expect(context.run).not.toHaveBeenCalled();
    },
  );

  it("impõe limite bruto de 32 bytes", async () => {
    const context = await invoke({ body: `{\"x\":\"${"a".repeat(40)}\"}` });
    expect(context.captured.status).toBe(413);
    expect(JSON.parse(context.captured.body)).toEqual({ errorCode: "DISCOVERY_LIVE_BODY_TOO_LARGE" });
    expect(context.run).not.toHaveBeenCalled();
  });

  it("gera correlation ID no servidor e ignora header do caller", async () => {
    const context = await invoke({ headers: { "x-autoachado-correlation-id": "caller-controlled" } });
    const parsed = JSON.parse(context.captured.body);
    expect(parsed.correlationId).toBe("11111111-2222-4333-8444-555555555555");
    expect(context.captured.headers["X-AutoAchado-Correlation-Id"]).toBe(parsed.correlationId);
    expect(context.captured.body).not.toContain("caller-controlled");
  });

  it("retorna somente contrato allowlisted e amostras limitadas", async () => {
    const source = liveResult({
      accessToken: "CANARY_ACCESS_SECRET",
      samples: {
        productIds: Array.from({ length: 20 }, (_, index) => `MLB${index}`),
        itemIds: [],
        userProductIds: [],
        refreshToken: "CANARY_REFRESH_SECRET",
      },
    });
    const context = await invoke({ result: source });
    const parsed = JSON.parse(context.captured.body);
    expect(parsed.contractVersion).toBe("commerce-discovery-live-smoke-http/v1");
    expect(parsed.result.samples.productIds).toHaveLength(10);
    expect(context.captured.body).not.toMatch(/CANARY_ACCESS_SECRET|CANARY_REFRESH_SECRET|accessToken|refreshToken/);
  });

  it("sanitiza erro inesperado e logs sem headers/body/stack", async () => {
    const context = await invoke({ error: new Error("CANARY_SECRET raw provider payload") });
    expect(context.captured.status).toBe(500);
    expect(context.captured.body).not.toContain("CANARY_SECRET");
    const serializedLogs = JSON.stringify(context.log.mock.calls);
    expect(serializedLogs).not.toMatch(/CANARY_SECRET|authorization|cookie|headers|stack|raw provider/i);
    for (const [event] of context.log.mock.calls) {
      expect(Object.keys(event).every((key) => [
        "event", "correlationId", "deploymentId", "status", "code", "selectedCount",
        "attemptedCount", "apiRequests", "retryCount", "durationMs",
      ].includes(key))).toBe(true);
    }
  });

  it("falha fechado quando a resposta excede 64 KiB", async () => {
    const context = await invoke({ result: liveResult({
      registry: { eligible: 144, tierA: 28, tierB: 116, digest: "x".repeat(70 * 1024) },
    }) });
    expect(context.captured.status).toBe(500);
    expect(Buffer.byteLength(context.captured.body)).toBeLessThan(64 * 1024);
    expect(context.captured.body).toContain("DISCOVERY_LIVE_UNEXPECTED");
  });

  it.each([
    [liveResult(), 200, "PASS_0B3D_B_LIMITED_LIVE_DISCOVERY_SMOKE"],
    [liveResult({ status: "COMPLETED_WITH_ERRORS", metrics: { ...(liveResult().metrics as object), failedCategories: 1, successfulCategories: 3 } }), 207, "PARTIAL_0B3D_B_LIVE_SMOKE_CATEGORY_FAILURE"],
    [liveResult({ status: "COMPLETED_WITH_ERRORS", fatalErrorCode: "DISCOVERY_RATE_LIMIT_STOP", metrics: { ...(liveResult().metrics as object), failedCategories: 1, successfulCategories: 1, notAttemptedCategories: 2, rateLimited: true } }), 429, "PARTIAL_0B3D_B_RATE_LIMIT_STOP"],
    [liveResult({ status: "COMPLETED_WITH_ERRORS", fatalErrorCode: "DISCOVERY_AUTH_FATAL", metrics: { ...(liveResult().metrics as object), failedCategories: 1, successfulCategories: 1, notAttemptedCategories: 2 } }), 502, "BLOCKED_0B3D_B_LIVE_ADAPTER_FAILURE"],
  ] as const)("mapeia resultado para HTTP %s", async (result, status, gateStatus) => {
    const context = await invoke({ result });
    expect(context.captured.status).toBe(status);
    expect(JSON.parse(context.captured.body).gateStatus).toBe(gateStatus);
  });

  it.each([
    ["DISCOVERY_LIVE_REGISTRY_MISMATCH", 409],
    ["DISCOVERY_LIVE_PLAN_MISMATCH", 409],
    ["DISCOVERY_LIVE_OPERATION_ALREADY_USED", 409],
    ["DISCOVERY_LIVE_OAUTH_UNAVAILABLE", 503],
    ["DISCOVERY_LIVE_DEPENDENCY_FAILED", 503],
    ["DISCOVERY_LIVE_PERSISTENCE_VIOLATION", 500],
  ] as const)("mapeia erro sanitizado %s", async (code, status) => {
    const context = await invoke({ error: { code, message: "CANARY_SECRET" } });
    expect(context.captured.status).toBe(status);
    expect(context.captured.body).not.toContain("CANARY_SECRET");
  });
});
