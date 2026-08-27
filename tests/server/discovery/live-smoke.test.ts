import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT,
  MELI_HIGHLIGHTS_CATEGORY_V1,
  type DiscoveryEligibleCategory,
  type DiscoveryOccurrence,
  type MarketplaceDiscoveryAdapter,
} from "../../../src/commerce/discovery/types.js";
import {
  createSupabaseTimeoutFetch,
  SUPABASE_REQUEST_ABORTED,
  SUPABASE_REQUEST_TIMEOUT,
} from "../../../src/server/supabase/client.js";
import {
  DISCOVERY_LIVE_SMOKE_OPERATION_ID,
  DiscoveryLiveSmokeError,
  runDiscoveryLiveSmoke,
  type DiscoveryLiveSmokeCountTable,
  type DiscoveryLiveSmokeDependencies,
} from "../../../src/server/discovery/live-smoke.js";

function category(index: number, priorityTier: "A" | "B"): DiscoveryEligibleCategory {
  return Object.freeze({
    marketplaceCategoryId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    verticalKey: "AUTOMOTIVE",
    externalCategoryId: `MLB${100000 + index}`,
    priorityTier,
    manualOverride: false,
    decisionSource: "AUTO",
    classificationVersion: "classifier/v1",
    sourceVersion: "source/v1",
    categoryConfigVersion: "category/v1",
    marketplaceConfigVersion: "marketplace/v1",
    verticalConfigVersion: "vertical/v1",
  });
}

function eligibleCategories(): readonly DiscoveryEligibleCategory[] {
  return Object.freeze([
    ...Array.from({ length: 28 }, (_, index) => category(index, "A")),
    ...Array.from({ length: 116 }, (_, index) => category(index + 28, "B")),
  ]);
}

function occurrence(
  categoryRow: DiscoveryEligibleCategory,
  highlightType: "PRODUCT" | "ITEM" | "USER_PRODUCT",
  suffix: number,
): DiscoveryOccurrence {
  return Object.freeze({
    marketplaceKey: categoryRow.marketplaceKey,
    siteId: categoryRow.siteId,
    verticalKey: categoryRow.verticalKey,
    marketplaceCategoryId: categoryRow.marketplaceCategoryId,
    externalCategoryId: categoryRow.externalCategoryId,
    priorityTier: categoryRow.priorityTier,
    highlightType,
    externalId: highlightType === "USER_PRODUCT" ? `MLBU${suffix}` : `MLB${suffix}`,
    position: 1,
    observedAt: "2026-08-27T12:00:00.000Z",
    sourceContract: MELI_HIGHLIGHTS_CATEGORY_V1,
  });
}

function adapter(calls: string[]): MarketplaceDiscoveryAdapter {
  return Object.freeze({
    async discoverCategory(categoryRow: DiscoveryEligibleCategory) {
      calls.push(categoryRow.externalCategoryId);
      const suffix = Number(categoryRow.externalCategoryId.slice(3));
      return Object.freeze({
        contractVersion: MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT,
        category: categoryRow,
        occurrences: Object.freeze([
          occurrence(categoryRow, "PRODUCT", 777),
          occurrence(categoryRow, "ITEM", suffix),
          occurrence(categoryRow, "USER_PRODUCT", suffix),
        ]),
        rawHighlights: 4,
        productHighlights: 1,
        itemHighlights: 1,
        userProductHighlights: 1,
        unsupportedHighlights: 1,
        requestCount: 1,
        retryCount: 0,
        durationMs: 2,
      });
    },
  });
}

function dependencies(options: {
  categories?: readonly DiscoveryEligibleCategory[];
  rotationOutcome?: "ROTATED" | "OPERATION_ALREADY_USED";
  before?: readonly [number, number];
  after?: readonly [number, number];
  loadError?: Error;
} = {}) {
  const oauth = vi.fn().mockResolvedValue(options.rotationOutcome === "OPERATION_ALREADY_USED"
    ? { outcome: "OPERATION_ALREADY_USED", externalUserId: 1 }
    : { outcome: "ROTATED", accessToken: "CANARY_ACCESS", expiresIn: 21_600, externalUserId: 1, tokenVersion: 2 });
  const calls: string[] = [];
  const values: Record<DiscoveryLiveSmokeCountTable, number[]> = {
    scan_runs: [options.before?.[0] ?? 3, options.after?.[0] ?? 3],
    highlight_snapshots: [options.before?.[1] ?? 5, options.after?.[1] ?? 5],
  };
  let clock = 0;
  const deps: DiscoveryLiveSmokeDependencies = {
    loadEligibleCategories: options.loadError
      ? vi.fn().mockRejectedValue(options.loadError)
      : vi.fn().mockResolvedValue(options.categories ?? eligibleCategories()),
    rotateAccessToken: oauth,
    createMarketplaceAdapter: vi.fn(() => adapter(calls)),
    verificationReader: {
      count: vi.fn(async (table: DiscoveryLiveSmokeCountTable) => values[table].shift() ?? 0),
    },
    nowMs: () => ++clock,
  };
  return { deps, oauth, calls };
}

