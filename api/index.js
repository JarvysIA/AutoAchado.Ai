// src/config.ts
var DEFAULT_CLIENT_ID = "831976763519093";
var DEFAULT_REDIRECT_URI = "https://autoachado-ai.vercel.app/auth/mercadolivre/callback";
function loadConfig(env = process.env) {
  const clientId = env.MELI_CLIENT_ID?.trim();
  const clientSecret = env.MELI_CLIENT_SECRET?.trim();
  const redirectUri = env.MELI_REDIRECT_URI?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();
  const missing = [
    ["MELI_CLIENT_ID", clientId],
    ["MELI_CLIENT_SECRET", clientSecret],
    ["MELI_REDIRECT_URI", redirectUri],
    ["SESSION_SECRET", sessionSecret]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(", ")}`);
  }
  if (clientId !== DEFAULT_CLIENT_ID) {
    throw new Error("MELI_CLIENT_ID não corresponde ao aplicativo autorizado");
  }
  if (redirectUri !== DEFAULT_REDIRECT_URI) {
    throw new Error("MELI_REDIRECT_URI não corresponde exatamente à URI cadastrada");
  }
  if ((sessionSecret?.length ?? 0) < 32) {
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres");
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    sessionSecret
  };
}

// src/http/responses.ts
function sendHtml(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://auth.mercadolivre.com.br",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(body);
}
function redirect(response, location, cookies = []) {
  response.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
    ...cookies.length > 0 ? { "Set-Cookie": cookies } : {}
  });
  response.end();
}

// src/http/router.ts
function requestUrl(request) {
  const url = new URL(request.url ?? "/", "https://autoachado-ai.vercel.app");
  const rewrittenRoute = url.searchParams.get("route");
  if (rewrittenRoute !== null) {
    url.pathname = rewrittenRoute ? `/${rewrittenRoute.replace(/^\/+/, "")}` : "/";
    url.searchParams.delete("route");
  }
  return url;
}

// src/meli/endpoints.ts
var MELI_API_ORIGIN = "https://api.mercadolibre.com";
var MELI_AUTHORIZATION_ORIGIN = "https://auth.mercadolivre.com.br";
var ALLOWED_PATHS = [
  /^\/oauth\/token$/,
  /^\/users\/me$/,
  /^\/users\/\d+$/,
  /^\/sites\/MLB\/categories(?:\/all)?$/,
  /^\/sites\/MLB\/search$/,
  /^\/categories\/MLB\d+$/,
  /^\/items\/MLB\d+(?:\/sale_price|\/prices)?$/,
  /^\/items$/,
  /^\/highlights\/MLB\/category\/MLB\d+$/,
  /^\/user-products\/MLBU\d+$/,
  /^\/users\/\d+\/items\/search$/
];
function assertOfficialApiUrl(pathOrUrl) {
  const url = new URL(pathOrUrl, MELI_API_ORIGIN);
  if (url.origin !== MELI_API_ORIGIN) {
    throw new Error("Host externo ou não oficial rejeitado");
  }
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) {
    throw new Error(`Endpoint não permitido: ${url.pathname}`);
  }
  return url;
}
function assertMlbId(value, kind) {
  const pattern = kind === "item" ? /^MLB\d+$/ : /^MLB\d+$/;
  if (!pattern.test(value)) throw new Error(`ID de ${kind} inválido`);
  return value;
}
function assertSellerId(value) {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) throw new Error("ID de seller inválido");
  return normalized;
}
function assertUserProductId(value) {
  if (!/^MLBU\d+$/.test(value)) throw new Error("ID de User Product inválido");
  return value;
}

// src/meli/resilience.ts
var TRANSIENT_STATUSES = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1e3;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
function retryDecision(status, attempt, retryAfter, random = Math.random) {
  if (!TRANSIENT_STATUSES.has(status) || attempt >= 2) {
    return { retry: false, delayMs: 0 };
  }
  const headerDelay = parseRetryAfter(retryAfter);
  const exponential = 250 * 2 ** attempt;
  const jitter = Math.floor(random() * 100);
  return { retry: true, delayMs: Math.min(headerDelay ?? exponential + jitter, 5e3) };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/meli/client.ts
var OBSERVED_HEADERS = [
  "etag",
  "last-modified",
  "x-content-created",
  "x-content-md5",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset"
];
var MeliApiError = class extends Error {
  constructor(message, status, responseBody) {
    super(message);
    this.status = status;
    this.responseBody = responseBody;
  }
  status;
  responseBody;
};
var MeliClient = class {
  observedHeaders = [];
  requestCount = 0;
  encounteredRateLimit = false;
  accessToken;
  timeoutMs;
  fetchImpl;
  sleepImpl;
  constructor(options = {}) {
    this.accessToken = options.accessToken;
    this.timeoutMs = options.timeoutMs ?? 1e4;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? sleep;
  }
  async get(path) {
    return this.request(path, { method: "GET" });
  }
  async getHeadersOnly(path) {
    return this.request(path, { method: "GET" }, true);
  }
  async request(path, init, headersOnly = false) {
    const url = assertOfficialApiUrl(path);
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const started = performance.now();
      try {
        const headers = new Headers(init.headers);
        headers.set("Accept", "application/json");
        headers.set("User-Agent", "AutoAchado-API-Probe/0A-LIVE");
        if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
        this.requestCount += 1;
        const response = await this.fetchImpl(url, { ...init, headers, signal: controller.signal });
        if (response.status === 429) this.encounteredRateLimit = true;
        const durationMs = Math.round(performance.now() - started);
        const selectedHeaders = Object.fromEntries(
          OBSERVED_HEADERS.flatMap((name) => {
            const value = response.headers.get(name);
            return value === null ? [] : [[name, value]];
          })
        );
        if (Object.keys(selectedHeaders).length > 0) this.observedHeaders.push(selectedHeaders);
        const decision = retryDecision(response.status, attempt, response.headers.get("retry-after"));
        if (decision.retry) {
          await response.body?.cancel();
          await this.sleepImpl(decision.delayMs);
          continue;
        }
        if (headersOnly) {
          await response.body?.cancel();
          return { status: response.status, data: null, headers: selectedHeaders, durationMs, approximateBytes: 0 };
        }
        const text = await response.text();
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { unparseable_response: true };
          }
        }
        if (!response.ok) {
          throw new MeliApiError(`Mercado Livre respondeu HTTP ${response.status}`, response.status, data);
        }
        return {
          status: response.status,
          data,
          headers: selectedHeaders,
          durationMs,
          approximateBytes: Buffer.byteLength(text)
        };
      } catch (error) {
        if (error instanceof MeliApiError) throw error;
        if (attempt >= 2) {
          const message = error instanceof Error && error.name === "AbortError" ? "Timeout na API oficial" : "Falha transitória na API oficial";
          throw new MeliApiError(message, 0);
        }
        await this.sleepImpl(250 * 2 ** attempt);
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new MeliApiError("Falha inesperada", 0);
  }
};

// src/oauth/client.ts
function buildAuthorizationUrl(config, state, challenge) {
  const url = new URL("/authorization", MELI_AUTHORIZATION_ORIGIN);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  return url.toString();
}
async function exchangeAuthorizationCode(config, code, verifier, fetchImpl = fetch) {
  const response = await fetchImpl(`${MELI_API_ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AutoAchado-API-Probe/0A-LIVE"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier
    }),
    signal: AbortSignal.timeout(1e4)
  });
  if (!response.ok) throw new Error(`Troca OAuth falhou com HTTP ${response.status}`);
  const data = await response.json();
  if (!data.access_token || !data.user_id || !data.expires_in) {
    throw new Error("Resposta OAuth incompleta");
  }
  return data;
}

// src/oauth/pkce.ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
function base64Url(input) {
  return input.toString("base64url");
}
function generateState() {
  return base64Url(randomBytes(32));
}
function generateCodeVerifier() {
  return base64Url(randomBytes(64));
}
function createCodeChallenge(verifier) {
  return base64Url(createHash("sha256").update(verifier, "ascii").digest());
}
function validateState(expected, received) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
function isStateFresh(createdAt, now = Date.now(), ttlMs = 10 * 6e4) {
  return createdAt <= now && now - createdAt <= ttlMs;
}

