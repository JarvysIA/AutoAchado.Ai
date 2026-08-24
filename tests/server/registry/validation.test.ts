import { describe, expect, it } from "vitest";
import { buildAtomicRegistryApplyPayload } from "../../../src/commerce/registry/apply-payload.js";
import { buildCommerceRegistrySyncPlan } from "../../../src/commerce/registry/planner.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../../src/taxonomy/types.js";
import {
  COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION,
  validateCommerceRegistryApplyResult,
} from "../../../src/server/registry/validation.js";

const nodes: TaxonomyCategoryNode[] = [
  { marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "ROOT", name: "Root", parentExternalCategoryId: null,
    childrenExternalCategoryIds: ["A"], pathExternalCategoryIds: ["ROOT"], pathNames: ["Root"], isLeaf: false },
  { marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "A", name: "A", parentExternalCategoryId: "ROOT",
    childrenExternalCategoryIds: [], pathExternalCategoryIds: ["ROOT", "A"], pathNames: ["Root", "A"], isLeaf: true },
];

function payload() {
  return buildAtomicRegistryApplyPayload(buildCommerceRegistrySyncPlan({
    context: { marketplaceKey: "MARKET", siteId: "SITE", verticalKey: "VERTICAL", rootExternalCategoryId: "ROOT",
      sourceVersion: "source/v1", expectedClassificationVersion: "classifier/v1", configVersion: "sync/v1",
      checkedAt: "2026-08-24T12:00:00.000Z" },
    taxonomyTree: new TaxonomyTree(nodes, { requiredRootId: "ROOT" }),
    classifyCategory: (id) => ({ externalCategoryId: id, scopeStatus: "ALLOWED", priorityTier: id === "A" ? "A" : "B",
      familyKey: null, commercialFamilyKeyDefault: null, ruleId: "rule", classificationVersion: "classifier/v1", reason: null }),
  }));
}

function validResult() {
  return {
    contractVersion: COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION,
    marketplaceKey: "MARKET", siteId: "SITE", verticalKey: "VERTICAL", rootExternalCategoryId: "ROOT",
    sourceVersion: "source/v1", classificationVersion: "classifier/v1",
    categories: { inserted: 2, updated: 0, unchanged: 0, reactivated: 0 },
    mappings: { inserted: 2, updated: 0, unchanged: 0, reactivated: 0, inactivated: 1, manualOverrideSkipped: 0 },
    desired: { categories: 2, mappings: 2, automaticEligible: 2 },
    effective: { activeMappings: 2, allowed: 2, review: 0, excluded: 0, unknown: 0,
      tierA: 1, tierB: 1, tierC: 0, automaticEligible: 2 },
  };
}

function changed(path: string, value: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(validResult())) as Record<string, any>;
  const parts = path.split(".");
  let target = copy;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)!] = value;
  return copy;
}

describe("commerce registry apply result validation", () => {
  it("aceita resposta válida e contexto esperado", () => {
    expect(validateCommerceRegistryApplyResult(validResult(), payload())).toEqual(validResult());
  });

  it.each([
    ["contractVersion", "bad"], ["categories.inserted", -1], ["categories.inserted", 0.5],
    ["categories.inserted", 1], ["mappings.inserted", 1], ["desired.categories", 3],
    ["effective.review", 1], ["effective.tierA", 0], ["effective.automaticEligible", 1],
  ])("rejeita accounting/shape inválido em %s", (path, value) => {
    expect(() => validateCommerceRegistryApplyResult(changed(path, value), payload())).toThrow();
  });

  it.each([
    ["marketplaceKey", "OTHER"], ["siteId", "OTHER"], ["verticalKey", "OTHER"],
    ["rootExternalCategoryId", "OTHER"], ["sourceVersion", "OTHER"], ["classificationVersion", "OTHER"],
  ])("rejeita mismatch de contexto em %s", (path, value) => {
    expect(() => validateCommerceRegistryApplyResult(changed(path, value), payload())).toThrowError(/Contexto/);
  });

  it("não contabiliza inactivated como mapping desired-present", () => {
    const result = validResult();
    result.mappings.inactivated = 99;
    expect(validateCommerceRegistryApplyResult(result, payload()).mappings.inactivated).toBe(99);
  });
});
