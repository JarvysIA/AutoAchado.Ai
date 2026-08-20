import { describe, expect, it, vi } from "vitest";
import type {
  MeliOAuthControlPlane,
  FailureOutcomeClass,
} from "../src/server/oauth/control-plane.js";
import type { RotationLogEvent } from "../src/server/oauth/logging.js";
import { MeliOAuthRotationService } from "../src/server/oauth/rotation-service.js";
import { MeliTokenProviderError, type MeliTokenProvider } from "../src/server/oauth/token-provider.js";

const userId = 296984475;
const leaseId = "123e4567-e89b-42d3-a456-426614174000";
const claimed = {
  outcome: "CLAIMED" as const,
  externalUserId: userId,
  leaseId,
  expectedVersion: 4,
  refreshToken: "CANARY_REFRESH_A",
  leaseExpiresAt: "2026-08-20T20:00:00.000Z",
};

function fakeControlPlane(overrides: Partial<MeliOAuthControlPlane> = {}): MeliOAuthControlPlane {
  return {
    initializeConnection: vi.fn().mockResolvedValue({ outcome: "INITIALIZED", externalUserId: userId, tokenVersion: 1, status: "ACTIVE", reauthRequired: false }),
    claimRefresh: vi.fn().mockResolvedValue(claimed),
    completeRefresh: vi.fn().mockResolvedValue({ outcome: "COMPLETED", externalUserId: userId, tokenVersion: 5, status: "ACTIVE" }),
    failRefresh: vi.fn().mockResolvedValue({ outcome: "FAILURE_RECORDED", externalUserId: userId, tokenVersion: 4, status: "REAUTH_REQUIRED" }),
    ...overrides,
  };
}

function successProvider(): MeliTokenProvider {
  return { refresh: vi.fn().mockResolvedValue({ accessToken: "CANARY_ACCESS_B", refreshToken: "CANARY_REFRESH_C", expiresIn: 21600, userId }) };
}

function service(controlPlane: MeliOAuthControlPlane, tokenProvider: MeliTokenProvider, logger?: (event: RotationLogEvent) => void) {
  return new MeliOAuthRotationService({
    controlPlane,
    tokenProvider,
    expectedUserId: userId,
    operationId: () => "operation-safe-id",
    now: () => 100,
    ...(logger ? { logger } : {}),
  });
}