// src/http/cookies.ts
import { createCipheriv, createDecipheriv, createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
function keyFromSecret(secret) {
  return createHash2("sha256").update(secret, "utf8").digest();
}
function seal(value, secret) {
  const iv = randomBytes2(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}
function unseal(value, secret) {
  try {
    const payload = Buffer.from(value, "base64url");
    if (payload.length < 29) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}
function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 1) return [];
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    })
  );
}
function secureCookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// src/oauth/session.ts
var OAUTH_COOKIE = "__Host-autoachado_oauth";
var TOKEN_COOKIE = "__Host-autoachado_session";
function createOAuthCookie(transaction, secret) {
  return secureCookie(OAUTH_COOKIE, seal(transaction, secret), 10 * 60);
}
function readOAuthTransaction(cookieHeader, secret) {
  const value = parseCookies(cookieHeader)[OAUTH_COOKIE];
  return value ? unseal(value, secret) : null;
}
function clearOAuthCookie() {
  return clearCookie(OAUTH_COOKIE);
}
function createTokenCookie(session, secret) {
  const remainingSeconds = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1e3));
  return secureCookie(TOKEN_COOKIE, seal(session, secret), Math.min(remainingSeconds, 6 * 60 * 60));
}
function readTokenSession(cookieHeader, secret) {
  const value = parseCookies(cookieHeader)[TOKEN_COOKIE];
  if (!value) return null;
  const session = unseal(value, secret);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}

// src/report/redaction.ts
var SENSITIVE_KEYS = /^(?:access_token|refresh_token|client_secret|code|code_verifier|authorization|cookie|session_secret)$/i;
function redactText(value) {
  return value.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "[REDACTED_AUTHORIZATION]").replace(/\bAPP_USR-[A-Za-z0-9-]+\b/g, "[REDACTED_ACCESS_TOKEN]").replace(/\bTG-[A-Za-z0-9-]+\b/g, "[REDACTED_REFRESH_TOKEN]").replace(/((?:access_token|refresh_token|client_secret|code_verifier|session_secret)["'=:\s]+)[^\s&,}\"]+/gi, "$1[REDACTED]");
}
function sanitizeForReport(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(sanitizeForReport);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !SENSITIVE_KEYS.test(key)).map(([key, child]) => [key, sanitizeForReport(child)])
    );
  }
  return value;
}
function reportContainsSecret(report, knownSecrets = []) {
  const patterns = [/Bearer\s+\S+/i, /\bAPP_USR-\S+/i, /\bTG-\S+/i, /"(?:access_token|refresh_token|client_secret|code_verifier)"\s*:/i];
  return patterns.some((pattern) => pattern.test(report)) || knownSecrets.filter(Boolean).some((secret) => report.includes(secret));
}

// src/report/renderer.ts
function passPartialFail(success, partial) {
  return success ? "PASS" : partial ? "PARTIAL" : "FAIL";
}
function json(value) {
  return JSON.stringify(value, null, 2);
}
function renderReport(result) {
  const saleWithAmount = result.prices.filter((row) => typeof row.salePrice.data?.amount === "number").length;
  const saleWithRegular = result.prices.filter((row) => typeof row.salePrice.data?.regular_amount === "number").length;
  const sellersWithLevel = result.sellers.filter((seller) => typeof seller.level_id === "string").length;
  const highlightsCount = result.highlights.reduce((total, row) => total + row.content.length, 0);
  const pagesOk = result.pagination.filter((page) => page.httpStatus >= 200 && page.httpStatus < 300).length;
  const priceStatus = passPartialFail(saleWithAmount === result.prices.length && result.prices.length >= 5, saleWithAmount > 0);
  const sellerStatus = passPartialFail(sellersWithLevel === result.sellers.length && result.sellers.length > 0, sellersWithLevel > 0);
  return `# AutoAchado.AI — 0A-LIVE API Feasibility

Data/hora: ${result.generatedAt}

Ambiente: ${result.environment}

Client ID: ${result.clientId}

Redirect URI: ${result.redirectUri}

## Status formal

${result.formalStatus}

## OAuth

${result.oauth.status}

- refresh_token_received: ${result.oauth.refreshTokenReceived}

## /users/me

${result.usersMe.status}

- HTTP status: ${result.usersMe.httpStatus}
- user_id: ${result.usersMe.user?.id ?? "não retornado"}
- nickname: ${result.usersMe.user?.nickname ?? "não retornado"}
- site_id: ${result.usersMe.user?.site_id ?? "não retornado"}
- country_id: ${result.usersMe.user?.country_id ?? "não retornado"}

## MLB categories

${result.categories?.httpStatus === 200 ? "PASS" : "FAIL"}

## Automotive root

${result.categories?.root ? "PASS" : "FAIL"}

- id: ${result.categories?.root?.id ?? "não encontrado"}
- name: ${result.categories?.root?.name ?? "não encontrado"}

## Leaf categories

${result.categories?.status ?? "FAIL"}

- quantidade encontrada: ${result.categories?.leaves.length ?? 0}
- amostra: ${json(result.categories?.leaves.slice(0, 10) ?? [])}
- filhos imediatos: ${json(result.categories?.immediateChildren ?? [])}
- dump: ${json(result.categories?.dump ?? { status: "não testado" })}

## Marketplace search

${result.search?.status ?? "FAIL"}

- categorias testadas: ${result.search?.categoriesTested ?? 0}
- candidatos: ${result.search?.candidates.length ?? 0}
- erros: ${json(result.search?.errors ?? [])}

## Third-party discovery

${(result.search?.thirdParty.length ?? 0) >= 5 ? "PASS" : (result.search?.thirdParty.length ?? 0) > 0 ? "PARTIAL" : "FAIL"}

- itens testados: ${result.search?.candidates.length ?? 0}
- itens terceiros confirmados: ${result.search?.thirdParty.length ?? 0}
- amostra sanitizada: ${json(result.search?.thirdParty.slice(0, 10) ?? [])}

## Item detail

${result.items?.status ?? "FAIL"}

- detalhes retornados: ${result.items?.details.length ?? 0}
- dados: ${json(result.items?.details ?? [])}

## Multiget

${result.multiget?.status ?? "FAIL"}

${json(result.multiget ?? { status: "não testado" })}

## sale_price

${priceStatus}

- ${saleWithAmount}/${result.prices.length} itens retornaram amount
- ${saleWithRegular}/${result.prices.length} itens retornaram regular_amount
- dados: ${json(result.prices.map((row) => ({ itemId: row.itemId, salePrice: row.salePrice })))}

## prices

${passPartialFail(result.prices.length > 0 && result.prices.every((row) => row.prices.data.length > 0), result.prices.some((row) => row.prices.data.length > 0))}

- dados: ${json(result.prices.map((row) => ({ itemId: row.itemId, prices: row.prices })))}

## Seller reputation

${sellerStatus}

- ${sellersWithLevel}/${result.sellers.length} sellers com level_id
- dados: ${json(result.sellers)}

## Highlights

${passPartialFail(result.highlights.length >= 3 && highlightsCount > 0, result.highlights.length > 0)}

- quantidade total retornada: ${highlightsCount}
- dados: ${json(result.highlights)}

## Pagination

${passPartialFail(pagesOk === 3, pagesOk > 0)}

- páginas válidas: ${pagesOk}/${result.pagination.length}
- dados: ${json(result.pagination)}

## Rate-limit indicators

${result.rateLimitHeaders.length > 0 ? "observados" : "não observados"}

${json(result.rateLimitHeaders)}

## Erros relevantes

${result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhum erro relevante registrado."}
`;
}

// src/probe/categories.ts
function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function findAutomotiveRoot(categories) {
  const matches = categories.filter((category) => {
    const name = normalize(category.name);
    return name.includes("veiculo") || name.includes("automot") || name.includes("autopart");
  });
  return matches.find((category) => category.id === "MLB5672") ?? matches[0] ?? null;
}
async function probeCategories(client) {
  const listResponse = await client.get("/sites/MLB/categories");
  const categories = listResponse.data ?? [];
  const root = findAutomotiveRoot(categories);
  if (!root) {
    return { status: "FAIL", httpStatus: listResponse.status, root: null, immediateChildren: [], leaves: [], dump: null };
  }
  const rootDetail = await client.get(`/categories/${assertMlbId(root.id, "category")}`);
  const immediateChildren = rootDetail.data?.children_categories ?? [];
  const leaves = [];
  const queue = [...immediateChildren];
  const visited = /* @__PURE__ */ new Set();
  while (queue.length > 0 && leaves.length < 10 && visited.size < 60) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    const response = await client.get(`/categories/${assertMlbId(next.id, "category")}`);
    const children = response.data?.children_categories ?? [];
    if (children.length === 0) leaves.push({ id: next.id, name: response.data?.name ?? next.name });
    else queue.push(...children);
  }
  let dump = null;
  try {
    const dumpResponse = await client.getHeadersOnly("/sites/MLB/categories/all");
    dump = { httpStatus: dumpResponse.status, headers: dumpResponse.headers };
  } catch {
    dump = null;
  }
  return {
    status: leaves.length >= 3 ? "PASS" : leaves.length > 0 ? "PARTIAL" : "FAIL",
    httpStatus: listResponse.status,
    root,
    immediateChildren,
    leaves,
    dump
  };
}

