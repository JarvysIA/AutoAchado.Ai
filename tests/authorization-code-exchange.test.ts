import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import {
  AuthorizationCodeExchangeError,
  exchangeAuthorizationCode,
  parseAuthorizationTokenResponse,
} from "../src/oauth/client.js";

const config: AppConfig = {
  clientId: "831976763519093",
  clientSecret: "FAKE_CLIENT_SECRET_CANARY",
  redirectUri: "https://autoachado-ai.vercel.app/auth/mercadolivre/callback",
  sessionSecret: "fake-session-secret-at-least-32-characters",
};
const validPayload = {
  access_token: "FAKE_ACCESS_TOKEN_CANARY",
  refresh_token: "FAKE_REFRESH_TOKEN_CANARY",
  token_type: "Bearer",
  expires_in: 21600,
  user_id: 296984475,
};
const response = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

describe("authorization code exchange", () => {
  it("valida payload completo e normaliza somente os campos necessários", () => {
    expect(parseAuthorizationTokenResponse(validPayload)).toEqual({
      accessToken: "FAKE_ACCESS_TOKEN_CANARY",
      refreshToken: "FAKE_REFRESH_TOKEN_CANARY",
      tokenType: "Bearer",
      expiresIn: 21600,
      userId: 296984475,
    });
  });

  it.each([
    ["access_token", undefined],
    ["refresh_token", undefined],
    ["token_type", "mac"],
    ["expires_in", 0],
    ["expires_in", 1.5],
    ["user_id", 0],
    ["user_id", "296984475"],
  ] as const)("rejeita campo inválido %s", (field, value) => {
    expect(() => parseAuthorizationTokenResponse({ ...validPayload, [field]: value })).toThrowError(
      expect.objectContaining({ outcome: "TOKEN_RESPONSE_INVALID" }),
    );
  });

  it("envia POST form-urlencoded uma única vez e nunca usa query para credenciais", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(validPayload, 200));
    await expect(exchangeAuthorizationCode(config, "fake-code", "v".repeat(64), fetchImpl)).resolves.toMatchObject({ userId: 296984475 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.mercadolibre.com/oauth/token");
    expect(String(url)).not.toContain("fake-code");
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("code")).toBe("fake-code");
    expect(body.get("code_verifier")).toBe("v".repeat(64));
    expect(body.get("client_secret")).toBe("FAKE_CLIENT_SECRET_CANARY");
  });

  it.each([
    [400, { error: "invalid_grant" }, "TOKEN_EXCHANGE_FAILED", "INVALID_GRANT"],
    [401, { error: "invalid_client" }, "CONFIG_ERROR", "INVALID_CLIENT"],
    [429, { error: "rate_limit" }, "OUTCOME_UNKNOWN", "RATE_LIMITED"],
    [503, { error: "unavailable" }, "OUTCOME_UNKNOWN", "UPSTREAM_UNAVAILABLE"],
    [400, { error: "other" }, "TOKEN_EXCHANGE_FAILED", "TOKEN_ENDPOINT_REJECTED"],
  ] as const)("classifica HTTP %s sem retry", async (status, body, outcome, code) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(body, status));
    await expect(exchangeAuthorizationCode(config, "fake-code", "v".repeat(64), fetchImpl)).rejects.toMatchObject({ outcome, sanitizedCode: code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifica timeout/reset como outcome desconhecido e não repete", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network canary detail"));
    await expect(exchangeAuthorizationCode(config, "fake-code", "v".repeat(64), fetchImpl)).rejects.toBeInstanceOf(AuthorizationCodeExchangeError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
