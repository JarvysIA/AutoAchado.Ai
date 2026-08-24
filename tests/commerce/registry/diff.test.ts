import { describe, expect, it } from "vitest";
import { RegistrySyncError } from "../../../src/commerce/registry/errors.js";
import { diffCommerceRegistryState } from "../../../src/commerce/registry/diff.js";
import { buildCommerceRegistrySyncPlan } from "../../../src/commerce/registry/planner.js";
import type {
  CommerceRegistrySyncPlan,
  CurrentCommerceRegistryState,
  CurrentMarketplaceCategory,
  CurrentVerticalCategoryMapping,
  DesiredMarketplaceCategory,
  DesiredVerticalCategoryMapping,
} from "../../../src/commerce/registry/types.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../../src/taxonomy/types.js";

const CHECKED_AT = "2026-08-24T12:00:00.000Z";

function tree(): TaxonomyTree {
  const nodes: TaxonomyCategoryNode[] = [
    {
      marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "ROOT", name: "Root",
      parentExternalCategoryId: null, childrenExternalCategoryIds: ["A"],
      pathExternalCategoryIds: ["ROOT"], pathNames: ["Root"], isLeaf: false,
    },
    {
      marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "A", name: "A",
      parentExternalCategoryId: "ROOT", childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["ROOT", "A"], pathNames: ["Root", "A"], isLeaf: true,
    },
  ];
  return new TaxonomyTree(nodes, { requiredRootId: "ROOT" });
}

function plan(sourceVersion = "source/v1", classificationVersion = "classifier/v1", checkedAt = CHECKED_AT) {
  return buildCommerceRegistrySyncPlan({
    context: {
      marketplaceKey: "MARKET", siteId: "SITE", verticalKey: "AUTO", rootExternalCategoryId: "ROOT",
      sourceVersion, expectedClassificationVersion: classificationVersion, configVersion: "sync/v1", checkedAt,
    },
    taxonomyTree: tree(),
    classifyCategory: (id) => ({
      externalCategoryId: id,
      scopeStatus: id === "A" ? "ALLOWED" : "REVIEW",
      priorityTier: id === "A" ? "A" : null,
      familyKey: id === "A" ? "family" : null,
      commercialFamilyKeyDefault: null,
      ruleId: `rule.${id}`,
      classificationVersion,
      reason: "fixture",
    }),
  });
}

function currentCategory(value: DesiredMarketplaceCategory, overrides: Partial<CurrentMarketplaceCategory> = {}): CurrentMarketplaceCategory {
  return {
    marketplaceKey: value.marketplaceKey,
    siteId: value.siteId,
    externalCategoryId: value.externalCategoryId,
    parentExternalCategoryId: value.parentExternalCategoryId,
    name: value.name,
    pathExternalIds: value.pathExternalIds,
    pathNames: value.pathNames,
    isLeaf: value.isLeaf,
    active: value.active,
    sourceVersion: value.sourceVersion,
    configVersion: value.configVersion,
    ...overrides,
  };
}

function currentMapping(value: DesiredVerticalCategoryMapping, overrides: Partial<CurrentVerticalCategoryMapping> = {}): CurrentVerticalCategoryMapping {
  return {
    verticalKey: value.verticalKey,
    marketplaceKey: value.marketplaceKey,
    siteId: value.siteId,
    externalCategoryId: value.externalCategoryId,
    scopeStatus: value.scopeStatus,
    priorityTier: value.priorityTier,
    familyKey: value.familyKey,
    commercialFamilyKeyDefault: value.commercialFamilyKeyDefault,
    classificationRule: value.classificationRule,
    classificationVersion: value.classificationVersion,
    manualOverride: false,
    decisionSource: "AUTO",
    decisionReason: value.decisionReason,
    decidedAt: CHECKED_AT,
    active: value.active,
    ...overrides,
  };
}

function matchingCurrent(desired = plan()): CurrentCommerceRegistryState {
  return {
    categories: desired.categories.map((value) => currentCategory(value)),
    mappings: desired.mappings.map((value) => currentMapping(value)),
    controlledMappingExternalCategoryIds: desired.mappings.map((value) => value.externalCategoryId),
  };
}

function withMappings(desired: CommerceRegistrySyncPlan, mappings: readonly DesiredVerticalCategoryMapping[]): CommerceRegistrySyncPlan {
  return { ...desired, mappings, summary: { ...desired.summary, mappingCount: mappings.length } };
}