// src/probe/highlights.ts
async function probeHighlights(client, categories) {
  const output = [];
  for (const category of categories.slice(0, 3)) {
    try {
      const id = assertMlbId(category.id, "category");
      const response = await client.get(`/highlights/MLB/category/${id}`);
      output.push({ categoryId: id, httpStatus: response.status, content: response.data?.content ?? [] });
    } catch (error) {
      output.push({ categoryId: category.id, httpStatus: error instanceof MeliApiError ? error.status : 0, content: [] });
    }
  }
  return output;
}

// src/probe/items.ts
function sanitizeItemDetail(item) {
  const output = { id: item.id };
  if (item.title !== void 0) output.title = item.title;
  if (item.price !== void 0) output.price = item.price;
  if (item.status !== void 0) output.status = item.status;
  if (item.condition !== void 0) output.condition = item.condition;
  if (item.category_id !== void 0) output.category_id = item.category_id;
  if (item.seller_id !== void 0) output.seller_id = item.seller_id;
  if (item.catalog_product_id !== void 0) output.catalog_product_id = item.catalog_product_id;
  if (item.permalink !== void 0) output.permalink = item.permalink;
  if (item.currency_id !== void 0) output.currency_id = item.currency_id;
  if (item.shipping?.free_shipping !== void 0) output.shipping = { free_shipping: item.shipping.free_shipping };
  if (item.available_quantity !== void 0) output.available_quantity = item.available_quantity;
  if (item.sold_quantity !== void 0) output.sold_quantity = item.sold_quantity;
  if (item.user_product_id !== void 0) output.user_product_id = item.user_product_id;
  return output;
}
async function probeItems(client, candidates) {
  const details = [];
  const errors = [];
  for (const candidate of candidates.slice(0, 5)) {
    try {
      const id = assertMlbId(candidate.item_id, "item");
      const response = await client.get(`/items/${id}`);
      if (response.data) details.push(sanitizeItemDetail(response.data));
    } catch (error) {
      errors.push({ itemId: candidate.item_id, httpStatus: error instanceof MeliApiError ? error.status : 0 });
    }
  }
  return { status: details.length >= 5 ? "PASS" : details.length > 0 ? "PARTIAL" : "FAIL", details, errors };
}
async function probeMultiget(client, items) {
  const ids = items.slice(0, 20).map((item) => assertMlbId(item.id, "item"));
  if (ids.length === 0) {
    return { status: "FAIL", requested: 0, returned: 0, httpStatus: 0, durationMs: 0, approximateBytes: 0, perItemCodes: [] };
  }
  const attributes = "id,title,status,condition,category_id,seller_id,catalog_product_id,permalink,currency_id,shipping";
  const response = await client.get(
    `/items?ids=${ids.join(",")}&attributes=${attributes}`
  );
  const rows = response.data ?? [];
  const returned = rows.filter((row) => row.body?.id).length;
  return {
    status: returned === ids.length ? "PASS" : returned > 0 ? "PARTIAL" : "FAIL",
    requested: ids.length,
    returned,
    httpStatus: response.status,
    durationMs: response.durationMs,
    approximateBytes: response.approximateBytes,
    perItemCodes: rows.map((row) => row.code ?? 0)
  };
}

// src/probe/pagination.ts
async function probePagination(client, category) {
  if (!category) return [];
  const id = assertMlbId(category.id, "category");
  const pages = [];
  const limit = 10;
  for (const requestedOffset of [0, 10, 20]) {
    try {
      const response = await client.get(`/sites/MLB/search?category=${id}&limit=${limit}&offset=${requestedOffset}`);
      const page = { requestedOffset, httpStatus: response.status, returned: response.data?.results?.length ?? 0 };
      if (response.data?.paging?.total !== void 0) page.total = response.data.paging.total;
      if (response.data?.paging?.limit !== void 0) page.limit = response.data.paging.limit;
      if (response.data?.paging?.offset !== void 0) page.offset = response.data.paging.offset;
      pages.push(page);
    } catch (error) {
      pages.push({ requestedOffset, httpStatus: error instanceof MeliApiError ? error.status : 0, returned: 0 });
      break;
    }
  }
  return pages;
}

// src/report/availability.ts
function classifyAvailability(status, hasData, complete = true) {
  if (status === 403) return "FORBIDDEN" /* FORBIDDEN */;
  if (status === 404) return "NOT_FOUND" /* NOT_FOUND */;
  if (status === 405 || status === 410 || status === 501) return "UNSUPPORTED" /* UNSUPPORTED */;
  if (status >= 200 && status < 300 && hasData) {
    return complete ? "AVAILABLE" /* AVAILABLE */ : "PARTIAL" /* PARTIAL */;
  }
  if (status >= 200 && status < 300) return "NOT_AVAILABLE_FOR_THIRD_PARTY" /* NOT_AVAILABLE_FOR_THIRD_PARTY */;
  return "PARTIAL" /* PARTIAL */;
}

// src/probe/prices.ts
function normalizeSalePrice(value) {
  const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : null;
  return {
    amount: typeof value.amount === "number" ? value.amount : null,
    regular_amount: typeof value.regular_amount === "number" ? value.regular_amount : null,
    currency_id: typeof value.currency_id === "string" ? value.currency_id : null,
    reference_date: typeof value.reference_date === "string" ? value.reference_date : null,
    metadata_shape: metadata ? Object.keys(metadata).sort() : [],
    promotion_type: typeof metadata?.promotion_type === "string" ? metadata.promotion_type : null
  };
}
function normalizePrices(value) {
  return (value.prices ?? []).map((price) => ({
    type: price.type ?? "unknown",
    amount: typeof price.amount === "number" ? price.amount : null,
    regular_amount: typeof price.regular_amount === "number" ? price.regular_amount : null,
    start_time: price.conditions?.start_time ?? price.start_time ?? null,
    end_time: price.conditions?.end_time ?? price.end_time ?? null,
    last_updated: price.last_updated ?? null
  }));
}
async function capture(work) {
  try {
    return await work();
  } catch (error) {
    return { status: error instanceof MeliApiError ? error.status : 0, data: null };
  }
}
async function probePrices(client, items) {
  const results = [];
  for (const item of items.slice(0, 5)) {
    const id = assertMlbId(item.id, "item");
    const sale = await capture(() => client.get(`/items/${id}/sale_price`));
    const normalizedSale = sale.data ? normalizeSalePrice(sale.data) : null;
    const prices = client.encounteredRateLimit ? { status: 429, data: null } : await capture(() => client.get(`/items/${id}/prices`));
    const normalizedPrices = prices.data ? normalizePrices(prices.data) : [];
    results.push({
      itemId: id,
      salePrice: {
        httpStatus: sale.status,
        availability: classifyAvailability(sale.status, normalizedSale?.amount !== null && normalizedSale !== null, normalizedSale?.regular_amount !== null),
        data: normalizedSale
      },
      prices: {
        httpStatus: prices.status,
        availability: classifyAvailability(prices.status, normalizedPrices.length > 0, normalizedPrices.every((price) => price.amount !== null)),
        data: normalizedPrices
      }
    });
    if (client.encounteredRateLimit) break;
  }
  return results;
}

// src/probe/search.ts
function sellerId(item) {
  return item.seller?.id ?? item.seller_id;
}
function sanitize(item) {
  const result = { item_id: item.id };
  if (item.title !== void 0) result.title = item.title;
  const seller = sellerId(item);
  if (seller !== void 0) result.seller_id = seller;
  if (item.category_id !== void 0) result.category_id = item.category_id;
  if (item.condition !== void 0) result.condition = item.condition;
  if (item.permalink !== void 0) result.permalink = item.permalink;
  if (item.catalog_product_id !== void 0) result.catalog_product_id = item.catalog_product_id;
  if (item.shipping?.free_shipping !== void 0) result.free_shipping = item.shipping.free_shipping;
  if (item.price !== void 0) result.search_price = item.price;
  return result;
}
async function probeSearch(client, leaves, authenticatedUserId) {
  const candidates = [];
  const errors = [];
  const selected = leaves.slice(0, 3);
  for (const category of selected) {
    try {
      const id = assertMlbId(category.id, "category");
      const response = await client.get(`/sites/MLB/search?category=${id}&limit=10&offset=0`);
      candidates.push(...(response.data?.results ?? []).slice(0, 10).map(sanitize));
    } catch (error) {
      errors.push({
        categoryId: category.id,
        httpStatus: error instanceof MeliApiError ? error.status : 0,
        message: error instanceof Error ? error.message : "Falha desconhecida"
      });
    }
  }
  const thirdParty = candidates.filter((item) => item.seller_id !== void 0 && item.seller_id !== authenticatedUserId);
  return {
    status: thirdParty.length >= 5 ? "PASS" : thirdParty.length > 0 ? "PARTIAL" : "FAIL",
    categoriesTested: selected.length,
    candidates,
    thirdParty,
    errors
  };
}

