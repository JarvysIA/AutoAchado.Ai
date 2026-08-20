import type { AppConfig } from "../config.js";
import { MELI_API_ORIGIN, MELI_AUTHORIZATION_ORIGIN } from "../meli/endpoints.js";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number;
  refresh_token?: string;
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

export async function exchangeAuthorizationCode(
  config: AppConfig,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const response = await fetchImpl(`${MELI_API_ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AutoAchado-API-Probe/0A-LIVE",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Troca OAuth falhou com HTTP ${response.status}`);
  const data = (await response.json()) as Partial<TokenResponse>;
  if (!data.access_token || !data.user_id || !data.expires_in) {
    throw new Error("Resposta OAuth incompleta");
  }
  return data as TokenResponse;
}