describe("category diff semantics", () => {
  it("insere current vazio e é determinístico com current reordenado", () => {
    const desired = plan();
    const empty = { categories: [], mappings: [], controlledMappingExternalCategoryIds: [] };
    const first = diffCommerceRegistryState(desired, empty);
    expect(first.categories.map((operation) => operation.kind)).toEqual(["INSERT", "INSERT"]);
    expect(first.mappings.map((operation) => operation.kind)).toEqual(["INSERT", "INSERT"]);
    const current = matchingCurrent(desired);
    expect(diffCommerceRegistryState(desired, current)).toEqual(diffCommerceRegistryState(desired, {
      ...current,
      categories: [...current.categories].reverse(),
      mappings: [...current.mappings].reverse(),
      controlledMappingExternalCategoryIds: [...current.controlledMappingExternalCategoryIds].reverse(),
    }));
  });

  it("mantém replay idêntico unchanged mesmo com checkedAt diferente", () => {
    const first = plan();
    const replay = plan("source/v1", "classifier/v1", "2027-01-01T00:00:00.000Z");
    const diff = diffCommerceRegistryState(replay, matchingCurrent(first));
    expect(diff.categories.every((operation) => operation.kind === "UNCHANGED")).toBe(true);
    expect(diff.mappings.every((operation) => operation.kind === "UNCHANGED")).toBe(true);
  });

  it.each([
    ["name", { name: "Old" }],
    ["parent", { parentExternalCategoryId: "OLD" }],
    ["path ids", { pathExternalIds: ["OLD"] }],
    ["path names", { pathNames: ["Old"] }],
    ["leaf", { isLeaf: false }],
    ["config", { configVersion: "old" }],
  ] as const)("detecta update factual de %s", (_label, overrides) => {
    const desired = plan();
    const target = desired.categories.find((value) => value.externalCategoryId === "A")!;
    const current = matchingCurrent(desired);
    const categories = current.categories.map((value) => value.externalCategoryId === "A"
      ? currentCategory(target, overrides)
      : value);
    const diff = diffCommerceRegistryState(desired, { ...current, categories });
    expect(diff.categories.find((operation) => operation.desired.externalCategoryId === "A")?.kind).toBe("UPDATE");
  });

  it("atualiza sourceVersion independentemente e reativa fato externo presente", () => {
    const old = plan("source/v1");
    const next = plan("source/v2");
    expect(diffCommerceRegistryState(next, matchingCurrent(old)).categories.every((operation) => operation.kind === "UPDATE"))
      .toBe(true);

    const current = matchingCurrent(old);
    const categories = current.categories.map((value) => ({ ...value, active: false }));
    expect(diffCommerceRegistryState(old, { ...current, categories }).categories.every((operation) => operation.kind === "REACTIVATE"))
      .toBe(true);
  });

  it("nunca inativa marketplace category ausente do desired vertical", () => {
    const desired = plan();
    const current = matchingCurrent(desired);
    const extra: CurrentMarketplaceCategory = {
      marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "MISSING",
      parentExternalCategoryId: null, name: "Missing", pathExternalIds: ["MISSING"],
      pathNames: ["Missing"], isLeaf: true, active: true, sourceVersion: "old", configVersion: "sync/v1",
    };
    const diff = diffCommerceRegistryState(desired, { ...current, categories: [...current.categories, extra] });
    expect(diff.categories).toHaveLength(desired.categories.length);
    expect(diff.categories.some((operation) => operation.identityKey.includes("MISSING"))).toBe(false);
  });
});