describe("permanent discovery live-smoke composition", () => {
  it("fixa operation id server-side", () => {
    expect(DISCOVERY_LIVE_SMOKE_OPERATION_ID).toBe("0b3d-b-runtime-smoke-v1");
  });

  it("bloqueia registry mismatch antes do OAuth", async () => {
    const context = dependencies({ categories: eligibleCategories().slice(0, 143) });
    await expect(runDiscoveryLiveSmoke(context.deps)).rejects.toMatchObject({
      code: "DISCOVERY_LIVE_REGISTRY_MISMATCH",
    });
    expect(context.oauth).not.toHaveBeenCalled();
    expect(context.calls).toHaveLength(0);
  });

  it("bloqueia replay OAuth antes de qualquer chamada ao adapter", async () => {
    const context = dependencies({ rotationOutcome: "OPERATION_ALREADY_USED" });
    await expect(runDiscoveryLiveSmoke(context.deps)).rejects.toMatchObject({
      code: "DISCOVERY_LIVE_OPERATION_ALREADY_USED",
    });
    expect(context.calls).toHaveLength(0);
  });

  it("bloqueia plan mismatch antes do OAuth", async () => {
    const categories = [...eligibleCategories()];
    categories[29] = categories[28]!;
    const context = dependencies({ categories });
    await expect(runDiscoveryLiveSmoke(context.deps)).rejects.toMatchObject({
      code: "DISCOVERY_LIVE_PLAN_MISMATCH",
    });
    expect(context.oauth).not.toHaveBeenCalled();
    expect(context.calls).toHaveLength(0);
  });

  it("executa somente o smoke determinístico 2A+2B e prova zero persistência", async () => {
    const context = dependencies();
    const result = await runDiscoveryLiveSmoke(context.deps);
    expect(result).toMatchObject({
      contractVersion: "commerce-discovery-live-smoke/v1",
      status: "COMPLETED",
      mode: "SMOKE",
      persistenceMode: "DRY_RUN",
      registry: { eligible: 144, tierA: 28, tierB: 116 },
      selected: { total: 4, tierA: 2, tierB: 2 },
      oauth: { outcome: "ROTATED" },
      persistenceProof: { unchanged: true },
    });
    expect(context.calls).toHaveLength(4);
    expect(result.categoryOutcomes.map((entry) => entry.priorityTier)).toEqual(["A", "A", "B", "B"]);
    expect(result.metrics).toMatchObject({
      selectedCategories: 4,
      attemptedCategories: 4,
      productHighlights: 4,
      itemHighlights: 4,
      userProductHighlights: 4,
      unsupportedHighlights: 4,
      uniqueCandidates: 1,
    });
    expect(result.samples.productIds.length).toBeLessThanOrEqual(10);
    expect(result.samples.itemIds.length).toBeLessThanOrEqual(10);
    expect(result.samples.userProductIds.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(result)).not.toContain("CANARY_ACCESS");
    expect(JSON.stringify(result)).not.toMatch(/accessToken|refreshToken|clientSecret/i);
  });

  it.each([
    { before: [3, 5], after: [4, 5], delta: "scan_runs" },
    { before: [3, 5], after: [3, 6], delta: "highlight_snapshots" },
  ] as const)("falha quando $delta muda", async ({ before, after }) => {
    const context = dependencies({ before, after });
    await expect(runDiscoveryLiveSmoke(context.deps)).rejects.toMatchObject({
      code: "DISCOVERY_LIVE_PERSISTENCE_VIOLATION",
    });
  });

  it("sanitiza exceções de dependência", async () => {
    const context = dependencies({ loadError: new Error("CANARY_SECRET raw failure") });
    const error = await runDiscoveryLiveSmoke(context.deps).catch((caught) => caught);
    expect(error).toBeInstanceOf(DiscoveryLiveSmokeError);
    expect(error.message).toBe("DISCOVERY_LIVE_DEPENDENCY_FAILED");
    expect(JSON.stringify(error)).not.toContain("CANARY_SECRET");
  });

  it("mantém invariantes estáticas de rota e persistência", () => {
    const source = readFileSync(new URL("../../../src/server/discovery/live-smoke.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "FULL_SWEEP",
      "persistence-repository",
      "beginDiscoveryRun",
      "persistDiscoveryOccurrences",
      "completeDiscoveryRun",
    ]) expect(source).not.toContain(forbidden);
  });
});

describe("Supabase server fetch timeout", () => {
  it("preserva fetch normal com override", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const wrapped = createSupabaseTimeoutFetch(base, 100);
    await expect(wrapped("https://example.invalid")).resolves.toBeInstanceOf(Response);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("aborta no timeout com erro sanitizado", async () => {
    const base = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("CANARY_SECRET", "AbortError")), { once: true });
    }));
    const error = await createSupabaseTimeoutFetch(base, 1)("https://example.invalid").catch((caught) => caught);
    expect(error.message).toBe(SUPABASE_REQUEST_TIMEOUT);
    expect(JSON.stringify(error)).not.toContain("CANARY_SECRET");
  });

  it("propaga abort upstream apenas como código sanitizado", async () => {
    const base = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("raw abort", "AbortError")), { once: true });
    }));
    const controller = new AbortController();
    controller.abort();
    const error = await createSupabaseTimeoutFetch(base, 100)("https://example.invalid", { signal: controller.signal })
      .catch((caught) => caught);
    expect(error.message).toBe(SUPABASE_REQUEST_ABORTED);
  });
});
