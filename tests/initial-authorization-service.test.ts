import { describe, expect, it, vi } from "vitest";
import { AuthorizationCodeExchangeError, type AuthorizationTokenResponse } from "../src/oauth/client.js";
import { ControlPlaneError, type InitializeOutcome, type MeliOAuthControlPlane } from "../src/server/oauth/control-plane.js";
import { InitialAuthorizationService } from "../src/server/oauth/initial-authorization.js";

const userId = 296984475;
const token: AuthorizationTokenResponse = {
  accessToken: "FAKE_ACCESS_TOKEN_CANARY",
  refreshToken: "FAKE_REFRESH_TOKEN_CANARY",
  tokenType: "Bearer",
  expiresIn: 21600,
  userId,
};

function controlPlane(outcome: InitializeOutcome = "INITIALIZED"): MeliOAuthControlPlane {
  return {
    initializeConnection: vi.fn().mockResolvedValue({ outcome, externalUserId: userId, tokenVersion: 1, status: outcome === "LOCK_BUSY" ? "REFRESHING" : outcome === "STATE_NOT_ALLOWED" ? "DISABLED" : "ACTIVE", reauthRequired: outcome === "STATE_NOT_ALLOWED" }),
    claimRefresh: vi.fn(),
    completeRefresh: vi.fn(),
    failRefresh: vi.fn(),
  };
}

function build(options: {
  exchange?: () => Promise<AuthorizationTokenResponse>;
  getUser?: (accessToken: string) => Promise<{ id: number }>;
  plane?: MeliOAuthControlPlane;
  expectedUserId?: number;
} = {}) {
  const plane = options.plane ?? controlPlane();
  const exchangeCode = vi.fn(options.exchange ?? (async () => token));
  const getCurrentUser = vi.fn(options.getUser ?? (async () => ({ id: userId })));
  return {
    plane,
    exchangeCode,
    getCurrentUser,
    service: new InitialAuthorizationService({
      exchangeCode,
      getCurrentUser,
      controlPlane: plane,
      expectedUserId: options.expectedUserId ?? userId,
    }),
  };
}

describe("initial authorization service", () => {
  it.each([
    ["INITIALIZED", "AUTHORIZED_AND_STORED"],
    ["REAUTHORIZED", "REAUTHORIZED_AND_STORED"],
    ["ALREADY_INITIALIZED", "AUTHORIZATION_ALREADY_ACTIVE"],
    ["LOCK_BUSY", "LOCK_BUSY"],
    ["STATE_NOT_ALLOWED", "STATE_NOT_ALLOWED"],
  ] as const)("mapeia control plane %s para %s", async (planeOutcome, serviceOutcome) => {
    const context = build({ plane: controlPlane(planeOutcome) });
    await expect(context.service.authorize("fake-code", "v".repeat(64))).resolves.toMatchObject({ outcome: serviceOutcome });
    expect(context.plane.initializeConnection).toHaveBeenCalledWith(userId, "FAKE_REFRESH_TOKEN_CANARY");
  });

  it("usa access token somente em /users/me e não o envia ao control plane", async () => {
    const context = build();
    const result = await context.service.authorize("fake-code", "v".repeat(64));
    expect(context.getCurrentUser).toHaveBeenCalledWith("FAKE_ACCESS_TOKEN_CANARY");
    expect(JSON.stringify((context.plane.initializeConnection as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("FAKE_ACCESS_TOKEN_CANARY");
    expect(JSON.stringify(result)).not.toContain("FAKE_ACCESS_TOKEN_CANARY");
    expect(JSON.stringify(result)).not.toContain("FAKE_REFRESH_TOKEN_CANARY");
  });

  it("bloqueia user_id do token diferente antes de /users/me e Vault", async () => {
    const context = build({ exchange: async () => ({ ...token, userId: 999 }) });
    await expect(context.service.authorize("fake-code", "v".repeat(64))).resolves.toMatchObject({ outcome: "USER_MISMATCH" });
    expect(context.getCurrentUser).not.toHaveBeenCalled();
    expect(context.plane.initializeConnection).not.toHaveBeenCalled();
  });

  it("bloqueia divergência entre token e /users/me", async () => {
    const context = build({ getUser: async () => ({ id: 999 }) });
    await expect(context.service.authorize("fake-code", "v".repeat(64))).resolves.toMatchObject({ outcome: "USER_MISMATCH" });
    expect(context.plane.initializeConnection).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5] as const)("rejeita /users/me inválido: %s", async (id) => {
    const context = build({ getUser: async () => ({ id }) });
    await expect(context.service.authorize("fake-code", "v".repeat(64))).resolves.toMatchObject({ outcome: "USER_VALIDATION_FAILED" });
    expect(context.plane.initializeConnection).not.toHaveBeenCalled();
  });

  it("trata falha de /users/me sem expor access token", async () => {
    const context = build({ getUser: async () => { throw new Error("FAKE_ACCESS_TOKEN_CANARY"); } });
    const result = await context.service.authorize("fake-code", "v".repeat(64));
    expect(result).toEqual({ outcome: "USER_VALIDATION_FAILED", sanitizedErrorCode: "USERS_ME_FAILED" });
  });

  it.each([
    ["TOKEN_EXCHANGE_FAILED", "INVALID_GRANT"],
    ["CONFIG_ERROR", "INVALID_CLIENT"],
    ["OUTCOME_UNKNOWN", "RATE_LIMITED"],
    ["TOKEN_RESPONSE_INVALID", "TOKEN_RESPONSE_INVALID"],
  ] as const)("propaga somente erro sanitizado %s", async (outcome, sanitizedCode) => {
    const context = build({ exchange: async () => { throw new AuthorizationCodeExchangeError(outcome, sanitizedCode); } });
    await expect(context.service.authorize("fake-code", "v".repeat(64))).resolves.toEqual({ outcome, sanitizedErrorCode: sanitizedCode });
    expect(context.plane.initializeConnection).not.toHaveBeenCalled();
  });

  it("distingue falha definitiva e transporte ambíguo do control plane", async () => {
    const definitive = controlPlane();
    definitive.initializeConnection = vi.fn().mockRejectedValue(new ControlPlaneError("CONTROL_PLANE_REQUEST_FAILED", false));
    await expect(build({ plane: definitive }).service.authorize("fake-code", "v".repeat(64))).resolves.toMatchObject({ outcome: "CONTROL_PLANE_FAILED" });
    const ambiguous = controlPlane();
    ambiguous.initializeConnection = vi.fn().mockRejectedValue(new ControlPlaneError("CONTROL_PLANE_REQUEST_FAILED", true));
    await expect(build({ plane: ambiguous }).service.authorize("fake-code", "v".repeat(64))).resolves.toMatchObject({ outcome: "OUTCOME_UNKNOWN" });
  });
});
