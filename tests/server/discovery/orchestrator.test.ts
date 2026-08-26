import { describe, expect, it } from "vitest";
import { AUTOMOTIVE_MLB_DISCOVERY_V1, planDiscoveryRun } from "../../../src/commerce/discovery/planner.js";
import {
  DiscoveryError,
  MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT,
  MELI_HIGHLIGHTS_CATEGORY_V1,
  type DiscoveryEligibleCategory,
  type MarketplaceCategoryDiscoveryResult,
  type MarketplaceDiscoveryAdapter,
} from "../../../src/commerce/discovery/types.js";
import { runDiscoveryOrchestrator } from "../../../src/server/discovery/orchestrator.js";

function categories(count = 144): DiscoveryEligibleCategory[] {
  return Array.from({ length: count }, (_, index) => ({
    marketplaceCategoryId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
    externalCategoryId: `MLB${10_000 + index}`, priorityTier: index < 28 ? "A" : "B",
    manualOverride: false, decisionSource: "AUTO", classificationVersion: "v1", sourceVersion: "v1",
    categoryConfigVersion: "v1", marketplaceConfigVersion: "v1", verticalConfigVersion: "v1",
  }));
}

function success(category: DiscoveryEligibleCategory, content: "PRODUCT" | "ITEM" | "USER_PRODUCT" | "EMPTY" = "PRODUCT"): MarketplaceCategoryDiscoveryResult {
  const occurrences = content === "EMPTY" ? [] : [{
    marketplaceKey: category.marketplaceKey, siteId: category.siteId, verticalKey: category.verticalKey,
    marketplaceCategoryId: category.marketplaceCategoryId, externalCategoryId: category.externalCategoryId,
    priorityTier: category.priorityTier, highlightType: content, externalId: content === "USER_PRODUCT" ? "MLBU9" : "MLB9",
    position: 1, observedAt: "2026-08-26T00:00:00.000Z", sourceContract: MELI_HIGHLIGHTS_CATEGORY_V1,
  }] as const;
  return {
    contractVersion: MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT, category, occurrences,
    rawHighlights: occurrences.length, productHighlights: content === "PRODUCT" ? 1 : 0,
    itemHighlights: content === "ITEM" ? 1 : 0, userProductHighlights: content === "USER_PRODUCT" ? 1 : 0,
    unsupportedHighlights: 0, requestCount: 1, retryCount: 0, durationMs: 1,
  };
}

describe("discovery orchestrator", () => {
  it("runs the four-category smoke, deduplicates PRODUCT, and closes metrics", async () => {
    const plan = planDiscoveryRun(categories(), "SMOKE");
    const result = await runDiscoveryOrchestrator({ plan, adapter: { discoverCategory: async (category) => success(category) } });
    expect(result.outcomes).toHaveLength(4);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.occurrences).toHaveLength(4);
    expect(result.metrics).toMatchObject({ selectedCategories: 4, attemptedCategories: 4, successfulCategories: 4, uniqueCandidates: 1 });
  });

  it("executes a full 144 fake plan with maximum concurrency two", async () => {
    let active = 0;
    let maximum = 0;
    const adapter: MarketplaceDiscoveryAdapter = { discoverCategory: async (category) => {
      active += 1; maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return success(category, "EMPTY");
    } };
    const result = await runDiscoveryOrchestrator({ plan: planDiscoveryRun(categories(), "FULL_SWEEP"), adapter });
    expect(result.metrics).toMatchObject({ selectedCategories: 144, attemptedCategories: 144, emptyCategories: 144 });
    expect(maximum).toBe(2);
  });

  it("isolates 404 category failures and continues", async () => {
    let calls = 0;
    const adapter: MarketplaceDiscoveryAdapter = { discoverCategory: async (category) => {
      calls += 1;
      if (calls === 1) throw new DiscoveryError("DISCOVERY_CATEGORY_FAILED", "404");
      return success(category, "EMPTY");
    } };
    const result = await runDiscoveryOrchestrator({ plan: planDiscoveryRun(categories(), "SMOKE"), adapter });
    expect(result.metrics).toMatchObject({ attemptedCategories: 4, failedCategories: 1, emptyCategories: 3 });
    expect(result.fatalErrorCode).toBeNull();
  });

  it.each([
    ["DISCOVERY_AUTH_FATAL", "DISCOVERY_AUTH_FATAL"],
    ["DISCOVERY_RATE_LIMIT_STOP", "DISCOVERY_RATE_LIMIT_STOP"],
  ] as const)("stops globally on %s", async (errorCode, fatalCode) => {
    const adapter: MarketplaceDiscoveryAdapter = { discoverCategory: async () => { throw new DiscoveryError(errorCode, "safe", { requestCount: 3, retryCount: 2 }); } };
    const result = await runDiscoveryOrchestrator({ plan: planDiscoveryRun(categories(), "FULL_SWEEP"), adapter });
    expect(result.fatalErrorCode).toBe(fatalCode);
    expect(result.metrics.notAttemptedCategories).toBeGreaterThan(0);
    expect(result.metrics.apiRequests).toBe(6);
  });

  it.each([
    ["DISCOVERY_ADAPTER_SCHEMA_INVALID", "DISCOVERY_ADAPTER_CONTRACT_DRIFT"],
    ["DISCOVERY_CATEGORY_TRANSPORT_FAILED", "DISCOVERY_GLOBAL_TRANSPORT_STOP"],
  ] as const)("stops after three consecutive %s failures", async (errorCode, fatalCode) => {
    const adapter: MarketplaceDiscoveryAdapter = { discoverCategory: async () => { throw new DiscoveryError(errorCode, "safe"); } };
    const result = await runDiscoveryOrchestrator({ plan: planDiscoveryRun(categories(), "FULL_SWEEP"), adapter });
    expect(result.fatalErrorCode).toBe(fatalCode);
    expect(result.metrics.failedCategories).toBe(4);
    expect(result.metrics.notAttemptedCategories).toBe(140);
  });

  it("counts known and unsupported highlights arithmetically", async () => {
    const adapter: MarketplaceDiscoveryAdapter = { discoverCategory: async (category) => ({
      ...success(category), rawHighlights: 4, productHighlights: 1, itemHighlights: 1,
      userProductHighlights: 1, unsupportedHighlights: 1,
    }) };
    const result = await runDiscoveryOrchestrator({ plan: planDiscoveryRun(categories(), "SMOKE"), adapter, nowMs: () => 10 });
    expect(result.metrics.rawHighlights).toBe(result.metrics.productHighlights + result.metrics.itemHighlights
      + result.metrics.userProductHighlights + result.metrics.unsupportedHighlights);
    expect(result.metrics.persistenceMs).toBe(0);
  });
});
