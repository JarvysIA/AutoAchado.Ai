import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { sendHtml, redirect } from "./http/responses.js";
import { requestUrl } from "./http/router.js";
import { MeliClient } from "./meli/client.js";
import type { UserDetail } from "./meli/types.js";
import { buildAuthorizationUrl, exchangeAuthorizationCode } from "./oauth/client.js";
import { createCodeChallenge, generateCodeVerifier, generateState, isStateFresh, validateState } from "./oauth/pkce.js";
import {
  clearOAuthCookie,
  createOAuthCookie,
  createTokenCookie,
  readOAuthTransaction,
  readTokenSession,
  type TokenSession,
} from "./oauth/session.js";
import { runProbe } from "./probe/runner.js";
import { redactText } from "./report/redaction.js";
import { errorPage, homePage, probePage } from "./ui/pages.js";

function errorMessage(error: unknown): string {
  return redactText(error instanceof Error ? error.message : "Falha inesperada");
}

export async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = requestUrl(request);
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/") {
    try {
      const config = loadConfig();
      const session = readTokenSession(request.headers.cookie, config.sessionSecret);
      sendHtml(response, 200, homePage(Boolean(session), session ? `${session.nickname ?? "user_id"}: ${session.userId}` : undefined));
    } catch {
      sendHtml(response, 200, homePage(false));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/auth/start") {
    try {
      const config = loadConfig();
      const state = generateState();
      const verifier = generateCodeVerifier();
      const challenge = createCodeChallenge(verifier);
      const cookie = createOAuthCookie({ state, verifier, createdAt: Date.now() }, config.sessionSecret);
      redirect(response, buildAuthorizationUrl(config, state, challenge), [cookie]);
    } catch (error) {
      sendHtml(response, 500, errorPage("Configuração incompleta", errorMessage(error)));
    }
    return;
  }

  if (method === "GET" && url.pathname === "/auth/mercadolivre/callback") {
    let config;
    try {
      config = loadConfig();
    } catch (error) {
      sendHtml(response, 500, errorPage("Configuração incompleta", errorMessage(error)));
      return;
    }
    const clearTransaction = clearOAuthCookie();
    try {
      const code = url.searchParams.get("code");
      const receivedState = url.searchParams.get("state");
      if (!code) throw new Error("Callback rejeitado: code ausente");
      if (!receivedState) throw new Error("Callback rejeitado: state ausente");
      const transaction = readOAuthTransaction(request.headers.cookie, config.sessionSecret);
      if (!transaction) throw new Error("Callback rejeitado: sessão PKCE ausente ou inválida");
      if (!isStateFresh(transaction.createdAt)) throw new Error("Callback rejeitado: state expirado");
      if (!validateState(transaction.state, receivedState)) throw new Error("Callback rejeitado: state divergente");

      const token = await exchangeAuthorizationCode(config, code, transaction.verifier);
      const client = new MeliClient({ accessToken: token.access_token });
      const meResponse = await client.get<UserDetail>("/users/me");
      if (meResponse.status !== 200 || !meResponse.data?.id || meResponse.data.id !== token.user_id) {
        throw new Error("OAuth concluído, mas /users/me não confirmou a identidade");
      }
      const session: TokenSession = {
        accessToken: token.access_token,
        userId: token.user_id,
        expiresAt: Date.now() + token.expires_in * 1000,
      };
      if (token.refresh_token) session.refreshToken = token.refresh_token;
      if (meResponse.data.nickname) session.nickname = meResponse.data.nickname;
      if (meResponse.data.site_id) session.siteId = meResponse.data.site_id;
      if (meResponse.data.country_id) session.countryId = meResponse.data.country_id;
      redirect(response, "/?connected=1", [clearTransaction, createTokenCookie(session, config.sessionSecret)]);
    } catch (error) {
      sendHtml(response, 400, errorPage("OAuth não concluído", errorMessage(error)), { "Set-Cookie": [clearTransaction] });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/probe") {
    try {
      const config = loadConfig();
      const session = readTokenSession(request.headers.cookie, config.sessionSecret);
      if (!session) {
        sendHtml(response, 401, errorPage("Sessão expirada", "Conecte novamente ao Mercado Livre."));
        return;
      }
      const { result, markdown } = await runProbe(
        session.accessToken,
        session.userId,
        Boolean(session.refreshToken),
      );
      sendHtml(response, 200, probePage(result, markdown));
    } catch (error) {
      sendHtml(response, 500, errorPage("Probe não concluído", errorMessage(error)));
    }
    return;
  }

  if (method === "GET" && (url.pathname === "/report" || url.pathname === "/report.md")) {
    sendHtml(response, 404, errorPage("Relatório não persistido", "Execute o 0A-LIVE e baixe o relatório sanitizado na mesma resposta."));
    return;
  }

  sendHtml(response, 404, errorPage("Não encontrado", "Rota inexistente."));
}
