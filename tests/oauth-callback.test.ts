import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleRequest, type AppDependencies } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { seal } from "../src/http/cookies.js";
import {
  AUTHORIZATION_COOKIE,
  OAUTH_COOKIE,
  createOAuthCookie,
  readAuthorizationSession,
} from "../src/oauth/session.js";
import type { InitialAuthorizationResult } from "../src/server/oauth/initial-authorization.js";

const config: AppConfig = {
  clientId: "831976763519093",
  clientSecret: "FAKE_CLIENT_SECRET_CANARY",
  redirectUri: "https://autoachado-ai.vercel.app/auth/mercadolivre/callback",
  sessionSecret: "fake-session-secret-for-callback-tests-123456",
};
const state = "s".repeat(64);
const verifier = "v".repeat(64);

interface CapturedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

async function callback(options: {
  result?: InitialAuthorizationResult;
  cookie?: string;
  state?: string | null;
  code?: string | null;
  createdAt?: number;
  verifier?: string;
} = {}) {
  const authorize = vi.fn().mockResolvedValue(options.result ?? {
    outcome: "AUTHORIZED_AND_STORED",
    externalUserId: 296984475,
    tokenVersion: 1,
  });
  const dependencies: Partial<AppDependencies> = {
    loadAppConfig: () => config,
    createInitialAuthorizationService: () => ({ authorize }),
  };
  const oauthCookie = options.cookie ?? createOAuthCookie({
    state,
    verifier: options.verifier ?? verifier,
    createdAt: options.createdAt ?? Date.now(),
  }, config.sessionSecret).split(";")[0]!;
  const query = new URLSearchParams();
  if (options.code !== null) query.set("code", options.code ?? "fake-code");
  if (options.state !== null) query.set("state", options.state ?? state);
  const request = {
    method: "GET",
    url: `/auth/mercadolivre/callback?${query}`,
    headers: { cookie: oauthCookie },
  } as IncomingMessage;
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
  await handleRequest(request, response, dependencies);
  return { captured, authorize };
}

function setCookies(captured: CapturedResponse): string[] {
  const value = captured.headers["Set-Cookie"];
  return Array.isArray(value) ? value : value ? [value] : [];
}

describe("callback OAuth 0B2C", () => {
  it.each([
    ["AUTHORIZED_AND_STORED", "Mercado Livre autorizado com sucesso."],
    ["REAUTHORIZED_AND_STORED", "Mercado Livre reautorizado com sucesso."],
    ["AUTHORIZATION_ALREADY_ACTIVE", "Mercado Livre já está autorizado."],
  ] as const)("persiste somente sessão sanitizada para %s", async (outcome, message) => {
    const { captured, authorize } = await callback({ result: { outcome, externalUserId: 296984475, tokenVersion: 2 } });
    expect(captured.status).toBe(200);
    expect(captured.body).toContain(message);
    expect(authorize).toHaveBeenCalledWith("fake-code", verifier);
    const cookies = setCookies(captured);
    expect(cookies.some((cookie) => cookie.startsWith(`${OAUTH_COOKIE}=`) && cookie.includes("Max-Age=0"))).toBe(true);
    const authorizationCookie = cookies.find((cookie) => cookie.startsWith(`${AUTHORIZATION_COOKIE}=`) && !cookie.includes("Max-Age=0"));
    expect(authorizationCookie).toBeDefined();
    expect(readAuthorizationSession(authorizationCookie?.split(";")[0], config.sessionSecret)).toMatchObject({
      authorized: true,
      userId: 296984475,
    });
    const publicOutput = JSON.stringify(captured);
    expect(publicOutput).not.toContain("FAKE_ACCESS_TOKEN_CANARY");
    expect(publicOutput).not.toContain("FAKE_REFRESH_TOKEN_CANARY");
    expect(publicOutput).not.toContain("FAKE_CLIENT_SECRET_CANARY");
  });

  it.each([
    ["LOCK_BUSY", 409],
    ["STATE_NOT_ALLOWED", 409],
    ["TOKEN_EXCHANGE_FAILED", 400],
    ["TOKEN_RESPONSE_INVALID", 500],
    ["USER_VALIDATION_FAILED", 500],
    ["USER_MISMATCH", 403],
    ["CONTROL_PLANE_FAILED", 500],
    ["OUTCOME_UNKNOWN", 500],
    ["CONFIG_ERROR", 500],
  ] as const)("falha fechado e não cria sessão para %s", async (outcome, status) => {
    const { captured } = await callback({ result: { outcome } });
    expect(captured.status).toBe(status);
    expect(setCookies(captured).every((cookie) => cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("rejeita code ausente e limpa state/PKCE", async () => {
    const { captured, authorize } = await callback({ code: null });
    expect(captured.status).toBe(400);
    expect(captured.body).toContain("TOKEN_EXCHANGE_FAILED");
    expect(authorize).not.toHaveBeenCalled();
    expect(setCookies(captured).some((cookie) => cookie.startsWith(`${OAUTH_COOKIE}=`) && cookie.includes("Max-Age=0"))).toBe(true);
  });

  it.each([
    ["state ausente", { state: null }],
    ["state divergente", { state: "different-state" }],
    ["state expirado", { createdAt: Date.now() - 11 * 60 * 1000 }],
  ] as const)("rejeita %s sem chamar exchange", async (_name, options) => {
    const { captured, authorize } = await callback(options);
    expect(captured.status).toBe(400);
    expect(captured.body).toContain("STATE_INVALID");
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    ["cookie ausente", { cookie: "" }],
    ["verifier inválido", { verifier: "short" }],
  ] as const)("rejeita PKCE: %s", async (_name, options) => {
    const { captured, authorize } = await callback(options);
    expect(captured.status).toBe(400);
    expect(captured.body).toContain("PKCE_INVALID");
    expect(authorize).not.toHaveBeenCalled();
  });

  it("rejeita cookie legado que contenha tokens", () => {
    const legacy = `${AUTHORIZATION_COOKIE}=${seal({
      accessToken: "FAKE_ACCESS_TOKEN_CANARY",
      refreshToken: "FAKE_REFRESH_TOKEN_CANARY",
      userId: 296984475,
      expiresAt: Date.now() + 10000,
    }, config.sessionSecret)}`;
    expect(readAuthorizationSession(legacy, config.sessionSecret)).toBeNull();
  });
});
