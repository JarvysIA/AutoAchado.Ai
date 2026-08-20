import { clearCookie, parseCookies, seal, secureCookie, unseal } from "../http/cookies";

export const OAUTH_COOKIE = "__Host-autoachado_oauth";
export const TOKEN_COOKIE = "__Host-autoachado_session";

export interface OAuthTransaction {
  state: string;
  verifier: string;
  createdAt: number;
}

export interface TokenSession {
  accessToken: string;
  refreshToken?: string;
  userId: number;
  nickname?: string;
  siteId?: string;
  countryId?: string;
  expiresAt: number;
}

export function createOAuthCookie(transaction: OAuthTransaction, secret: string): string {
  return secureCookie(OAUTH_COOKIE, seal(transaction, secret), 10 * 60);
}

export function readOAuthTransaction(cookieHeader: string | undefined, secret: string): OAuthTransaction | null {
  const value = parseCookies(cookieHeader)[OAUTH_COOKIE];
  return value ? unseal<OAuthTransaction>(value, secret) : null;
}

export function clearOAuthCookie(): string {
  return clearCookie(OAUTH_COOKIE);
}

export function createTokenCookie(session: TokenSession, secret: string): string {
  const remainingSeconds = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
  return secureCookie(TOKEN_COOKIE, seal(session, secret), Math.min(remainingSeconds, 6 * 60 * 60));
}

export function readTokenSession(cookieHeader: string | undefined, secret: string): TokenSession | null {
  const value = parseCookies(cookieHeader)[TOKEN_COOKIE];
  if (!value) return null;
  const session = unseal<TokenSession>(value, secret);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}

export function clearTokenCookie(): string {
  return clearCookie(TOKEN_COOKIE);
}
