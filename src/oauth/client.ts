import type { AppConfig } from "../config.js";
import { MELI_API_ORIGIN, MELI_AUTHORIZATION_ORIGIN } from "../meli/endpoints.js";

export interface AuthorizationTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  userId: number;
}

export type AuthorizationExchangeFailure =
  | "TOKEN_EXCHANGE_FAILED"
  | "TOKEN_RESPONSE_INVALID"
  | "CONFIG_ERROR"
  | "OUTCOME_UNKNOWN";

export class AuthorizationCodeExchangeError extends Error {
  constructor(
    readonly outcome: AuthorizationExchangeFailure,
    readonly sanitizedCode: string,
    readonly httpStatus?: number,
  ) {
    super(sanitizedCode);
    this.name = "AuthorizationCodeExchangeError";
  }
}

export function buildAuthorizationUrl(
  config: Pick<AppConfig, "clientId" | "redirectUri">,
  state: string,
  challenge: string,
): string {
  const url = new URL("/authorization", MELI_AUTHORIZATION_ORIGIN);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAuthorizationTokenResponse(value: unknown): AuthorizationTokenResponse {
  if (!isRecord(value)) {
    throw new AuthorizationCodeExchangeError("TOKEN_RESPONSE_INVALID", "TOKEN_RESPONSE_INVALID", 200);
  }
  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  const tokenType = value.token_type;
  const expiresIn = value.expires_in;
  const userId = value.user_id;
  if (
    typeof accessToken !== "string" || accessToken.length === 0
    || typeof refreshToken !== "string" || refreshToken.length === 0
    || typeof tokenType !== "string" || tokenType.toLowerCase() !== "bearer"
    || typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0
    || typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0
  ) {
    throw new AuthorizationCodeExchangeError("TOKEN_RESPONSE_INVALID", "TOKEN_RESPONSE_INVALID", 200);
  }
  return { accessToken, refreshToken, tokenType: "Bearer", expiresIn, userId };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function officialError(value: unknown): string | null {
  return isRecord(value) && typeof value.error === "string" ? value.error.toLowerCase() : null;
}

export async function exchangeAuthorizationCode(
  config: AppConfig,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthorizationTokenResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetchImpl(`${MELI_API_ORIGIN}/oauth/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AutoAchado-Initial-Authorization/0B2C",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        code_verifier: verifier,
      }),
      signal: controller.signal,
    });
  } catch {
    throw new AuthorizationCodeExchangeError("OUTCOME_UNKNOWN", "AUTHORIZATION_CODE_OUTCOME_UNKNOWN");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await safeJson(response);
  if (response.status === 200) return parseAuthorizationTokenResponse(payload);

  const error = officialError(payload);
  if (error === "invalid_client") {
    throw new AuthorizationCodeExchangeError("CONFIG_ERROR", "INVALID_CLIENT", response.status);
  }
  if (error === "invalid_grant") {
    throw new AuthorizationCodeExchangeError("TOKEN_EXCHANGE_FAILED", "INVALID_GRANT", response.status);
  }
  if (response.status === 429) {
    throw new AuthorizationCodeExchangeError("OUTCOME_UNKNOWN", "RATE_LIMITED", response.status);
  }
  if (response.status >= 500) {
    throw new AuthorizationCodeExchangeError("OUTCOME_UNKNOWN", "UPSTREAM_UNAVAILABLE", response.status);
  }
  throw new AuthorizationCodeExchangeError("TOKEN_EXCHANGE_FAILED", "TOKEN_ENDPOINT_REJECTED", response.status);
}
