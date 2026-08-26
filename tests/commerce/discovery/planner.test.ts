import { describe, expect, it } from "vitest";
import {
  AUTOMOTIVE_MLB_DISCOVERY_V1,
  planDiscoveryRun,
} from "../../../src/commerce/discovery/planner.js";
import type { DiscoveryEligibleCategory, DiscoveryRunConfig } from "../../../src/commerce/discovery/types.js";

function category(index: number, tier: "A" | "B" = index < 28 ? "A" : "B"): DiscoveryEligibleCategory {
  return {
    marketplaceCategoryId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    verticalKey: "AUTOMOTIVE",
    externalCategoryId: `MLB${String(10_000 + index)}`,
    priorityTier: tier,
    manualOverride: false,
    decisionSource: "AUTO",
    classificationVersion: "classifier/v1",
    sourceVersion: "source/v1",
    categoryConfigVersion: "category/v1",
    marketplaceConfigVersion: "marketplace/v1",
    verticalConfigVersion: "vertical/v1",
  };
}

const full = () => Array.from({ length: 144 }, (_, index) => category(index));

describe("discovery planner", () => {
  it("creates the exact full plan in canonical order", () => {
    const input = full().reverse();
    const plan = planDiscoveryRun(input, "FULL_SWEEP");
    expect(plan.selectedCategories).toHaveLength(144);
    expect(plan.selectedCategories.slice(0, 28).every((value) => value.priorityTier === "A")).toBe(true);
    expect(plan.selectedCategories.slice(28).every((value) => value.priorityTier === "B")).toBe(true);
    expect(plan.contractVersion).toBe("commerce-discovery-run/v1");
  });

  it("selects the first two A and first two B deterministically", () => {
    const plan = planDiscoveryRun(full().reverse(), "SMOKE");
    expect(plan.selectedCategories.map((value) => [value.priorityTier, value.externalCategoryId])).toEqual([
      ["A", "MLB10000"], ["A", "MLB10001"], ["B", "MLB10028"], ["B", "MLB10029"],
    ]);
  });

  it("produces a stable digest independent of input order and clock", () => {
    const left = planDiscoveryRun(full(), "SMOKE");
    const right = planDiscoveryRun(full().reverse(), "FULL_SWEEP");
    expect(left.registryDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(left.registryDigest).toBe(right.registryDigest);
  });

  it("changes digest on relevant registry input", () => {
    const input = full();
    const changed = input.map((value, index) => index === 0 ? { ...value, sourceVersion: "source/v2" } : value);
    expect(planDiscoveryRun(input, "SMOKE").registryDigest).not.toBe(planDiscoveryRun(changed, "SMOKE").registryDigest);
  });

  it("fails closed on eligible count mismatch", () => {
    expect(() => planDiscoveryRun(full().slice(0, 143), "FULL_SWEEP")).toThrowError(/Contagem elegível/);
  });

  it.each([
    ["duplicate UUID", (rows: DiscoveryEligibleCategory[]) => { rows[1] = { ...rows[1]!, marketplaceCategoryId: rows[0]!.marketplaceCategoryId }; }],
    ["duplicate external ID", (rows: DiscoveryEligibleCategory[]) => { rows[1] = { ...rows[1]!, externalCategoryId: rows[0]!.externalCategoryId }; }],
    ["wrong marketplace", (rows: DiscoveryEligibleCategory[]) => { rows[0] = { ...rows[0]!, marketplaceKey: "OTHER" }; }],
    ["wrong site", (rows: DiscoveryEligibleCategory[]) => { rows[0] = { ...rows[0]!, siteId: "MLA" }; }],
    ["wrong vertical", (rows: DiscoveryEligibleCategory[]) => { rows[0] = { ...rows[0]!, verticalKey: "OTHER" }; }],
    ["invalid external ID", (rows: DiscoveryEligibleCategory[]) => { rows[0] = { ...rows[0]!, externalCategoryId: "bad" }; }],
  ])("rejects %s", (_name, mutate) => {
    const rows = full();
    mutate(rows);
    expect(() => planDiscoveryRun(rows, "FULL_SWEEP")).toThrow();
  });

  it("supports a generic non-144 test config without moving 144 out of the preset", () => {
    const config: DiscoveryRunConfig = { ...AUTOMOTIVE_MLB_DISCOVERY_V1, expectedEligibleCategories: 4, smokeCategoriesPerTier: 1 };
    const rows = [category(0, "A"), category(1, "A"), category(2, "B"), category(3, "B")];
    expect(planDiscoveryRun(rows, "FULL_SWEEP", config).selectedCategories).toHaveLength(4);
  });
});
