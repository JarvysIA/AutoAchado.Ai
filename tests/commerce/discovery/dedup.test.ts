import { describe, expect, it } from "vitest";
import { deduplicateDiscoveryOccurrences } from "../../../src/commerce/discovery/dedup.js";
import { MELI_HIGHLIGHTS_CATEGORY_V1, type DiscoveryOccurrence } from "../../../src/commerce/discovery/types.js";

function occurrence(overrides: Partial<DiscoveryOccurrence> = {}): DiscoveryOccurrence {
  return {
    marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
    marketplaceCategoryId: "00000000-0000-4000-8000-000000000001",
    externalCategoryId: "MLB100", priorityTier: "A", highlightType: "PRODUCT",
    externalId: "MLB900", position: 5, observedAt: "2026-08-26T00:00:00.000Z",
    sourceContract: MELI_HIGHLIGHTS_CATEGORY_V1, ...overrides,
  };
}

describe("discovery dedup", () => {
  it("collapses same-category duplicates and keeps the smallest non-null position", () => {
    const result = deduplicateDiscoveryOccurrences([occurrence({ position: null }), occurrence({ position: 7 }), occurrence({ position: 2 })]);
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0]!.position).toBe(2);
    expect(result.duplicateOccurrences).toBe(2);
  });

  it("creates one PRODUCT candidate with multi-category provenance", () => {
    const result = deduplicateDiscoveryOccurrences([
      occurrence(),
      occurrence({ marketplaceCategoryId: "00000000-0000-4000-8000-000000000002", externalCategoryId: "MLB200", priorityTier: "B" }),
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.occurrences.map((value) => value.externalCategoryId)).toEqual(["MLB100", "MLB200"]);
  });

  it("keeps the same raw ID distinct across highlight types and only PRODUCT becomes a candidate", () => {
    const result = deduplicateDiscoveryOccurrences([occurrence(), occurrence({ highlightType: "ITEM" })]);
    expect(result.occurrences).toHaveLength(2);
    expect(result.candidates).toHaveLength(1);
  });

  it("orders provenance by tier, category ID, and null-last position", () => {
    const result = deduplicateDiscoveryOccurrences([
      occurrence({ marketplaceCategoryId: "00000000-0000-4000-8000-000000000003", externalCategoryId: "MLB300", priorityTier: "B", position: 1 }),
      occurrence({ marketplaceCategoryId: "00000000-0000-4000-8000-000000000002", externalCategoryId: "MLB200", position: null }),
      occurrence({ marketplaceCategoryId: "00000000-0000-4000-8000-000000000001", externalCategoryId: "MLB100", position: 9 }),
    ]);
    expect(result.candidates[0]!.occurrences.map((value) => value.externalCategoryId)).toEqual(["MLB100", "MLB200", "MLB300"]);
  });
});
