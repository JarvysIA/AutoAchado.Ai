import { describe, expect, it } from "vitest";
import { RegistrySyncError } from "../../../src/commerce/registry/errors.js";
import { buildCommerceRegistrySyncPlan } from "../../../src/commerce/registry/planner.js";
import type { RegistryClassifierOutput } from "../../../src/commerce/registry/types.js";
import {
  validateRegistrySyncContext,
  validateRegistryTaxonomyUniverse,
} from "../../../src/commerce/registry/validation.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../../src/taxonomy/types.js";

const context = {
  marketplaceKey: "MARKET",
  siteId: "SITE",
  verticalKey: "VERTICAL",
  rootExternalCategoryId: "ROOT",
  sourceVersion: "source/v1",
  expectedClassificationVersion: "classifier/v1",
  configVersion: "sync/v1",
  checkedAt: "2026-08-24T12:00:00.000Z",
} as const;

function validNodes(): TaxonomyCategoryNode[] {
  return [
    {
      marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "ROOT", name: "Root",
      parentExternalCategoryId: null, childrenExternalCategoryIds: ["CHILD"],
      pathExternalCategoryIds: ["ROOT"], pathNames: ["Root"], isLeaf: false,
    },
    {
      marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "CHILD", name: "Child",
      parentExternalCategoryId: "ROOT", childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["ROOT", "CHILD"], pathNames: ["Root", "Child"], isLeaf: true,
    },
  ];
}

function rootTree(): TaxonomyTree {
  return new TaxonomyTree([{
    marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "ROOT", name: "Root",
    parentExternalCategoryId: null, childrenExternalCategoryIds: [],
    pathExternalCategoryIds: ["ROOT"], pathNames: ["Root"], isLeaf: true,
  }], { requiredRootId: "ROOT" });
}

function classification(overrides: Partial<RegistryClassifierOutput> = {}): RegistryClassifierOutput {
  return {
    externalCategoryId: "ROOT",
    scopeStatus: "ALLOWED",
    priorityTier: "A",
    familyKey: null,
    commercialFamilyKeyDefault: null,
    ruleId: "rule",
    classificationVersion: "classifier/v1",
    reason: null,
    ...overrides,
  };
}

describe("registry tree and context validation", () => {
  it("aceita árvore coerente", () => {
    expect(() => validateRegistryTaxonomyUniverse(validNodes(), context)).not.toThrow();
  });

  it("rejeita duplicate ID, parent ausente, path e leaf divergentes", () => {
    const duplicate = [...validNodes(), { ...validNodes()[1]! }];
    expect(() => validateRegistryTaxonomyUniverse(duplicate, context)).toThrowError(
      expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_DUPLICATE_CATEGORY_ID" }),
    );

    const missingParent = validNodes();
    missingParent[1] = { ...missingParent[1]!, parentExternalCategoryId: "MISSING" };
    expect(() => validateRegistryTaxonomyUniverse(missingParent, context)).toThrowError(
      expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_MISSING_PARENT" }),
    );

    const invalidPath = validNodes();
    invalidPath[1] = { ...invalidPath[1]!, pathExternalCategoryIds: ["ROOT", "OTHER"] };
    expect(() => validateRegistryTaxonomyUniverse(invalidPath, context)).toThrowError(
      expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_INVALID_PATH" }),
    );

    const invalidLeaf = validNodes();
    invalidLeaf[1] = { ...invalidLeaf[1]!, isLeaf: false };
    expect(() => validateRegistryTaxonomyUniverse(invalidLeaf, context)).toThrowError(
      expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_INVALID_TREE" }),
    );
  });

  it("rejeita raiz ausente/divergente e ciclos no contrato TaxonomyTree", () => {
    const wrongRoot = validNodes();
    expect(() => validateRegistryTaxonomyUniverse(wrongRoot, { ...context, rootExternalCategoryId: "OTHER" }))
      .toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_INVALID_TREE" }));

    const cycle: TaxonomyCategoryNode[] = [
      {
        marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "A", name: "A",
        parentExternalCategoryId: "B", childrenExternalCategoryIds: ["B"],
        pathExternalCategoryIds: ["A"], pathNames: ["A"], isLeaf: false,
      },
      {
        marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "B", name: "B",
        parentExternalCategoryId: "A", childrenExternalCategoryIds: ["A"],
        pathExternalCategoryIds: ["B"], pathNames: ["B"], isLeaf: false,
      },
    ];
    expect(() => new TaxonomyTree(cycle)).toThrow(/CYCLE/);
  });

  it("rejeita sourceVersion, configVersion e demais campos obrigatórios vazios", () => {
    expect(() => validateRegistrySyncContext({ ...context, sourceVersion: "" })).toThrowError(
      expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_INVALID_CONTEXT" }),
    );
    expect(() => validateRegistrySyncContext({ ...context, configVersion: "" })).toThrowError(
      expect.objectContaining<Partial<RegistrySyncError>>({ code: "REGISTRY_INVALID_CONTEXT" }),
    );
  });
});

describe("registry classifier boundary validation", () => {
  it.each([
    ["ALLOWED", null],
    ["REVIEW", "A"],
    ["EXCLUDED", "B"],
    ["UNKNOWN", "C"],
  ] as const)("rejeita combinação %s/%s", (scopeStatus, priorityTier) => {
    expect(() => buildCommerceRegistrySyncPlan({
      context,
      taxonomyTree: rootTree(),
      classifyCategory: () => classification({ scopeStatus, priorityTier }),
    })).toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({
      code: "REGISTRY_INVALID_CLASSIFICATION",
    }));
  });

  it("rejeita ID e classificationVersion divergentes", () => {
    expect(() => buildCommerceRegistrySyncPlan({
      context,
      taxonomyTree: rootTree(),
      classifyCategory: () => classification({ externalCategoryId: "OTHER" }),
    })).toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({
      code: "REGISTRY_INVALID_CLASSIFICATION",
    }));
    expect(() => buildCommerceRegistrySyncPlan({
      context,
      taxonomyTree: rootTree(),
      classifyCategory: () => classification({ classificationVersion: "classifier/v2" }),
    })).toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({
      code: "REGISTRY_CLASSIFICATION_VERSION_MISMATCH",
    }));
  });
});