describe("serviço de rotação OAuth", () => {
  it("só libera access token depois de persistir o refresh novo", async () => {
    const order: string[] = [];
    const plane = fakeControlPlane({
      completeRefresh: vi.fn(async (input: Parameters<MeliOAuthControlPlane["completeRefresh"]>[0]) => {
        order.push(`complete:${input.newRefreshToken}`);
        return { outcome: "COMPLETED" as const, externalUserId: userId, tokenVersion: 5, status: "ACTIVE" };
      }),
    });
    const provider: MeliTokenProvider = { refresh: vi.fn(async (token) => {
      order.push(`provider:${token}`);
      return { accessToken: "CANARY_ACCESS_B", refreshToken: "CANARY_REFRESH_C", expiresIn: 21600, userId };
    }) };
    const result = await service(plane, provider).rotateMeliAccessToken();
    expect(order).toEqual(["provider:CANARY_REFRESH_A", "complete:CANARY_REFRESH_C"]);
    expect(result).toEqual({ outcome: "ROTATED", accessToken: "CANARY_ACCESS_B", expiresIn: 21600, externalUserId: userId, tokenVersion: 5 });
    expect(plane.failRefresh).not.toHaveBeenCalled();
  });

  it.each([
    ["LOCK_BUSY", "LOCK_BUSY"],
    ["REAUTH_REQUIRED", "REAUTH_REQUIRED"],
    ["OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN"],
    ["DISABLED", "DISABLED"],
    ["NOT_FOUND", "REAUTH_REQUIRED"],
    ["SECRET_MISSING", "REAUTH_REQUIRED"],
  ] as const)("não chama provider quando claim retorna %s", async (claimOutcome, expectedOutcome) => {
    const plane = fakeControlPlane({ claimRefresh: vi.fn().mockResolvedValue({ outcome: claimOutcome, externalUserId: userId, expectedVersion: 4, leaseExpiresAt: null }) });
    const provider = successProvider();
    await expect(service(plane, provider).rotateMeliAccessToken()).resolves.toMatchObject({ outcome: expectedOutcome });
    expect(provider.refresh).not.toHaveBeenCalled();
    expect(plane.completeRefresh).not.toHaveBeenCalled();
    expect(plane.failRefresh).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_GRANT", "REAUTH_REQUIRED", "REAUTH_REQUIRED"],
    ["INVALID_CLIENT", "CONFIG_ERROR", "CONFIG_ERROR"],
    ["RATE_LIMITED", "OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN"],
    ["UPSTREAM_UNAVAILABLE", "OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN"],
    ["RESPONSE_INVALID", "OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN"],
  ] as const)("registra falha sanitizada %s como %s", async (errorCode, disposition, expectedOutcome) => {
    const plane = fakeControlPlane();
    const provider: MeliTokenProvider = {
      refresh: vi.fn().mockRejectedValue(new MeliTokenProviderError(errorCode, disposition, "DEFINITIVE_RESPONSE")),
    };
    await expect(service(plane, provider).rotateMeliAccessToken()).resolves.toMatchObject({ outcome: expectedOutcome, errorCode });
    expect(plane.failRefresh).toHaveBeenCalledWith(expect.objectContaining({ errorCode, outcomeClass: disposition as FailureOutcomeClass }));
    expect(plane.completeRefresh).not.toHaveBeenCalled();
    expect(provider.refresh).toHaveBeenCalledTimes(1);
  });

  it("não repete falha ambígua de rede", async () => {
    const plane = fakeControlPlane();
    const provider: MeliTokenProvider = {
      refresh: vi.fn().mockRejectedValue(new MeliTokenProviderError("REFRESH_OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN", "AMBIGUOUS_TRANSPORT_FAILURE")),
    };
    await expect(service(plane, provider).rotateMeliAccessToken()).resolves.toMatchObject({ outcome: "OUTCOME_UNKNOWN" });
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(plane.failRefresh).toHaveBeenCalledWith(expect.objectContaining({ outcomeClass: "OUTCOME_UNKNOWN" }));
  });

  it("permanece fail-safe quando a própria fail RPC falha", async () => {
    const plane = fakeControlPlane({ failRefresh: vi.fn().mockRejectedValue(new Error("control-plane unavailable")) });
    const provider: MeliTokenProvider = {
      refresh: vi.fn().mockRejectedValue(new MeliTokenProviderError("INVALID_GRANT", "REAUTH_REQUIRED", "DEFINITIVE_RESPONSE", 400)),
    };
    await expect(service(plane, provider).rotateMeliAccessToken()).resolves.toEqual({
      outcome: "REAUTH_REQUIRED", externalUserId: userId, errorCode: "INVALID_GRANT",
    });
    expect(provider.refresh).toHaveBeenCalledTimes(1);
  });

  it("bloqueia seller divergente e não completa", async () => {
    const plane = fakeControlPlane();
    const provider: MeliTokenProvider = { refresh: vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "next", expiresIn: 100, userId: 999 }) };
    await expect(service(plane, provider).rotateMeliAccessToken()).resolves.toMatchObject({ outcome: "REAUTH_REQUIRED", errorCode: "USER_MISMATCH" });
    expect(plane.completeRefresh).not.toHaveBeenCalled();
    expect(plane.failRefresh).toHaveBeenCalledWith(expect.objectContaining({ outcomeClass: "REAUTH_REQUIRED", errorCode: "USER_MISMATCH" }));
  });

  it.each(["STALE_VERSION", "LEASE_MISMATCH", "NOT_REFRESHING"] as const)("não libera access token quando complete retorna %s", async (outcome) => {
    const plane = fakeControlPlane({ completeRefresh: vi.fn().mockResolvedValue({ outcome, externalUserId: userId, tokenVersion: 4, status: "REFRESHING" }) });
    const result = await service(plane, successProvider()).rotateMeliAccessToken();
    expect(result).toMatchObject({ outcome: "OUTCOME_UNKNOWN", errorCode: "COMPLETE_OUTCOME_UNKNOWN" });
    expect(JSON.stringify(result)).not.toContain("CANARY_ACCESS_B");
  });

  it("trata transporte ambíguo do complete sem liberar access token", async () => {
    const plane = fakeControlPlane({ completeRefresh: vi.fn().mockRejectedValue(new Error("unknown")) });
    const result = await service(plane, successProvider()).rotateMeliAccessToken();
    expect(result.outcome).toBe("OUTCOME_UNKNOWN");
    expect(plane.completeRefresh).toHaveBeenCalledTimes(1);
    expect(plane.failRefresh).toHaveBeenCalledWith(expect.objectContaining({ outcomeClass: "OUTCOME_UNKNOWN" }));
  });

  it("logs usam allowlist e nunca incluem canários", async () => {
    const events: RotationLogEvent[] = [];
    const plane = fakeControlPlane();
    const result = await service(plane, successProvider(), (event) => events.push(event)).rotateMeliAccessToken();
    expect(result.outcome).toBe("ROTATED");
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("CANARY_REFRESH_A");
    expect(serialized).not.toContain("CANARY_REFRESH_C");
    expect(serialized).not.toContain("CANARY_ACCESS_B");
    expect(events[0]).toEqual({ operationId: "operation-safe-id", externalUserId: userId, outcome: "ROTATED", durationMs: 0, leaseState: "RELEASED", tokenVersion: 5 });
  });

  it("falha do logger não altera uma rotação confirmada", async () => {
    const result = await service(fakeControlPlane(), successProvider(), () => { throw new Error("logger down"); }).rotateMeliAccessToken();
    expect(result.outcome).toBe("ROTATED");
  });
});
