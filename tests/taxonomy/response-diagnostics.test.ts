import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { MeliTaxonomyAdapter } from "../../src/meli/taxonomy-adapter.js";
import { TaxonomyError } from "../../src/taxonomy/errors.js";
import { validAutomotiveDump } from "../fixtures/meli-taxonomy.js";

function response(body: string | Buffer | null, headers: Record<string, string> = {}): Response {
  return new Response(body as unknown as BodyInit, { status: 200, headers: { "Content-Type": "application/json", ...headers } });
}

async function captureError(run: () => Promise<unknown>): Promise<TaxonomyError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof TaxonomyError) return error;
    throw error;
  }
  throw new Error("Teste esperava TaxonomyError");
}

describe("diagnóstico seguro de resposta de taxonomia", () => {
  it.each([
    "application/json",
    "application/json; charset=utf-8",
  ])("aceita Content-Type %s", async (contentType) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(JSON.stringify(validAutomotiveDump()), {
      "Content-Type": contentType,
    }));
    const result = await new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB");
    expect(result.responseDiagnostics.contentType).toBe(contentType);
  });

  it.each(["text/html", "text/plain"])("distingue Content-Type inválido: %s", async (contentType) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response("not inspected", { "Content-Type": contentType }));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error).toMatchObject({
      code: "TAXONOMY_INVALID_RESPONSE",
      details: { status: 200, operation: "FETCH_CATEGORY_TREE", reason: "CONTENT_TYPE_INVALID", contentType },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("distingue Content-Encoding inválido e preserva metadata limitada", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(JSON.stringify(validAutomotiveDump()), {
      "Content-Encoding": "br",
      "Content-Length": "123",
    }));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error.details).toMatchObject({
      status: 200,
      reason: "CONTENT_ENCODING_INVALID",
      contentEncoding: "br",
      contentLength: 123,
    });
  });

  it("aceita encoding ausente, identity, gzip bruto e gzip já decodificado", async () => {
    const json = Buffer.from(JSON.stringify(validAutomotiveDump()));
    const gzip = gzipSync(json);
    const cases: Array<{ body: Buffer; encoding?: string }> = [
      { body: json },
      { body: json, encoding: "identity" },
      { body: gzip, encoding: "gzip" },
      { body: json, encoding: "gzip" },
    ];
    for (const item of cases) {
      const headers = item.encoding ? { "Content-Encoding": item.encoding } : {};
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(item.body, headers));
      await expect(new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB")).resolves.toMatchObject({ siteId: "MLB" });
    }
  });

  it("identifica body vazio sem retry e registra zero bytes", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(""));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error).toMatchObject({
      code: "TAXONOMY_INVALID_RESPONSE",
      details: {
        status: 200,
        reason: "EMPTY_BODY",
        transportBytes: 0,
        processedBytes: 0,
        bodyHadGzipMagic: false,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("identifica JSON inválido sem revelar body e sem retry", async () => {
    const canary = "fake-json-body-secret-canary";
    const bytes = Buffer.byteLength(canary);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(canary));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error).toMatchObject({
      code: "TAXONOMY_INVALID_RESPONSE",
      details: { status: 200, reason: "JSON_INVALID", transportBytes: bytes, processedBytes: bytes },
    });
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(error.message).not.toContain(canary);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [JSON.stringify({ wrapper: [] }), "OBJECT", null, 1],
    [JSON.stringify("tree"), "STRING", null, null],
    [JSON.stringify(null), "NULL", null, null],
  ] as const)("diagnostica top-level %s sem expor conteúdo", async (body, kind, arrayLength, objectKeyCount) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(body));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error).toMatchObject({ code: "TAXONOMY_INVALID_RESPONSE" });
    expect(error.details).toMatchObject({
      status: 200,
      operation: "FETCH_CATEGORY_TREE",
      reason: "TOP_LEVEL_SHAPE_INVALID",
      topLevelKind: kind,
      topLevelArrayLength: arrayLength,
      topLevelObjectKeyCount: objectKeyCount,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("diagnostica item de categoria inválido apenas pelo índice", async () => {
    const rejectedContent = "must-not-appear-in-error";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(JSON.stringify([rejectedContent])));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error.details).toMatchObject({
      status: 200,
      operation: "FETCH_CATEGORY_TREE",
      reason: "CATEGORY_SHAPE_INVALID",
      topLevelKind: "ARRAY",
      topLevelArrayLength: 1,
      categoryIndex: 0,
    });
    expect(JSON.stringify(error)).not.toContain(rejectedContent);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("mede bytes comuns e expõe metadata segura no envelope", async () => {
    const json = Buffer.from(JSON.stringify(validAutomotiveDump()));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(json, { "Content-Length": String(json.byteLength) }));
    const result = await new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB");
    expect(result.responseDiagnostics).toEqual({
      status: 200,
      operation: "FETCH_CATEGORY_TREE",
      contentType: "application/json",
      contentEncoding: null,
      contentLength: json.byteLength,
      transportBytes: json.byteLength,
      processedBytes: json.byteLength,
      bodyHadGzipMagic: false,
      topLevelKind: "ARRAY",
      topLevelArrayLength: 1,
      topLevelObjectKeyCount: null,
    });
  });

  it("mede bytes gzip antes e depois do gunzip e detecta magic bytes", async () => {
    const json = Buffer.from(JSON.stringify(validAutomotiveDump()));
    const gzip = gzipSync(json);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(gzip, {
      "Content-Encoding": "gzip",
      "Content-Length": String(gzip.byteLength),
    }));
    const result = await new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB");
    expect(result.responseDiagnostics).toMatchObject({
      transportBytes: gzip.byteLength,
      processedBytes: json.byteLength,
      bodyHadGzipMagic: true,
      contentEncoding: "gzip",
    });
  });

  it("distingue gzip inválido sem anexar bytes ao erro", async () => {
    const invalidGzip = Buffer.from([0x1f, 0x8b, 0x00, 0x01]);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(invalidGzip, { "Content-Encoding": "gzip" }));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB"));
    expect(error.details).toMatchObject({
      status: 200,
      reason: "GZIP_INVALID",
      transportBytes: invalidGzip.byteLength,
      processedBytes: null,
      bodyHadGzipMagic: true,
    });
    expect(error).not.toHaveProperty("body");
  });

  it("registra gzip já decodificado sem afirmar bytes wire-compressed", async () => {
    const json = Buffer.from(JSON.stringify(validAutomotiveDump()));
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(json, { "Content-Encoding": "gzip" }));
    const result = await new MeliTaxonomyAdapter({ fetchImpl }).fetchCategoryTree("MLB");
    expect(result.responseDiagnostics).toMatchObject({
      transportBytes: json.byteLength,
      processedBytes: json.byteLength,
      bodyHadGzipMagic: false,
      contentEncoding: "gzip",
    });
  });

  it("mantém RESPONSE_TOO_LARGE como code próprio", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response("123456", { "Content-Length": "6" }));
    const error = await captureError(() => new MeliTaxonomyAdapter({
      fetchImpl,
      limits: { maxProcessedBytes: 5 },
    }).fetchCategoryTree("MLB"));
    expect(error.code).toBe("TAXONOMY_RESPONSE_TOO_LARGE");
    expect(error.details.status).toBe(200);
  });

  it("redige token sintético de headers e nunca serializa Response", async () => {
    const token = "Bearer fake-taxonomy-diagnostic-token-canary";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response("ignored", { "Content-Type": token }));
    const error = await captureError(() => new MeliTaxonomyAdapter({ fetchImpl, getAccessToken: async () => token }).fetchCategoryTree("MLB"));
    const serialized = JSON.stringify(error);
    expect(error.details.contentType).toBe("[REDACTED]");
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("Response");
    expect(error).not.toHaveProperty("response");
    expect(error).not.toHaveProperty("body");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("não altera retry: 500 repete, erro estrutural não", async () => {
    const status500 = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(response(JSON.stringify(validAutomotiveDump())));
    await new MeliTaxonomyAdapter({ fetchImpl: status500, sleepImpl: async () => undefined }).fetchCategoryTree("MLB");
    expect(status500).toHaveBeenCalledTimes(2);

    const invalidFetch = vi.fn<typeof fetch>().mockResolvedValue(response(JSON.stringify({ wrapper: [] })));
    await expect(new MeliTaxonomyAdapter({ fetchImpl: invalidFetch }).fetchCategoryTree("MLB")).rejects.toBeInstanceOf(TaxonomyError);
    expect(invalidFetch).toHaveBeenCalledTimes(1);
  });
});