// src/probe/sellers.ts
async function probeSellers(client, items) {
  const ids = [...new Set(items.flatMap((item) => typeof item.seller_id === "number" ? [item.seller_id] : []))].slice(0, 5);
  const rows = [];
  for (const sellerId2 of ids) {
    try {
      const response = await client.get(`/users/${assertSellerId(sellerId2)}`);
      const data = response.data;
      const row = { seller_id: sellerId2, http_status: response.status };
      if (data?.nickname !== void 0) row.nickname = data.nickname;
      if (data?.seller_reputation?.level_id !== void 0) row.level_id = data.seller_reputation.level_id;
      if (data?.seller_reputation?.power_seller_status !== void 0) row.power_seller_status = data.seller_reputation.power_seller_status;
      if (data?.seller_reputation?.transactions?.completed !== void 0) row.transactions_completed = data.seller_reputation.transactions.completed;
      if (data?.seller_reputation?.transactions?.ratings !== void 0) row.ratings = data.seller_reputation.transactions.ratings;
      rows.push(row);
    } catch (error) {
      rows.push({ seller_id: sellerId2, http_status: error instanceof MeliApiError ? error.status : 0 });
    }
    if (client.encounteredRateLimit) break;
  }
  return rows;
}

// src/probe/runner.ts
function formalStatus(result) {
  if (result.oauth.status !== "PASS" || result.usersMe.status !== "PASS") return "BLOCKED_0A_LIVE_OAUTH";
  if (!result.categories || result.categories.status === "FAIL") return "BLOCKED_0A_LIVE_CATEGORIES";
  if (!result.search || result.search.thirdParty.length < 5) return "BLOCKED_0A_LIVE_MARKETPLACE_SEARCH";
  if (!result.items || result.items.details.length < 5) return "BLOCKED_0A_LIVE_THIRD_PARTY_ITEMS";
  if (!result.prices.some((row) => typeof row.salePrice.data?.amount === "number")) return "BLOCKED_0A_LIVE_THIRD_PARTY_PRICE";
  if (!result.sellers.some((row) => typeof row.level_id === "string")) return "BLOCKED_0A_LIVE_SELLER_REPUTATION";
  return "PASS_0A_LIVE";
}
async function runProbe(accessToken, expectedUserId, refreshTokenReceived) {
  const client = new MeliClient({ accessToken, timeoutMs: 12e3 });
  const errors = [];
  let user = null;
  let userStatus = 0;
  try {
    const response = await client.get("/users/me");
    userStatus = response.status;
    user = response.data;
    if (user?.id !== expectedUserId) throw new Error("Identidade OAuth inconsistente");
  } catch (error) {
    userStatus = error instanceof MeliApiError ? error.status : 0;
    errors.push(error instanceof Error ? error.message : "Falha em /users/me");
  }
  let categories = null;
  let search = null;
  let items = null;
  let multiget = null;
  let prices = [];
  let sellers = [];
  let highlights = [];
  let pagination = [];
  if (user) {
    try {
      categories = await probeCategories(client);
      if (categories.root && categories.leaves.length > 0) {
        search = await probeSearch(client, categories.leaves, user.id);
        items = await probeItems(client, search.thirdParty);
        multiget = await probeMultiget(client, items.details);
        prices = await probePrices(client, items.details);
        sellers = await probeSellers(client, items.details);
        highlights = await probeHighlights(client, categories.leaves);
        pagination = await probePagination(client, categories.leaves[0]);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Falha durante probe");
    }
  }
  const partial = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    environment: process.env.VERCEL ? "Vercel" : "Node.js local",
    clientId: DEFAULT_CLIENT_ID,
    redirectUri: DEFAULT_REDIRECT_URI,
    oauth: { status: user ? "PASS" : "FAIL", refreshTokenReceived },
    usersMe: { status: userStatus === 200 && user ? "PASS" : "FAIL", httpStatus: userStatus, user },
    categories,
    search,
    items,
    multiget,
    prices,
    sellers,
    highlights,
    pagination,
    rateLimitHeaders: client.observedHeaders.filter((headers) => Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after")),
    errors
  };
  const result = { ...partial, formalStatus: formalStatus(partial) };
  const safeResult = sanitizeForReport(result);
  const markdown = renderReport(safeResult);
  if (reportContainsSecret(markdown, [accessToken])) {
    throw new Error("Relatório rejeitado pelo secret scan em memória");
  }
  return { result: safeResult, markdown };
}

// src/report/alternative-renderer.ts
function json2(value) {
  return JSON.stringify(value, null, 2);
}
function renderAlternativeReport(result) {
  const salePrice = result.prices.map((row) => ({ itemId: row.itemId, salePrice: row.salePrice }));
  const prices = result.prices.map((row) => ({ itemId: row.itemId, prices: row.prices }));
  return `# 0A-LIVE-B — Alternative Discovery

## Status formal

${result.formalStatus}

## Ambiente

- data/hora: ${result.generatedAt}
- runtime: ${process.env.VERCEL ? "Vercel" : "Node.js local"}
- Client ID: ${DEFAULT_CLIENT_ID}
- Redirect URI: ${DEFAULT_REDIRECT_URI}
- requests aproximadas: ${result.requestCount}

## OAuth

${result.oauth}

- authenticated_user_id: ${result.authenticatedUserId}

## Categorias testadas

${json2(result.categories)}

- erros de seleção: ${json2(result.categoryErrors)}

## Highlights

- USER_PRODUCT válidos: ${result.highlights.filter((row) => row.type === "USER_PRODUCT" && row.id.startsWith("MLBU")).length}
- dados: ${json2(result.highlights)}

## USER_PRODUCT

- legíveis: ${result.repeatability.readableUserProducts}
- dados sanitizados: ${json2(result.userProducts)}

## USER_PRODUCT → ITEM

- caminho oficial testado: ${result.officialPath}
- MLBU com item MLB: ${result.userProducts.filter((row) => row.itemIds.length > 0).length}
- sem resolução: ${result.userProducts.filter((row) => row.httpStatus === 200 && row.itemIds.length === 0).length}

## Item detail

- itens retornados: ${result.items.length}
- dados: ${json2(result.items)}

## Third-party confirmation

- user autenticado: ${result.authenticatedUserId}
- itens de terceiros: ${result.repeatability.thirdPartyProducts}
- sellers distintos: ${new Set(result.items.filter((item) => item.thirdParty).map((item) => item.seller_id)).size}

## sale_price

- amount disponível: ${result.repeatability.currentPrices}/${result.prices.length}
- regular_amount disponível: ${result.prices.filter((row) => typeof row.salePrice.data?.regular_amount === "number").length}/${result.prices.length}
- dados: ${json2(salePrice)}

## prices

Capacidade adicional e não bloqueante.

${json2(prices)}

## Seller reputation

- sellers com indicador: ${result.repeatability.sellersWithReputation}/${result.sellers.length}
- dados: ${json2(result.sellers)}

## Repetibilidade

${json2(result.repeatability)}

## Compliance

- somente endpoints oficiais documentados
- sem scraping, browser automation, cookies de navegador ou bypass de 403
- expansão interrompida em 429: ${result.stoppedOnRateLimit}
- headers de rate limit observados: ${json2(result.rateLimitHeaders)}

## Limitações

${result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhuma limitação adicional registrada nesta execução."}

## Conclusão técnica

${result.formalStatus}

O status se limita à cadeia alternativa oficial testada e não declara automaticamente a viabilidade geral do projeto.

## Próximo passo recomendado

Executar novamente apenas se a amostra tiver sido interrompida por erro transitório; caso contrário, decidir o próximo BUILD a partir da evidência acima.
`;
}

// src/probe/alternative.ts
var MAX_USER_PRODUCTS = 20;
var MAX_ITEM_DETAILS = 10;
var ALTERNATIVE_CATEGORY_FAMILIES = [
  { id: "MLB456111", name: "Lubrificantes e Fluidos", keywords: ["oleo", "lubrificante", "fluido", "aditivo"] },
  { id: "MLB2238", name: "Pneus e Acessórios", keywords: ["pneu", "roda", "calota"] },
  { id: "MLB22693", name: "Peças de Carros e Caminhonetes", keywords: ["freio", "filtro", "motor", "suspensao"] },
  { id: "MLB188063", name: "Limpeza Automotiva", keywords: ["limpeza", "cera", "shampoo", "polimento"] },
  { id: "MLB1747", name: "Aces. de Carros e Caminhonetes", keywords: ["tapete", "farol", "capa", "acessorio"] }
];
var EXCLUDED_CATEGORY_TERMS = ["outro", "servico", "tag de pedagio", "pedagio"];
function normalize2(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function isValidUserProductId(value) {
  return /^MLBU\d+$/.test(value);
}
function isValidItemId(value) {
  return /^MLB\d+$/.test(value);
}
function isRelevantCategoryName(name) {
  const normalized = normalize2(name);
  return !EXCLUDED_CATEGORY_TERMS.some((term) => normalized.includes(term));
}
function selectPreferredCategory(categories, keywords) {
  return [...categories].filter((category) => isRelevantCategoryName(category.name) && /^MLB\d+$/.test(category.id)).sort((left, right) => {
    const score = (category) => keywords.reduce((total, keyword, index) => total + (normalize2(category.name).includes(keyword) ? keywords.length - index : 0), 0);
    return score(right) - score(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  })[0] ?? null;
}
function deduplicateUserProducts(rows) {
  const categoriesById = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (row.type !== "USER_PRODUCT" || !isValidUserProductId(row.id)) continue;
    const categories = categoriesById.get(row.id) ?? /* @__PURE__ */ new Set();
    categories.add(row.categoryId);
    categoriesById.set(row.id, categories);
  }
  return [...categoriesById].slice(0, MAX_USER_PRODUCTS).map(([id, categories]) => ({ id, sourceCategories: [...categories] }));
}
function isThirdPartySeller(sellerId2, authenticatedUserId) {
  return sellerId2 !== null && sellerId2 !== void 0 && /^\d+$/.test(String(sellerId2)) && String(sellerId2) !== String(authenticatedUserId);
}
function classifyUserProduct(fetched, sellerId2, itemIds) {
  if (!fetched) return "USER_PRODUCT_FETCH_FAILED";
  if (sellerId2 && itemIds.length > 0) return "USER_PRODUCT_WITH_SELLER_AND_ITEM";
  if (sellerId2) return "USER_PRODUCT_WITH_SELLER_NO_ITEM";
  if (itemIds.length > 0) return "USER_PRODUCT_WITH_ITEM_NO_SELLER";
  return "USER_PRODUCT_METADATA_ONLY";
}
function httpStatusOf(error) {
  return error instanceof MeliApiError ? error.status : 0;
}
function classifyAlternativeStatus(input) {
  if (input.highlightCount === 0 || input.readableUserProducts === 0) return "BLOCKED_0A_LIVE_ALTERNATIVE_DISCOVERY";
  if (input.resolvedUserProducts === 0) return "BLOCKED_0A_LIVE_USER_PRODUCT_TO_ITEM";
  if (input.itemCount > 0 && input.thirdPartyCount > 0 && input.currentPriceCount === 0) {
    return "BLOCKED_0A_LIVE_THIRD_PARTY_PRICE";
  }
  if (input.completeCategoryCount >= 3 && input.resolvedUserProducts >= 3 && input.thirdPartyCount >= 3 && input.currentPriceCount >= 3 && input.sellersWithReputation > 0) {
    return "PASS_0A_LIVE_ALTERNATIVE_DISCOVERY";
  }
  return "PARTIAL_0A_LIVE_ALTERNATIVE_DISCOVERY";
}
async function selectLeafCategories(client) {
  const selected = [];
  const errors = [];
  for (const family of ALTERNATIVE_CATEGORY_FAMILIES) {
    let current = { id: family.id, name: family.name };
    let found = false;
    try {
      for (let depth = 0; depth < 8; depth += 1) {
        const response = await client.get(`/categories/${assertMlbId(current.id, "category")}`);
        const detail = response.data;
        if (!detail) throw new Error("Categoria sem payload");
        const children = detail.children_categories ?? [];
        if (children.length === 0) {
          if (!isRelevantCategoryName(detail.name ?? current.name)) throw new Error("Categoria folha excluída");
          selected.push({ rootId: family.id, rootName: family.name, categoryId: detail.id, categoryName: detail.name });
          found = true;
          break;
        }
        const next = selectPreferredCategory(children, family.keywords);
        if (!next) throw new Error("Sem subcategoria física relevante");
        current = next;
      }
      if (!found) errors.push({ rootId: family.id, httpStatus: 0 });
    } catch (error) {
      errors.push({ rootId: family.id, httpStatus: httpStatusOf(error) });
    }
    if (client.encounteredRateLimit) break;
  }
  return { selected, errors };
}
async function probeAlternativeHighlights(client, categories) {
  const output = [];
  for (const category of categories) {
    try {
      const response = await client.get(
        `/highlights/MLB/category/${assertMlbId(category.categoryId, "category")}`
      );
      for (const row of (response.data?.content ?? []).slice(0, 20)) {
        if (typeof row.id !== "string" || typeof row.type !== "string") continue;
        output.push({
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          httpStatus: response.status,
          id: row.id,
          type: row.type,
          position: typeof row.position === "number" ? row.position : null
        });
      }
    } catch (error) {
      output.push({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        httpStatus: httpStatusOf(error),
        id: "",
        type: "ERROR",
        position: null
      });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}
async function probeUserProducts(client, highlights) {
  const output = [];
  for (const candidate of deduplicateUserProducts(highlights)) {
    const base = {
      id: candidate.id,
      sourceCategories: candidate.sourceCategories,
      httpStatus: 0,
      relationHttpStatus: 0,
      name: null,
      familyName: null,
      familyId: null,
      domainId: null,
      sellerId: null,
      attributeCount: 0,
      itemIds: [],
      classification: "USER_PRODUCT_FETCH_FAILED"
    };
    try {
      const id = assertUserProductId(candidate.id);
      const response = await client.get(`/user-products/${id}`);
      const data = response.data;
      base.httpStatus = response.status;
      if (!data) throw new Error("User Product sem payload");
      base.name = typeof data.name === "string" ? data.name : null;
      base.familyName = typeof data.family_name === "string" ? data.family_name : null;
      base.familyId = data.family_id === null || data.family_id === void 0 ? null : String(data.family_id);
      base.domainId = typeof data.domain_id === "string" ? data.domain_id : null;
      base.sellerId = data.user_id === void 0 ? null : String(data.user_id);
      base.attributeCount = Array.isArray(data.attributes) ? data.attributes.length : 0;
      if (base.sellerId) {
        try {
          const relation = await client.get(
            `/users/${assertSellerId(base.sellerId)}/items/search?user_product_id=${encodeURIComponent(id)}`
          );
          base.relationHttpStatus = relation.status;
          base.itemIds = [...new Set((relation.data?.results ?? []).filter(isValidItemId))].slice(0, 5);
        } catch (error) {
          base.relationHttpStatus = httpStatusOf(error);
        }
      }
      base.classification = classifyUserProduct(true, base.sellerId, base.itemIds);
    } catch (error) {
      base.httpStatus = httpStatusOf(error);
      base.classification = classifyUserProduct(false, null, []);
    }
    output.push(base);
    if (client.encounteredRateLimit) break;
  }
  return output;
}
async function probeResolvedItems(client, userProducts, authenticatedUserId) {
  const candidates = userProducts.flatMap((up) => up.itemIds.slice(0, 1).map((itemId) => ({ itemId, up }))).filter((candidate, index, rows) => rows.findIndex((row) => row.itemId === candidate.itemId) === index).slice(0, MAX_ITEM_DETAILS);
  const output = [];
  for (const candidate of candidates) {
    try {
      const response = await client.get(`/items/${assertMlbId(candidate.itemId, "item")}`);
      if (!response.data) continue;
      const item = sanitizeItemDetail(response.data);
      if (candidate.up.sellerId && String(item.seller_id ?? "") !== candidate.up.sellerId) continue;
      output.push({
        ...item,
        sourceUserProductId: candidate.up.id,
        sourceCategoryIds: candidate.up.sourceCategories,
        httpStatus: response.status,
        thirdParty: isThirdPartySeller(item.seller_id, authenticatedUserId)
      });
    } catch {
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}
function hasSellerReputation(row) {
  return typeof row.level_id === "string" || typeof row.power_seller_status === "string" || typeof row.transactions_completed === "number" || row.ratings !== void 0;
}
async function runAlternativeDiscoveryProbe(accessToken, authenticatedUserId) {
  const client = new MeliClient({ accessToken, timeoutMs: 12e3 });
  const errors = [];
  const categoryProbe = await selectLeafCategories(client);
  await sleep(100);
  const highlights = await probeAlternativeHighlights(client, categoryProbe.selected);
  await sleep(100);
  const userProducts = await probeUserProducts(client, highlights);
  await sleep(100);
  const items = await probeResolvedItems(client, userProducts, authenticatedUserId);
  await sleep(100);
  const thirdPartyItems = items.filter((item) => item.thirdParty);
  const prices = client.encounteredRateLimit ? [] : await probePrices(client, thirdPartyItems);
  await sleep(100);
  const sellers = client.encounteredRateLimit ? [] : await probeSellers(client, thirdPartyItems);
  const pricedItemIds = new Set(
    prices.filter((row) => typeof row.salePrice.data?.amount === "number" && row.salePrice.data.amount > 0).map((row) => row.itemId)
  );
  const completeCategories = new Set(
    thirdPartyItems.flatMap((item) => pricedItemIds.has(item.id) ? item.sourceCategoryIds : [])
  );
  const readableUserProducts = userProducts.filter((row) => row.httpStatus === 200).length;
  const resolvedUserProducts = userProducts.filter((row) => row.itemIds.length > 0).length;
  const sellersWithReputation = sellers.filter(hasSellerReputation).length;
  const counts = {
    highlightCount: highlights.filter((row) => row.type === "USER_PRODUCT" && isValidUserProductId(row.id)).length,
    readableUserProducts,
    resolvedUserProducts,
    itemCount: items.length,
    thirdPartyCount: thirdPartyItems.length,
    currentPriceCount: pricedItemIds.size,
    completeCategoryCount: completeCategories.size,
    sellersWithReputation
  };
  if (client.encounteredRateLimit) errors.push("HTTP 429 observado; expansão da amostra interrompida.");
  if (readableUserProducts > 0 && resolvedUserProducts === 0) {
    errors.push("USER_PRODUCT_TO_ITEM_OFFICIAL_PATH_NOT_FOUND na amostra executada.");
  }
  const result = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    formalStatus: classifyAlternativeStatus(counts),
    oauth: "PASS",
    authenticatedUserId,
    categories: categoryProbe.selected,
    categoryErrors: categoryProbe.errors,
    highlights,
    userProducts,
    items,
    prices,
    sellers,
    repeatability: {
      categoriesWithCompleteChain: completeCategories.size,
      readableUserProducts,
      thirdPartyProducts: thirdPartyItems.length,
      currentPrices: pricedItemIds.size,
      sellersWithReputation
    },
    officialPath: "CATEGORY → HIGHLIGHTS → USER_PRODUCT → /users/{seller}/items/search?user_product_id → ITEM → SALE_PRICE → SELLER",
    requestCount: client.requestCount,
    rateLimitHeaders: client.observedHeaders.filter(
      (headers) => Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after")
    ),
    stoppedOnRateLimit: client.encounteredRateLimit,
    errors
  };
  const safe = sanitizeForReport(result);
  const markdown = renderAlternativeReport(safe);
  if (reportContainsSecret(markdown, [accessToken])) throw new Error("Resultado 0A-LIVE-B rejeitado pelo secret scan");
  return { result: safe, markdown };
}

// src/report/direct-item-renderer.ts
function json3(value) {
  return JSON.stringify(value, null, 2);
}
function renderDirectItemReport(result) {
  return `# 0A-LIVE-C — Direct ITEM Discovery

## Status formal

${result.formalStatus}

## Ambiente

- data/hora: ${result.generatedAt}
- runtime: ${process.env.VERCEL ? "Vercel" : "Node.js local"}
- Client ID: ${DEFAULT_CLIENT_ID}
- Redirect URI: ${DEFAULT_REDIRECT_URI}
- requests aproximadas: ${result.requestCount}

## OAuth

${result.oauth}

- authenticated_user_id: ${result.authenticatedUserId}

## Categorias testadas

${json3(result.highlightAttempts.map((attempt) => ({
    rootId: attempt.rootId,
    rootName: attempt.rootName,
    categoryId: attempt.categoryId,
    categoryName: attempt.categoryName,
    httpStatus: attempt.httpStatus
  })))}

## Highlights

- ITEM: ${result.highlightTypeCounts.ITEM}
- PRODUCT: ${result.highlightTypeCounts.PRODUCT}
- USER_PRODUCT: ${result.highlightTypeCounts.USER_PRODUCT}
- outros: ${result.highlightTypeCounts.OTHER}
- tentativas: ${json3(result.highlightAttempts)}

## Direct ITEM candidates

- candidatos únicos: ${result.candidates.length}
- dados: ${json3(result.candidates)}

## Item detail

- PASS_ITEM_DETAIL: ${result.repeatability.itemDetailsPass}/${result.itemDetails.length}
- dados: ${json3(result.itemDetails)}

## Third-party confirmation

- user autenticado: ${result.authenticatedUserId}
- itens de terceiros: ${result.repeatability.thirdPartyItems}
- sellers distintos: ${new Set(
    result.itemDetails.flatMap((row) => row.thirdParty && row.data?.seller_id ? [row.data.seller_id] : [])
  ).size}

## sale_price

- CURRENT_PRICE_PASS: ${result.repeatability.currentPrices}/${result.prices.length}
- regular_amount disponível: ${result.prices.filter((row) => typeof row.salePrice.data?.regular_amount === "number").length}/${result.prices.length}
- dados: ${json3(result.prices.map((row) => ({ itemId: row.itemId, salePrice: row.salePrice })))}

## prices

Recurso adicional e não bloqueante.

${json3(result.prices.map((row) => ({ itemId: row.itemId, prices: row.prices })))}

## Seller reputation

- sellers com indicador público: ${result.repeatability.sellersWithReputation}/${result.sellers.length}
- dados: ${json3(result.sellers)}

## Repetibilidade

${json3(result.repeatability)}

## PRODUCT observations

${json3(result.productObservations)}

## Compliance

- somente OAuth e APIs oficiais documentadas
- PRODUCT e USER_PRODUCT não foram tratados como ITEM
- sem scraping, browser automation, endpoint privado ou bypass de 403
- expansão interrompida após 429: ${result.stoppedOnRateLimit}
- headers de rate limit: ${json3(result.rateLimitHeaders)}

## Limitações

${result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "Nenhuma limitação adicional registrada nesta execução."}

## Conclusão técnica

${result.formalStatus}

Este status se limita à ramificação Direct ITEM Discovery e não altera automaticamente a decisão global do AutoAchado.AI.

## Próximo passo recomendado

Usar a evidência desta execução para decidir se a ramificação direta é repetível ou se a observação PRODUCT deve ser estudada separadamente em um eventual 0A-LIVE-D.
`;
}

// src/probe/direct-items.ts
var MAX_LEAVES_PER_FAMILY = 3;
var MAX_CATEGORY_NODES_PER_FAMILY = 14;
var MAX_DIRECT_ITEM_CANDIDATES = 20;
var MAX_ITEM_DETAILS2 = 10;
var MAX_SELLERS = 5;
var EXTRA_PREFERENCES = {
  MLB456111: ["oleo", "fluido", "aditivo", "lubrificante"],
  MLB2238: ["pneus para carros", "passeio", "automotivo", "pneu"],
  MLB22693: ["filtro", "freio", "suspensao", "motor"],
  MLB188063: ["cera", "shampoo", "limpeza", "polimento"],
  MLB1747: ["tapete", "capa", "iluminacao", "acessorio"]
};
function normalize3(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function isValidDirectItemId(value) {
  return /^MLB\d+$/.test(value);
}
function isDirectItemHighlight(row) {
  return row.type === "ITEM" && isValidDirectItemId(row.id);
}
function deduplicateDirectItems(attempts) {
  const byId = /* @__PURE__ */ new Map();
  for (const attempt of attempts) {
    for (const row of attempt.content) {
      if (!isDirectItemHighlight(row)) continue;
      const evidence = byId.get(row.id) ?? { categories: /* @__PURE__ */ new Set(), positions: /* @__PURE__ */ new Set() };
      evidence.categories.add(attempt.categoryId);
      if (row.position !== null) evidence.positions.add(row.position);
      byId.set(row.id, evidence);
    }
  }
  return [...byId].slice(0, MAX_DIRECT_ITEM_CANDIDATES).map(([itemId, evidence]) => ({ itemId, sourceCategoryIds: [...evidence.categories], positions: [...evidence.positions] }));
}
function isDirectThirdParty(sellerId2, authenticatedUserId) {
  return typeof sellerId2 === "number" && sellerId2 !== authenticatedUserId;
}
function isItemDetailPass(row) {
  return row.httpStatus === 200 && row.data !== null && isValidDirectItemId(row.data.id) && typeof row.data.seller_id === "number";
}
function isCurrentPricePass(row) {
  return typeof row.salePrice.data?.amount === "number" && row.salePrice.data.amount > 0;
}
function hasDirectSellerReputation(row) {
  return typeof row.levelId === "string" || typeof row.powerSellerStatus === "string" || typeof row.transactionsCompleted === "number" || row.ratings !== null;
}
function shouldTryNextLeaf(httpStatus) {
  return httpStatus !== 200 && httpStatus !== 429;
}
function classifyDirectItemStatus(input) {
  if (input.directItemCandidates < 3) return "BLOCKED_0A_LIVE_NO_DIRECT_ITEMS";
  if (input.itemDetailsPass === 0) return "BLOCKED_0A_LIVE_DIRECT_ITEM_DETAIL";
  if (input.thirdPartyItems > 0 && input.currentPrices === 0) return "BLOCKED_0A_LIVE_DIRECT_ITEM_PRICE";
  if (input.highlights200Categories >= 2 && input.itemDetailsPass >= 3 && input.thirdPartyItems >= 3 && input.currentPrices >= 3 && input.sellersWithReputation >= 1) {
    return "PASS_0A_LIVE_DIRECT_ITEM_DISCOVERY";
  }
  return "PARTIAL_0A_LIVE_DIRECT_ITEM_DISCOVERY";
}
function rankCategories(categories, rootId) {
  const preferences = EXTRA_PREFERENCES[rootId] ?? [];
  const score = (category) => {
    const name = normalize3(category.name);
    const positive = preferences.reduce(
      (total, keyword, index) => total + (name.includes(keyword) ? (preferences.length - index) * 10 : 0),
      0
    );
    const agriculturalPenalty = name.includes("agricola") ? 100 : 0;
    return positive - agriculturalPenalty;
  };
  return [...categories].filter((category) => isRelevantCategoryName(category.name) && isValidDirectItemId(category.id)).sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}
async function discoverLeafCandidates(client, family) {
  const queue = [{ id: family.id, name: family.name }];
  const visited = /* @__PURE__ */ new Set();
  const leaves = [];
  while (queue.length > 0 && leaves.length < MAX_LEAVES_PER_FAMILY && visited.size < MAX_CATEGORY_NODES_PER_FAMILY && !client.encounteredRateLimit) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    try {
      const response = await client.get(`/categories/${assertMlbId(next.id, "category")}`);
      const detail = response.data;
      if (!detail) continue;
      const children = detail.children_categories ?? [];
      if (children.length === 0) {
        if (isRelevantCategoryName(detail.name)) leaves.push({ id: detail.id, name: detail.name });
      } else {
        queue.push(...rankCategories(children, family.id));
      }
    } catch {
    }
  }
  return leaves;
}
async function probeHighlightsWithFallback(client, family, leaves) {
  const attempts = [];
  for (const leaf of leaves.slice(0, MAX_LEAVES_PER_FAMILY)) {
    try {
      const response = await client.get(
        `/highlights/MLB/category/${assertMlbId(leaf.id, "category")}`
      );
      attempts.push({
        rootId: family.id,
        rootName: family.name,
        categoryId: leaf.id,
        categoryName: leaf.name,
        httpStatus: response.status,
        content: (response.data?.content ?? []).slice(0, 20).flatMap(
          (row) => typeof row.id === "string" && typeof row.type === "string" ? [{ id: row.id, type: row.type, position: typeof row.position === "number" ? row.position : null }] : []
        )
      });
      break;
    } catch (error) {
      const status = error instanceof MeliApiError ? error.status : 0;
      attempts.push({
        rootId: family.id,
        rootName: family.name,
        categoryId: leaf.id,
        categoryName: leaf.name,
        httpStatus: status,
        content: []
      });
      if (!shouldTryNextLeaf(status)) break;
    }
  }
  return attempts;
}
function sanitizeDirectItem(item) {
  const output = { id: item.id };
  const keys = [
    "title",
    "seller_id",
    "category_id",
    "price",
    "base_price",
    "original_price",
    "currency_id",
    "condition",
    "status",
    "catalog_product_id",
    "permalink",
    "available_quantity",
    "sold_quantity"
  ];
  for (const key of keys) {
    if (item[key] !== void 0) Object.assign(output, { [key]: item[key] });
  }
  return output;
}
async function probeDirectItemDetails(client, candidates, authenticatedUserId) {
  const output = [];
  for (const candidate of candidates.slice(0, MAX_ITEM_DETAILS2)) {
    try {
      const response = await client.get(`/items/${assertMlbId(candidate.itemId, "item")}`);
      const data = response.data ? sanitizeDirectItem(response.data) : null;
      output.push({
        itemId: candidate.itemId,
        sourceCategoryIds: candidate.sourceCategoryIds,
        httpStatus: response.status,
        data,
        thirdParty: isDirectThirdParty(data?.seller_id, authenticatedUserId)
      });
    } catch (error) {
      output.push({
        itemId: candidate.itemId,
        sourceCategoryIds: candidate.sourceCategoryIds,
        httpStatus: error instanceof MeliApiError ? error.status : 0,
        data: null,
        thirdParty: false
      });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}
async function probeDirectSellers(client, items) {
  const sellerIds = [...new Set(items.flatMap((item) => item.thirdParty && item.data?.seller_id ? [item.data.seller_id] : []))].slice(
    0,
    MAX_SELLERS
  );
  const output = [];
  for (const sellerId2 of sellerIds) {
    try {
      const response = await client.get(`/users/${assertSellerId(sellerId2)}`);
      const data = response.data;
      output.push({
        sellerId: sellerId2,
        httpStatus: response.status,
        nickname: typeof data?.nickname === "string" ? data.nickname : null,
        levelId: typeof data?.seller_reputation?.level_id === "string" ? data.seller_reputation.level_id : null,
        powerSellerStatus: typeof data?.seller_reputation?.power_seller_status === "string" ? data.seller_reputation.power_seller_status : null,
        transactionsCompleted: typeof data?.seller_reputation?.transactions?.completed === "number" ? data.seller_reputation.transactions.completed : null,
        ratings: data?.seller_reputation?.transactions?.ratings ?? null,
        siteStatus: typeof data?.status?.site_status === "string" ? data.status.site_status : null
      });
    } catch (error) {
      output.push({
        sellerId: sellerId2,
        httpStatus: error instanceof MeliApiError ? error.status : 0,
        nickname: null,
        levelId: null,
        powerSellerStatus: null,
        transactionsCompleted: null,
        ratings: null,
        siteStatus: null
      });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}
function countHighlightTypes(attempts) {
  const counts = { ITEM: 0, PRODUCT: 0, USER_PRODUCT: 0, OTHER: 0 };
  for (const row of attempts.flatMap((attempt) => attempt.content)) {
    if (row.type === "ITEM" || row.type === "PRODUCT" || row.type === "USER_PRODUCT") counts[row.type] += 1;
    else counts.OTHER += 1;
  }
  return counts;
}
async function runDirectItemDiscoveryProbe(accessToken, authenticatedUserId) {
  const client = new MeliClient({ accessToken, timeoutMs: 12e3 });
  const highlightAttempts = [];
  const errors = [];
  for (const family of ALTERNATIVE_CATEGORY_FAMILIES) {
    const leaves = await discoverLeafCandidates(client, family);
    highlightAttempts.push(...await probeHighlightsWithFallback(client, family, leaves));
    if (client.encounteredRateLimit) break;
  }
  await sleep(100);
  const candidates = deduplicateDirectItems(highlightAttempts);
  const itemDetails = await probeDirectItemDetails(client, candidates, authenticatedUserId);
  await sleep(100);
  const thirdPartyItems = itemDetails.filter((row) => isItemDetailPass(row) && row.thirdParty && row.data);
  const priceInput = thirdPartyItems.flatMap((row) => row.data ? [row.data] : []);
  const prices = client.encounteredRateLimit ? [] : await probePrices(client, priceInput);
  await sleep(100);
  const sellers = client.encounteredRateLimit ? [] : await probeDirectSellers(client, thirdPartyItems);
  const counts = {
    highlights200Categories: new Set(
      highlightAttempts.filter((attempt) => attempt.httpStatus === 200).map((attempt) => attempt.categoryId)
    ).size,
    directItemCandidates: candidates.length,
    itemDetailsPass: itemDetails.filter(isItemDetailPass).length,
    thirdPartyItems: thirdPartyItems.length,
    currentPrices: prices.filter(isCurrentPricePass).length,
    sellersWithReputation: sellers.filter(hasDirectSellerReputation).length
  };
  if (client.encounteredRateLimit) errors.push("HTTP 429 observado; expansão da amostra interrompida.");
  const highlightTypeCounts = countHighlightTypes(highlightAttempts);
  const result = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    formalStatus: classifyDirectItemStatus(counts),
    oauth: "PASS",
    authenticatedUserId,
    highlightAttempts,
    highlightTypeCounts,
    candidates,
    itemDetails,
    prices,
    sellers,
    repeatability: counts,
    productObservations: {
      count: highlightTypeCounts.PRODUCT,
      action: "OBSERVED_ONLY",
      note: "PRODUCT é catálogo oficial e não foi tratado como ITEM. Uma eventual resolução oficial fica adiada para 0A-LIVE-D."
    },
    requestCount: client.requestCount,
    rateLimitHeaders: client.observedHeaders.filter(
      (headers) => Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after")
    ),
    stoppedOnRateLimit: client.encounteredRateLimit,
    errors
  };
  const safe = sanitizeForReport(result);
  const markdown = renderDirectItemReport(safe);
  if (reportContainsSecret(markdown, [accessToken])) throw new Error("Relatório 0A-LIVE-C rejeitado pelo secret scan");
  return { result: safe, markdown };
}

// src/ui/pages.ts
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function layout(content) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoAchado API Probe</title><style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#17202a}h1{margin-bottom:4px}a,button{display:inline-block;background:#1769aa;color:#fff;border:0;border-radius:8px;padding:12px 16px;text-decoration:none;font-weight:650;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f9;padding:16px;border-radius:8px}section{margin:28px 0}.muted{color:#667}</style></head><body>${content}</body></html>`;
}
function homePage(connected, userLabel) {
  return layout(`<h1>AutoAchado.AI</h1><p class="muted">API Feasibility Probe</p>${connected ? `<section><p>Mercado Livre conectado ✅</p><p>${escapeHtml(userLabel ?? "Usuário autenticado")}</p><form method="post" action="/probe"><button type="submit">Executar 0A-LIVE</button></form><form method="post" action="/probe/alternative"><button type="submit">Executar 0A-LIVE-B</button></form><form method="post" action="/probe/direct-items"><button type="submit">Executar 0A-LIVE-C</button></form></section>` : `<section><a href="/auth/start">Conectar Mercado Livre</a></section>`}`);
}
function icon(status) {
  return status === "PASS" || status === "AVAILABLE" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
}
function probePage(result, markdown) {
  const priceOk = result.prices.some((row) => typeof row.salePrice.data?.amount === "number");
  const reputationOk = result.sellers.some((row) => typeof row.level_id === "string");
  const highlightsOk = result.highlights.some((row) => row.content.length > 0);
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>OAuth ${icon(result.oauth.status)}</p><p>Categorias ${icon(result.categories?.status ?? "FAIL")}</p><p>Busca de terceiros ${icon(result.search?.status ?? "FAIL")}</p><p>Preço ${priceOk ? "✅" : "⚠️"}</p><p>Reputação ${reputationOk ? "✅" : "⚠️"}</p><p>Highlights ${highlightsOk ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}
function alternativeProbePage(result, markdown) {
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE-B</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>Categorias ${result.categories.length >= 5 ? "✅" : "⚠️"}</p><p>Highlights ${result.highlights.some((row) => row.type === "USER_PRODUCT") ? "✅" : "⚠️"}</p><p>MLBU → MLB ${result.userProducts.some((row) => row.itemIds.length > 0) ? "✅" : "⚠️"}</p><p>Terceiros ${result.repeatability.thirdPartyProducts >= 3 ? "✅" : "⚠️"}</p><p>Preço ${result.repeatability.currentPrices >= 3 ? "✅" : "⚠️"}</p><p>Reputação ${result.repeatability.sellersWithReputation > 0 ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-B-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}
function directItemProbePage(result, markdown) {
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
  return layout(`<h1>AutoAchado.AI — resultado 0A-LIVE-C</h1><section><p><strong>${escapeHtml(result.formalStatus)}</strong></p><p>Highlights 200 ${result.repeatability.highlights200Categories >= 2 ? "✅" : "⚠️"}</p><p>ITEM direto ${result.repeatability.directItemCandidates >= 3 ? "✅" : "⚠️"}</p><p>Detalhes ${result.repeatability.itemDetailsPass >= 3 ? "✅" : "⚠️"}</p><p>Terceiros ${result.repeatability.thirdPartyItems >= 3 ? "✅" : "⚠️"}</p><p>Preço ${result.repeatability.currentPrices >= 3 ? "✅" : "⚠️"}</p><p>Reputação ${result.repeatability.sellersWithReputation > 0 ? "✅" : "⚠️"}</p></section><section><a download="0A-LIVE-C-report.md" href="${escapeHtml(dataUrl)}">Baixar relatório</a></section><details><summary>Ver relatório</summary><pre>${escapeHtml(markdown)}</pre></details>`);
}
function errorPage(title, message) {
  return layout(`<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Voltar</a></p>`);
}

// src/app.ts
function errorMessage(error) {
  return redactText(error instanceof Error ? error.message : "Falha inesperada");
}
async function handleRequest(request, response) {
  const url = requestUrl(request);
  const method = request.method ?? "GET";
  if (method === "GET" && url.pathname === "/") {
    try {
      const config = loadConfig();
      const session = readTokenSession(request.headers.cookie, config.sessionSecret);
      sendHtml(response, 200, homePage(Boolean(session), session ? `${session.nickname ?? "user_id"}: ${session.userId}` : void 0));
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
      const meResponse = await client.get("/users/me");
      if (meResponse.status !== 200 || !meResponse.data?.id || meResponse.data.id !== token.user_id) {
        throw new Error("OAuth concluído, mas /users/me não confirmou a identidade");
      }
      const session = {
        accessToken: token.access_token,
        userId: token.user_id,
        expiresAt: Date.now() + token.expires_in * 1e3
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
        Boolean(session.refreshToken)
      );
      sendHtml(response, 200, probePage(result, markdown));
    } catch (error) {
      sendHtml(response, 500, errorPage("Probe não concluído", errorMessage(error)));
    }
    return;
  }
  if (method === "POST" && url.pathname === "/probe/alternative") {
    try {
      const config = loadConfig();
      const session = readTokenSession(request.headers.cookie, config.sessionSecret);
      if (!session) {
        sendHtml(response, 401, errorPage("Sessão expirada", "Conecte novamente ao Mercado Livre."));
        return;
      }
      const { result, markdown } = await runAlternativeDiscoveryProbe(session.accessToken, session.userId);
      sendHtml(response, 200, alternativeProbePage(result, markdown));
    } catch (error) {
      sendHtml(response, 500, errorPage("Probe 0A-LIVE-B não concluído", errorMessage(error)));
    }
    return;
  }
  if (method === "POST" && url.pathname === "/probe/direct-items") {
    try {
      const config = loadConfig();
      const session = readTokenSession(request.headers.cookie, config.sessionSecret);
      if (!session) {
        sendHtml(response, 401, errorPage("Sessão expirada", "Conecte novamente ao Mercado Livre."));
        return;
      }
      const { result, markdown } = await runDirectItemDiscoveryProbe(session.accessToken, session.userId);
      sendHtml(response, 200, directItemProbePage(result, markdown));
    } catch (error) {
      sendHtml(response, 500, errorPage("Probe 0A-LIVE-C não concluído", errorMessage(error)));
    }
    return;
  }
  if (method === "GET" && (url.pathname === "/report" || url.pathname === "/report.md")) {
    sendHtml(response, 404, errorPage("Relatório não persistido", "Execute o 0A-LIVE e baixe o relatório sanitizado na mesma resposta."));
    return;
  }
  sendHtml(response, 404, errorPage("Não encontrado", "Rota inexistente."));
}

// src/vercel-handler.ts
async function handler(request, response) {
  await handleRequest(request, response);
}
export {
  handler as default
};
