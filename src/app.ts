import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig, type AppConfig } from "./config.js";
import { sendHtml, redirect } from "./http/responses.js";
import { requestUrl } from "./http/router.js";
import { buildAuthorizationUrl } from "./oauth/client.js";
import { createCodeChallenge, generateCodeVerifier, generateState, isStateFresh, validateState } from "./oauth/pkce.js";
import {
  clearAuthorizationCookie,
  clearOAuthCookie,
  createAuthorizationCookie,
  createOAuthCookie,
  readAuthorizationSession,
  readOAuthTransaction,
} from "./oauth/session.js";
import type { InitialAuthorizationOutcome, InitialAuthorizationService } from "./server/oauth/initial-authorization.js";
import { createMeliInitialAuthorizationService } from "./server/oauth/factory.js";
import { authorizationResultPage, errorPage, homePage } from "./ui/pages.js";

type CallbackOutcome = InitialAuthorizationOutcome | "STATE_INVALID" | "PKCE_INVALID";

export interface AppDependencies {
  loadAppConfig(): AppConfig;
  createInitialAuthorizationService(config: AppConfig): Pick<InitialAuthorizationService, "authorize">;
}

const DEFAULT_DEPENDENCIES: AppDependencies = {
  loadAppConfig: loadConfig,
  createInitialAuthorizationService: createMeliInitialAuthorizationService,
};

const SUCCESS_OUTCOMES = new Set<CallbackOutcome>([
  "AUTHORIZED_AND_STORED",
  "REAUTHORIZED_AND_STORED",
  "AUTHORIZATION_ALREADY_ACTIVE",
]);

function callbackStatus(outcome: CallbackOutcome): number {
  if (SUCCESS_OUTCOMES.has(outcome)) return 200;
  if (outcome === "USER_MISMATCH") return 403;
  if (outcome === "LOCK_BUSY" || outcome === "STATE_NOT_ALLOWED") return 409;
  if (outcome === "STATE_INVALID" || outcome === "PKCE_INVALID" || outcome === "TOKEN_EXCHANGE_FAILED") return 400;
  return 500;
}

function validVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function sendCallbackResult(
  response: ServerResponse,
  outcome: CallbackOutcome,
  cookies: string[],
): void {
  sendHtml(response, callbackStatus(outcome), authorizationResultPage(outcome), { "Set-Cookie": cookies });
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  overrides: Partial<AppDependencies> = {},
): Promise<void> {
  const dependencies: AppDependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const url = requestUrl(request);
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/") {
    try {
      const config = dependencies.loadAppConfig();
      const session = readAuthorizationSession(request.headers.cookie, config.sessionSecret);
      sendHtml(response, 200, homePage(Boolean(session), session ? `user_id: ${session.userId}` : undefined));
    } catch {
      sendHtml(response, 200, homePage(false));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/auth/start") {
    try {
      const config = dependencies.loadAppConfig();
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = createCodeChallenge(verifier);
      const cookie = createOAuthCookie({ state, verifier, createdAt: Date.now() }, config.sessionSecret);
      redirect(response, buildAuthorizationUrl(config, state, challenge), [cookie]);
    } catch {
      sendHtml(response, 500, errorPage("Configuração incompleta", "CONFIG_ERROR"));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/auth/mercadolivre/callback") {
    const clearedCookies = [clearOAuthCookie(), clearAuthorizationCookie()];
    let config: AppConfig;
    try {
      config = dependencies.loadAppConfig();
    } catch {
      sendCallbackResult(response, "CONFIG_ERROR", clearedCookies);
      return;
    }

    const code = url.searchParams.get("code");
    const receivedState = url.searchParams.get("state");
    if (!code) {
      sendCallbackResult(response, "TOKEN_EXCHANGE_FAILED", clearedCookies);
      return;
    }
    if (!receivedState) {
      sendCallbackResult(response, "STATE_INVALID", clearedCookies);
      return;
    }
    const transaction = readOAuthTransaction(request.headers.cookie, config.sessionSecret);
    if (!transaction || !validVerifier(transaction.verifier)) {
      sendCallbackResult(response, "PKCE_INVALID", clearedCookies);
      return;
    }
    if (!isStateFresh(transaction.createdAt) || !validateState(transaction.state, receivedState)) {
      sendCallbackResult(response, "STATE_INVALID", clearedCookies);
      return;
    }

    let result;
    try {
      result = await dependencies.createInitialAuthorizationService(config).authorize(code, transaction.verifier);
    } catch {
      sendCallbackResult(response, "CONFIG_ERROR", clearedCookies);
      return;
    }

    if (SUCCESS_OUTCOMES.has(result.outcome)) {
      if (!result.externalUserId || !Number.isSafeInteger(result.externalUserId)) {
        sendCallbackResult(response, "CONTROL_PLANE_FAILED", clearedCookies);
        return;
      }
      const safeSession = createAuthorizationCookie({
        authorized: true,
        userId: result.externalUserId,
        authorizedAt: Date.now(),
      }, config.sessionSecret);
      sendCallbackResult(response, result.outcome, [clearOAuthCookie(), safeSession]);
      return;
    }

    sendCallbackResult(response, result.outcome, clearedCookies);
    return;
  }

  if (method === "POST" && (
    url.pathname === "/probe"
    || url.pathname === "/probe/alternative"
    || url.pathname === "/probe/direct-items"
    || url.pathname === "/probe/catalog-products"
  )) {
    sendHtml(response, 410, errorPage(
      "Probe manual encerrado",
      "Tokens não são mais mantidos na sessão. Nenhuma coleta foi iniciada.",
    ));
    return;
  }

  if (method === "GET" && (url.pathname === "/report" || url.pathname === "/report.md")) {
    sendHtml(response, 404, errorPage("Relatório não persistido", "Nenhum relatório persistente está disponível."));
    return;
  }

  sendHtml(response, 404, errorPage("Não encontrado", "Rota inexistente."));
}
