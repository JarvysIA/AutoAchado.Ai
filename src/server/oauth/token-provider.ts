import { MELI_API_ORIGIN } from "../../meli/endpoints.js";

export type TokenFailureCategory =
  | "SAFE_PRE_SEND_FAILURE"
  | "DEFINITIVE_RESPONSE"
  | "AMBIGUOUS_TRANSPORT_FAILURE";
export type TokenFailureDisposition =
  | "SAFE_RETRY"
  | "REAUTH_REQUIRED"
  | "OUTCOME_UNKNOWN"
  | "CONFIG_ERROR";

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: number;
}

export interface MeliTokenProvider {
  refresh(refreshToken: string): Promise<RefreshResult>;
}

export class MeliTokenProviderError extends Error {
  constructor(
    readonly errorCode: string,
    readonly disposition: TokenFailureDisposition,
    readonly category: TokenFailureCategory,
    readonly httpStatus?: number,
  ) {
    super(errorCode);
    this.name = "MeliTokenProviderError";
  }
}

export interface MeliHttpTokenProviderOptions {
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSuccessPayload(value: unknown): RefreshResult {
  if (!isRecord(value)) {
    throw new MeliTokenProviderError("RESPONSE_INVALID", "OUTCOME_UNKNOWN", "DEFINITIVE_RESPONSE", 200);
  }
  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  const expiresIn = value.expires_in;
  const userId = value.user_id;
  if (
    typeof accessToken !== "string" || accessToken.length === 0
    || typeof refreshToken !== "string" || refreshToken.length === 0
    || typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0
    || typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0
  ) {
    throw new MeliTokenProviderError("RESPONSE_INVALID", "OUTCOME_UNKNOWN", "DEFINITIVE_RESPONSE", 200);
  }
  return { accessToken, refreshToken, expiresIn, userId };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function officialErrorCode(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return typeof payload.error === "string" ? payload.error.toLowerCase() : null;
}

export class MeliHttpTokenProvider implements MeliTokenProvider {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: MeliHttpTokenProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    if (!refreshToken) {
      throw new MeliTokenProviderError("REFRESH_TOKEN_MISSING", "CONFIG_ERROR", "SAFE_PRE_SEND_FAILURE");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${MELI_API_ORIGIN}/oauth/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "AutoAchado-OAuth-Rotation/0B2B",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
          refresh_token: refreshToken,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new MeliTokenProviderError(
        "REFRESH_OUTCOME_UNKNOWN",
        "OUTCOME_UNKNOWN",
        "AMBIGUOUS_TRANSPORT_FAILURE",
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = await safeJson(response);
    if (response.status === 200) return parseSuccessPayload(payload);

    const officialCode = officialErrorCode(payload);
    if (officialCode === "invalid_grant") {
      throw new MeliTokenProviderError("INVALID_GRANT", "REAUTH_REQUIRED", "DEFINITIVE_RESPONSE", response.status);
    }
    if (officialCode === "invalid_client") {
      throw new MeliTokenProviderError("INVALID_CLIENT", "CONFIG_ERROR", "DEFINITIVE_RESPONSE", response.status);
    }
    if (response.status === 429) {
      throw new MeliTokenProviderError("RATE_LIMITED", "OUTCOME_UNKNOWN", "DEFINITIVE_RESPONSE", response.status);
    }
    if (response.status >= 500) {
      throw new MeliTokenProviderError("UPSTREAM_UNAVAILABLE", "OUTCOME_UNKNOWN", "DEFINITIVE_RESPONSE", response.status);
    }
    throw new MeliTokenProviderError("TOKEN_ENDPOINT_REJECTED", "OUTCOME_UNKNOWN", "DEFINITIVE_RESPONSE", response.status);
  }
}
