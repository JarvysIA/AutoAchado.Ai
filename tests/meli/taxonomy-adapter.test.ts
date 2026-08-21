import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  MeliTaxonomyAdapter,
  TAXONOMY_LIMITS,
} from "../../src/meli/taxonomy-adapter.js";
import { TaxonomyError } from "../../src/taxonomy/errors.js";
import {
  categoryDetailPayload,
  siteCategoriesPayload,
  TEST_ROOT_ID,
  validAutomotiveDump,
} from "../fixtures/meli-taxonomy.js";

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } },
);

describe("adapter Mercado Livre de taxonomia", () => {
  it("aceita MLB, usa somente GET e monta os três endpoints oficiais", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(siteCategoriesPayload))
      .mockResolvedValueOnce(jsonResponse(categoryDetailPayload))
      .mockResolvedValueOnce(jsonResponse(validAutomotiveDump()));
    const adapter = new MeliTaxonomyAdapter({ fetchImpl, clock: () => new Date("2026-08-21T12:00:00.000Z") });

    await adapter.listSiteCategories("MLB");
    await adapter.fetchCategory("MLB900000001");
    await adapter.fetchCategoryTree("MLB");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe("https://api.mercadolibre.com/sites/MLB/categories");
    expect(String(fetchImpl.mock.calls[1]![0])).toBe("https://api.mercadolibre.com/categories/MLB900000001");
    expect(String(fetchImpl.mock.calls[2]![0])).toBe("https://api.mercadolibre.com/sites/MLB/categories/all");
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]?.method).toBe("GET");
      expect(call[1]?.redirect).toBe("manual");
    }
  });

  it("rejeita outro site e ID fora da allowlist antes do fetch", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new MeliTaxonomyAdapter({ fetchImpl });
    await expect(adapter.listSiteCategories("MLA")).rejects.toMatchObject({ code: "TAXONOMY_UNSUPPORTED_SITE" });
    await expect(adapter.fetchCategory("https://example.com/MLB1")).rejects.toMatchObject({ code: "TAXONOMY_INVALID_RESPONSE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejeita detalhe cujo ID não corresponde à categoria solicitada", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      ...categoryDetailPayload,
      id: "MLB900000099",
    }));
    await expect(new MeliTaxonomyAdapter({ fetchImpl }).fetchCategory("MLB900000001"))
      .rejects.toMatchObject({ code: "TAXONOMY_INVALID_RESPONSE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("omite Authorization sem token e usa Bearer opcional somente no request", async () => {
    const noAuthFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(siteCategoriesPayload));
    await new MeliTaxonomyAdapter({ fetchImpl: noAuthFetch }).listSiteCategories("MLB");
    const noAuthHeaders = new Headers(noAuthFetch.mock.calls[0]![1]?.headers);
    expect(noAuthHeaders.has("authorization")).toBe(false);

    const token = "fake-taxonomy-bearer-canary";
    const authFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(siteCategoriesPayload));
    await new MeliTaxonomyAdapter({ fetchImpl: authFetch, getAccessToken: async () => token }).listSiteCategories("MLB");
    const authHeaders = new Headers(authFetch.mock.calls[0]![1]?.headers);
    expect(authHeaders.get("authorization")).toBe(`Bearer ${token}`);
    expect(authHeaders.get("user-agent")).toBe("AutoAchado.AI/Taxonomy-0B3B1");
  });

  it.each([401, 403, 404])("não repete HTTP %s nem lê body sensível", async (status) => {
    const token = "fake-taxonomy-secret-canary";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ token }, status));
    const adapter = new MeliTaxonomyAdapter({ fetchImpl, getAccessToken: async () => token });
    let captured: unknown;
    try {
      await adapter.listSiteCategories("MLB");
    } catch (error) {
      captured = error;
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(captured).toBeInstanceOf(TaxonomyError);
    expect(JSON.stringify(captured)).not.toContain(token);
    expect(String(captured)).not.toContain(token);
  });

  it("repete 500, 500, 200 exatamente três vezes", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(siteCategoriesPayload));
    const sleepImpl = vi.fn(async () => undefined);
    const adapter = new MeliTaxonomyAdapter({ fetchImpl, sleepImpl, randomImpl: () => 0 });
    await expect(adapter.listSiteCategories("MLB")).resolves.toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
  });

  it("respeita Retry-After no 429 e encerra após o limite", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonResponse(siteCategoriesPayload));
    const sleepImpl = vi.fn(async () => undefined);
    const adapter = new MeliTaxonomyAdapter({ fetchImpl, sleepImpl });
    await adapter.listSiteCategories("MLB");
    expect(sleepImpl).toHaveBeenCalledWith(2_000);

    const alwaysLimited = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 429));
    await expect(new MeliTaxonomyAdapter({ fetchImpl: alwaysLimited, sleepImpl }).listSiteCategories("MLB"))
      .rejects.toMatchObject({ code: "TAXONOMY_RATE_LIMITED" });
    expect(alwaysLimited).toHaveBeenCalledTimes(TAXONOMY_LIMITS.maxAttempts);
  });

  it("repete timeout de forma limitada e retorna erro tipado", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("synthetic timeout");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }));
    const adapter = new MeliTaxonomyAdapter({
      fetchImpl,
      sleepImpl: async () => undefined,
      limits: { pointTimeoutMs: 1 },
    });
    await expect(adapter.listSiteCategories("MLB")).rejects.toMatchObject({ code: "TAXONOMY_TIMEOUT" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejeita MIME inválido, payload vazio e JSON inválido sem retry", async () => {
    const cases = [
      new Response("<html>erro</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      new Response("", { status: 200, headers: { "Content-Type": "application/json" } }),
      new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
    ];
    for (const response of cases) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(new MeliTaxonomyAdapter({ fetchImpl }).listSiteCategories("MLB"))
        .rejects.toMatchObject({ code: "TAXONOMY_INVALID_RESPONSE" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("rejeita Content-Encoding não suportado sem tentar interpretar o corpo", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(siteCategoriesPayload), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Encoding": "br" },
    }));
    await expect(new MeliTaxonomyAdapter({ fetchImpl }).listSiteCategories("MLB"))
      .rejects.toMatchObject({ code: "TAXONOMY_INVALID_RESPONSE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("interrompe body acima do limite defensivo", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("123456", {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Length": "6" },
    }));
    const adapter = new MeliTaxonomyAdapter({ fetchImpl, limits: { maxProcessedBytes: 5 } });
    await expect(adapter.listSiteCategories("MLB")).rejects.toMatchObject({ code: "TAXONOMY_RESPONSE_TOO_LARGE" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("descompacta gzip somente quando os bytes ainda estão comprimidos", async () => {
    const compressed = gzipSync(Buffer.from(JSON.stringify(validAutomotiveDump())));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(compressed, {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    }));
    const result = await new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB");
    expect(result.nodes.some((node) => node.externalCategoryId === TEST_ROOT_ID)).toBe(true);
  });

  it("aplica limite específico aos bytes gzip recebidos", async () => {
    const compressed = gzipSync(Buffer.from(JSON.stringify(validAutomotiveDump())));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(compressed, {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    }));
    await expect(new MeliTaxonomyAdapter({
      fetchImpl,
      limits: { maxCompressedBytes: compressed.byteLength - 1 },
    }).fetchCategoryTree("MLB")).rejects.toMatchObject({ code: "TAXONOMY_RESPONSE_TOO_LARGE" });
  });

  it("não duplica gunzip quando runtime já entregou JSON decodificado", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(validAutomotiveDump()), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
    }));
    await expect(new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB")).resolves.toMatchObject({ siteId: "MLB" });
  });

  it("captura metadata sem validar semântica do MD5 e cria checksum/version internos", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(validAutomotiveDump(), 200, {
      "X-Content-MD5": "synthetic-md5-metadata",
      "X-Content-Created": "2026-08-21T12:00:00Z",
    }));
    const result = await new MeliTaxonomyAdapter({
      fetchImpl,
      clock: () => new Date("2026-08-21T12:34:56.000Z"),
    }).fetchCategoryTree("MLB");
    expect(result.sourceContentMd5).toBe("synthetic-md5-metadata");
    expect(result.sourceContentCreated).toBe("2026-08-21T12:00:00Z");
    expect(result.internalChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.sourceVersion).toBe(`sha256:${result.internalChecksum}`);
    expect(result.fetchedAt).toBe("2026-08-21T12:34:56.000Z");
  });
});
