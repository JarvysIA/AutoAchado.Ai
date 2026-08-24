import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AUTOMOTIVE_CLASSIFICATION_VERSION,
  classifyAutomotiveCategory,
} from "../../../src/commerce/classification/automotive/index.js";
import { buildCommerceRegistrySyncPlan } from "../../../src/commerce/registry/planner.js";
import {
  COMMERCE_REGISTRY_SYNC_CONFIG_VERSION,
  type BuildCommerceRegistrySyncPlanInput,
  type RegistryCategoryClassifier,
} from "../../../src/commerce/registry/types.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../../src/taxonomy/types.js";
import {
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../../helpers/automotive-taxonomy-snapshot.js";

const CHECKED_AT = "2026-08-24T12:00:00.000Z";
const snapshotUrl = new URL("../../fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);

function smallTree(nodesReversed = false): TaxonomyTree {
  const nodes: TaxonomyCategoryNode[] = [
    {
      marketplaceKey: "GENERIC_MARKET", siteId: "SITE", externalCategoryId: "ROOT",
      name: "Root", parentExternalCategoryId: null, childrenExternalCategoryIds: ["A", "B"],
      pathExternalCategoryIds: ["ROOT"], pathNames: ["Root"], isLeaf: false,
    },
    {
      marketplaceKey: "GENERIC_MARKET", siteId: "SITE", externalCategoryId: "A",
      name: "Mesmo nome", parentExternalCategoryId: "ROOT", childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["ROOT", "A"], pathNames: ["Root", "Mesmo nome"], isLeaf: true,
    },
    {
      marketplaceKey: "GENERIC_MARKET", siteId: "SITE", externalCategoryId: "B",
      name: "Mesmo nome", parentExternalCategoryId: "ROOT", childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["ROOT", "B"], pathNames: ["Root", "Mesmo nome"], isLeaf: true,
    },
  ];
  return new TaxonomyTree(nodesReversed ? [...nodes].reverse() : nodes, { requiredRootId: "ROOT" });
}

const genericClassifier: RegistryCategoryClassifier = (externalCategoryId) => ({
  externalCategoryId,
  scopeStatus: externalCategoryId === "A" ? "ALLOWED" : externalCategoryId === "B" ? "EXCLUDED" : "REVIEW",
  priorityTier: externalCategoryId === "A" ? "A" : null,
  familyKey: externalCategoryId === "A" ? "generic_family" : null,
  commercialFamilyKeyDefault: null,
  ruleId: `rule.${externalCategoryId}`,
  classificationVersion: "generic/v1",
  reason: "fixture",
});

function smallInput(tree = smallTree()): BuildCommerceRegistrySyncPlanInput {
  return {
    context: {
      marketplaceKey: "GENERIC_MARKET",
      siteId: "SITE",
      verticalKey: "GENERIC_VERTICAL",
      rootExternalCategoryId: "ROOT",
      sourceVersion: "source/v1",
      expectedClassificationVersion: "generic/v1",
      configVersion: COMMERCE_REGISTRY_SYNC_CONFIG_VERSION,
      checkedAt: CHECKED_AT,
    },
    taxonomyTree: tree,
    classifyCategory: genericClassifier,
  };
}

describe("pure commerce registry sync planner", () => {
  it("produz desired state genérico, ordenado e sem identidade por nome", () => {
    const plan = buildCommerceRegistrySyncPlan(smallInput());
    expect(plan.categories.map((category) => category.externalCategoryId)).toEqual(["A", "B", "ROOT"]);
    expect(plan.categories.filter((category) => category.name === "Mesmo nome")).toHaveLength(2);
    expect(plan.categories.every((category) => category.active)).toBe(true);
    expect(plan.mappings).toHaveLength(3);
    expect(plan.summary).toMatchObject({
      categoryCount: 3,
      mappingCount: 3,
      scope: { allowed: 1, review: 1, excluded: 1, unknown: 0 },
      tiers: { A: 1, B: 0, C: 0 },
      automaticEligibleCount: 1,
    });
  });

  it("é determinístico, independente da ordem e não muta a árvore", () => {
    const firstTree = smallTree();
    const before = JSON.stringify(firstTree.nodes);
    const first = buildCommerceRegistrySyncPlan(smallInput(firstTree));
    const second = buildCommerceRegistrySyncPlan(smallInput(smallTree(true)));
    expect(second).toEqual(first);
    expect(buildCommerceRegistrySyncPlan(smallInput(firstTree))).toEqual(first);
    expect(JSON.stringify(firstTree.nodes)).toBe(before);
  });

  it("aceita UNKNOWN/null sem elegibilidade automática", () => {
    const input = smallInput();
    const plan = buildCommerceRegistrySyncPlan({
      ...input,
      classifyCategory: (id) => ({
        externalCategoryId: id, scopeStatus: "UNKNOWN", priorityTier: null,
        familyKey: null, commercialFamilyKeyDefault: null, ruleId: "fallback",
        classificationVersion: "generic/v1", reason: null,
      }),
    });
    expect(plan.summary.scope.unknown).toBe(3);
    expect(plan.summary.automaticEligibleCount).toBe(0);
  });


  it("não dá tratamento especial ao nome Outros", () => {
    const nodes = smallTree().nodes.map((node) => node.externalCategoryId === "B"
      ? { ...node, name: "Outros", pathNames: ["Root", "Outros"] }
      : node);
    const renamedTree = new TaxonomyTree(nodes, { requiredRootId: "ROOT" });
    const renamedPlan = buildCommerceRegistrySyncPlan(smallInput(renamedTree));
    expect(renamedPlan.categories.find((category) => category.externalCategoryId === "B")?.name).toBe("Outros");
    expect(renamedPlan.mappings.find((mapping) => mapping.externalCategoryId === "B")).toMatchObject({
      scopeStatus: "EXCLUDED", priorityTier: null,
    });
  });

  it("não possui inputs comerciais de preço, desconto, comissão ou score", () => {
    const keys = Object.keys(smallInput().context);
    expect(keys).not.toEqual(expect.arrayContaining([
      "price", "discount", "commission", "score", "sales", "conversion",
    ]));
  });
});

describe("automotive full snapshot acceptance", () => {
  it("materializa exatamente o baseline comercial congelado e mede o payload", async () => {
    const parsed: unknown = JSON.parse(await readFile(snapshotUrl, "utf8"));
    const snapshot = validateAutomotiveTaxonomySnapshot(parsed).snapshot;
    const tree = snapshotToTaxonomyTree(snapshot);
    const plan = buildCommerceRegistrySyncPlan({
      context: {
        marketplaceKey: "MERCADO_LIVRE",
        siteId: "MLB",
        verticalKey: "AUTOMOTIVE",
        rootExternalCategoryId: "MLB5672",
        sourceVersion: snapshot.sourceVersion,
        expectedClassificationVersion: AUTOMOTIVE_CLASSIFICATION_VERSION,
        configVersion: COMMERCE_REGISTRY_SYNC_CONFIG_VERSION,
        checkedAt: CHECKED_AT,
      },
      taxonomyTree: tree,
      classifyCategory: (externalCategoryId, taxonomyTree) => {
        const result = classifyAutomotiveCategory(externalCategoryId, taxonomyTree);
        return {
          externalCategoryId: result.categoryId,
          scopeStatus: result.scopeStatus,
          priorityTier: result.priorityTier,
          familyKey: result.familyKey,
          commercialFamilyKeyDefault: result.commercialFamilyKeyDefault,
          ruleId: result.ruleId,
          classificationVersion: result.classificationVersion,
          reason: result.reason,
        };
      },
    });

    expect(plan.context).toMatchObject({
      marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
      rootExternalCategoryId: "MLB5672",
    });
    expect(plan.summary).toMatchObject({
      categoryCount: 3269,
      mappingCount: 3269,
      scope: { allowed: 470, review: 1950, excluded: 849, unknown: 0 },
      tiers: { A: 28, B: 116, C: 326 },
      automaticEligibleCount: 144,
    });
    expect(new Set(plan.categories.map((category) => category.externalCategoryId))).toHaveLength(3269);
    expect(new Set(plan.mappings.map((mapping) => mapping.externalCategoryId))).toHaveLength(3269);
    expect(plan.categories.find((category) => category.externalCategoryId === "MLB5672")).toMatchObject({
      parentExternalCategoryId: null,
      pathExternalIds: ["MLB5672"],
    });
    const bytes = Buffer.byteLength(JSON.stringify(plan), "utf8");
    expect(Number.isSafeInteger(bytes)).toBe(true);
    expect(bytes).toBeGreaterThan(0);
  });
});
