import { describe, expect, it } from "vitest";
import { DiscoveryError, type DiscoveryEligibleCategory } from "../../src/commerce/discovery/types.js";
import { createMeliHighlightsDiscoveryAdapter, type MeliDiscoveryHttpClient } from "../../src/meli/highlights-discovery-adapter.js";
import { MeliApiError, type ApiResponse } from "../../src/meli/client.js";

const category: DiscoveryEligibleCategory = {
  marketplaceCategoryId: "00000000-0000-4000-8000-000000000001", marketplaceKey: "MERCADO_LIVRE",
  siteId: "MLB", verticalKey: "AUTOMOTIVE", externalCategoryId: "MLB123", priorityTier: "A",
  manualOverride: false, decisionSource: "AUTO", classificationVersion: "v1", sourceVersion: "v1",
  categoryConfigVersion: "v1", marketplaceConfigVersion: "v1", verticalConfigVersion: "v1",
};

class FakeClient implements MeliDiscoveryHttpClient {
  requestCount = 0;
  encounteredRateLimit = false;
  path = "";
  constructor(readonly value: unknown, readonly error?: Error, readonly attempts = 1) {}
  async get<T>(path: string): Promise<ApiResponse<T>> {
    this.path = path;
    this.requestCount += this.attempts;
    if (this.error) throw this.error;
    return { status: 200, data: this.value as T, headers: {}, durationMs: 3, approximateBytes: 10 };
  }
}

const adapter = (client: FakeClient) => createMeliHighlightsDiscoveryAdapter({
  client,
  nowIso: () => "2026-08-26T00:00:00.000Z",
});

describe("Meli highlights discovery adapter", () => {
  it("parses known types, skips unknown, and uses only the official category endpoint", async () => {
    const client = new FakeClient({ content: [
      { id: "MLB100", type: "PRODUCT", position: 1, extra: true },
      { id: "MLB200", type: "ITEM", position: null },
      { id: "MLBU300", type: "USER_PRODUCT" },
      { id: "ignored", type: "FUTURE" },
    ] });
    const result = await adapter(client).discoverCategory(category);
    expect(client.path).toBe("/highlights/MLB/category/MLB123");
    expect(result.occurrences.map((value) => value.highlightType)).toEqual(["PRODUCT", "ITEM", "USER_PRODUCT"]);
    expect(result).toMatchObject({ rawHighlights: 4, productHighlights: 1, itemHighlights: 1, userProductHighlights: 1, unsupportedHighlights: 1 });
  });

  it.each([
    ["missing content", {}], ["empty content", { content: [] }],
  ])("accepts %s as empty", async (_name, payload) => {
    await expect(adapter(new FakeClient(payload)).discoverCategory(category)).resolves.toMatchObject({ rawHighlights: 0 });
  });

  it.each([
    ["non-object", null],
    ["non-array content", { content: {} }],
    ["too many entries", { content: Array.from({ length: 21 }, (_, index) => ({ id: `MLB${index}`, type: "PRODUCT" })) }],
    ["invalid product", { content: [{ id: "X", type: "PRODUCT" }] }],
    ["invalid item", { content: [{ id: "X", type: "ITEM" }] }],
    ["invalid user product", { content: [{ id: "MLB1", type: "USER_PRODUCT" }] }],
    ["position zero", { content: [{ id: "MLB1", type: "PRODUCT", position: 0 }] }],
    ["position 21", { content: [{ id: "MLB1", type: "PRODUCT", position: 21 }] }],
    ["position fractional", { content: [{ id: "MLB1", type: "PRODUCT", position: 1.5 }] }],
  ])("rejects %s", async (_name, payload) => {
    await expect(adapter(new FakeClient(payload)).discoverCategory(category)).rejects.toMatchObject({ code: "DISCOVERY_ADAPTER_SCHEMA_INVALID" });
  });

  it.each([
    [401, "DISCOVERY_AUTH_FATAL"], [403, "DISCOVERY_AUTH_FATAL"], [404, "DISCOVERY_CATEGORY_FAILED"],
    [429, "DISCOVERY_RATE_LIMIT_STOP"], [500, "DISCOVERY_CATEGORY_TRANSPORT_FAILED"], [0, "DISCOVERY_CATEGORY_TRANSPORT_FAILED"],
  ])("maps HTTP %i to a sanitized error", async (status, code) => {
    const secretCanary = "RAW_SECRET_CANARY";
    const client = new FakeClient(null, new MeliApiError("unsafe", status, { secretCanary }), 3);
    let caught: unknown;
    try { await adapter(client).discoverCategory(category); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(DiscoveryError);
    expect(caught).toMatchObject({ code, details: { requestCount: 3, retryCount: 2 } });
    expect(JSON.stringify(caught)).not.toContain(secretCanary);
  });
});