describe("mapping diff and manual override semantics", () => {
  it("atualiza AUTO quando decisão/classifier version muda", () => {
    const old = plan("source/v1", "classifier/v1");
    const next = plan("source/v1", "classifier/v2");
    const diff = diffCommerceRegistryState(next, matchingCurrent(old));
    expect(diff.mappings.every((operation) => operation.kind === "UPDATE" && operation.decisionChanged)).toBe(true);
  });

  it("preserva decisão MANUAL divergente e retorna MANUAL_OVERRIDE_SKIPPED", () => {
    const desired = plan();
    const current = matchingCurrent(desired);
    const mappings = current.mappings.map((value) => value.externalCategoryId === "A"
      ? {
        ...value, scopeStatus: "REVIEW" as const, priorityTier: null,
        familyKey: null, classificationRule: "manual", classificationVersion: "manual/v1",
        manualOverride: true, decisionSource: "MANUAL" as const, decisionReason: "human",
      }
      : value);
    const diff = diffCommerceRegistryState(desired, { ...current, mappings });
    const operation = diff.mappings.find((value) => value.current?.externalCategoryId === "A")!;
    expect(operation).toMatchObject({ kind: "MANUAL_OVERRIDE_SKIPPED", decisionChanged: false });
    expect(operation.current).toMatchObject({ scopeStatus: "REVIEW", priorityTier: null, decisionSource: "MANUAL" });
  });

  it("permite inativar e reativar mapping manual sem mudar decisão", () => {
    const desired = plan();
    const mappingA = desired.mappings.find((value) => value.externalCategoryId === "A")!;
    const manual = currentMapping(mappingA, {
      scopeStatus: "REVIEW", priorityTier: null, familyKey: null, classificationRule: "manual",
      classificationVersion: "manual/v1", manualOverride: true, decisionSource: "MANUAL",
      decisionReason: "human", active: true,
    });
    const withoutA = withMappings(desired, desired.mappings.filter((value) => value.externalCategoryId !== "A"));
    const inactive = diffCommerceRegistryState(withoutA, {
      categories: [], mappings: [manual], controlledMappingExternalCategoryIds: ["A"],
    }).mappings[0]!;
    expect(inactive).toMatchObject({ kind: "INACTIVATE", decisionChanged: false });
    expect(inactive.current).toMatchObject({ scopeStatus: "REVIEW", manualOverride: true });

    const reactivate = diffCommerceRegistryState(desired, {
      categories: [], mappings: [{ ...manual, active: false }], controlledMappingExternalCategoryIds: ["A"],
    }).mappings.find((value) => value.current?.externalCategoryId === "A")!;
    expect(reactivate).toMatchObject({ kind: "REACTIVATE", decisionChanged: false });
    expect(reactivate.current).toMatchObject({ scopeStatus: "REVIEW", manualOverride: true });
  });

  it("inativa somente mapping ausente e explicitamente pertencente ao universo", () => {
    const desired = plan();
    const current = matchingCurrent(desired);
    const extra = currentMapping(desired.mappings[0]!, { externalCategoryId: "MISSING" });
    const controlled = diffCommerceRegistryState(desired, {
      ...current, mappings: [...current.mappings, extra], controlledMappingExternalCategoryIds: ["MISSING"],
    });
    expect(controlled.mappings.find((value) => value.current?.externalCategoryId === "MISSING")?.kind).toBe("INACTIVATE");

    const outside = diffCommerceRegistryState(desired, {
      ...current, mappings: [...current.mappings, extra], controlledMappingExternalCategoryIds: [],
    });
    expect(outside.mappings.some((value) => value.current?.externalCategoryId === "MISSING")).toBe(false);
  });

  it("não toca outra vertical, site ou marketplace", () => {
    const desired = plan();
    const current = matchingCurrent(desired);
    const base = desired.mappings[0]!;
    const outsiders = [
      currentMapping(base, { verticalKey: "HOME" }),
      currentMapping(base, { siteId: "MLA" }),
      currentMapping(base, { marketplaceKey: "OTHER" }),
    ];
    const diff = diffCommerceRegistryState(desired, {
      ...current, mappings: [...current.mappings, ...outsiders], controlledMappingExternalCategoryIds: [base.externalCategoryId],
    });
    expect(diff.mappings).toHaveLength(desired.mappings.length);
    expect(diff.mappings.every((operation) => operation.kind === "UNCHANGED")).toBe(true);
  });

  it("falha fechado para duplicates e inconsistência manual/source", () => {
    const desired = plan();
    const current = matchingCurrent(desired);
    expect(() => diffCommerceRegistryState(desired, {
      ...current, categories: [...current.categories, current.categories[0]!],
    })).toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({
      code: "REGISTRY_DUPLICATE_CURRENT_CATEGORY",
    }));
    expect(() => diffCommerceRegistryState(desired, {
      ...current, mappings: [...current.mappings, current.mappings[0]!],
    })).toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({
      code: "REGISTRY_DUPLICATE_CURRENT_MAPPING",
    }));
    expect(() => diffCommerceRegistryState(desired, {
      ...current,
      mappings: [{ ...current.mappings[0]!, manualOverride: true, decisionSource: "AUTO" }],
    })).toThrowError(expect.objectContaining<Partial<RegistrySyncError>>({
      code: "REGISTRY_INVALID_CURRENT_STATE",
    }));
  });
});
