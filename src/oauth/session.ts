import { clearCookie, parseCookies, seal, secureCookie, unseal } from "../http/cookies.js";

export const OAUTH_COOKIE = "__Host-autoachado_oauth";
// Same name as the legacy token cookie so the first safe callback overwrites it.
export const AUTHORIZATION_COOKIE = "__Host-autoachado_session";

export interface OAuthTransaction {
  state: string;
  verifier: string;
  createdAt: number;
}

export interface AuthorizationSession {
  authorized: true;
  userId: number;
  authorizedAt: number;
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

export function createAuthorizationCookie(session: AuthorizationSession, secret: string): string {
  return secureCookie(AUTHORIZATION_COOKIE, seal(session, secret), 12 * 60 * 60);
}

export function readAuthorizationSession(cookieHeader: string | undefined, secret: string): AuthorizationSession | null {
  const value = parseCookies(cookieHeader)[AUTHORIZATION_COOKIE];
  if (!value) return null;
  const session = unseal<unknown>(value, secret);
  if (!session || typeof session !== "object" || Array.isArray(session)) return null;
  const record = session as Record<string, unknown>;
  if (
    record.authorized !== true
    || typeof record.userId !== "number"
    || !Number.isSafeInteger(record.userId)
    || record.userId <= 0
    || typeof record.authorizedAt !== "number"
    || !Number.isFinite(record.authorizedAt)
    || record.authorizedAt <= 0
  ) return null;
  return session as AuthorizationSession;
}

export function clearAuthorizationCookie(): string {
  return clearCookie(AUTHORIZATION_COOKIE);
}
