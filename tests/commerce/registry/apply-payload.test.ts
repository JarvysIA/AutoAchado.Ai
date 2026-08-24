import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { AUTOMOTIVE_CLASSIFICATION_VERSION, classifyAutomotiveCategory } from "../../../src/commerce/classification/automotive/index.js";
import {
  buildAtomicRegistryApplyPayload,
  COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION,
  measureAtomicRegistryApplyPayload,
  validateAtomicRegistryApplyPayload,
} from "../../../src/commerce/registry/apply-payload.js";
import { buildCommerceRegistrySyncPlan } from "../../../src/commerce/registry/planner.js";
import { COMMERCE_REGISTRY_SYNC_CONFIG_VERSION, type CommerceRegistrySyncPlan } from "../../../src/commerce/registry/types.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../../src/taxonomy/types.js";
import { snapshotToTaxonomyTree, validateAutomotiveTaxonomySnapshot } from "../../helpers/automotive-taxonomy-snapshot.js";

const CHECKED_AT = "2026-08-24T12:00:00.000Z";

function smallPlan(): CommerceRegistrySyncPlan {
  const nodes: TaxonomyCategoryNode[] = [
    { marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "ROOT", name: "Root", parentExternalCategoryId: null,
      childrenExternalCategoryIds: ["A", "B"], pathExternalCategoryIds: ["ROOT"], pathNames: ["Root"], isLeaf: false },
    { marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "A", name: "Mesmo nome", parentExternalCategoryId: "ROOT",
      childrenExternalCategoryIds: [], pathExternalCategoryIds: ["ROOT", "A"], pathNames: ["Root", "Mesmo nome"], isLeaf: true },
    { marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "B", name: "Outros", parentExternalCategoryId: "ROOT",
      childrenExternalCategoryIds: [], pathExternalCategoryIds: ["ROOT", "B"], pathNames: ["Root", "Outros"], isLeaf: true },
  ];
  return buildCommerceRegistrySyncPlan({
    context: { marketplaceKey: "MARKET", siteId: "SITE", verticalKey: "VERTICAL", rootExternalCategoryId: "ROOT",
      sourceVersion: "source/v1", expectedClassificationVersion: "classifier/v1",
      configVersion: COMMERCE_REGISTRY_SYNC_CONFIG_VERSION, checkedAt: CHECKED_AT },
    taxonomyTree: new TaxonomyTree(nodes, { requiredRootId: "ROOT" }),
    classifyCategory: (id) => ({ externalCategoryId: id, scopeStatus: id === "A" ? "ALLOWED" : id === "B" ? "EXCLUDED" : "REVIEW",
      priorityTier: id === "A" ? "A" : null, familyKey: id === "A" ? "family" : null,
      commercialFamilyKeyDefault: id === "A" ? "commercial" : null, ruleId: `rule.${id}`,
      classificationVersion: "classifier/v1", reason: id === "B" ? null : "reason" }),
  });
}

async function fullPlan(): Promise<CommerceRegistrySyncPlan> {
  const snapshotUrl = new URL("../../fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);
  const snapshot = validateAutomotiveTaxonomySnapshot(JSON.parse(await readFile(snapshotUrl, "utf8"))).snapshot;
  const tree = snapshotToTaxonomyTree(snapshot);
  return buildCommerceRegistrySyncPlan({
    context: { marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE", rootExternalCategoryId: "MLB5672",
      sourceVersion: snapshot.sourceVersion, expectedClassificationVersion: AUTOMOTIVE_CLASSIFICATION_VERSION,
      configVersion: COMMERCE_REGISTRY_SYNC_CONFIG_VERSION, checkedAt: CHECKED_AT },
    taxonomyTree: tree,
    classifyCategory: (id, taxonomy) => {
      const result = classifyAutomotiveCategory(id, taxonomy);
      return { externalCategoryId: result.categoryId, scopeStatus: result.scopeStatus, priorityTier: result.priorityTier,
        familyKey: result.familyKey, commercialFamilyKeyDefault: result.commercialFamilyKeyDefault,
        ruleId: result.ruleId, classificationVersion: result.classificationVersion, reason: result.reason };
    },
  });
}

function mutable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("atomic registry apply payload", () => {
  it("combina category e mapping por identidade, preserva campos e usa contrato versionado", () => {
    const plan = smallPlan();
    const payload = buildAtomicRegistryApplyPayload(plan);
    expect(payload.context).toMatchObject({ contractVersion: COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION,
      expectedCategoryCount: 3, expectedMappingCount: 3, expectedAutomaticEligibleCount: 1 });
    expect(payload.rows.map((row) => row.externalCategoryId)).toEqual(["A", "B", "ROOT"]);
    expect(payload.rows.find((row) => row.externalCategoryId === "A")).toMatchObject({
      name: "Mesmo nome", pathExternalIds: ["ROOT", "A"], pathNames: ["Root", "Mesmo nome"],
      scopeStatus: "ALLOWED", priorityTier: "A", familyKey: "family", commercialFamilyKeyDefault: "commercial",
      classificationRule: "rule.A", decisionReason: "reason",
    });
    expect(payload.rows.find((row) => row.externalCategoryId === "B")).toMatchObject({ name: "Outros", decisionReason: null });
  });

  it("é determinístico, não depende de índice e não muta o plan", () => {
    const plan = smallPlan();
    const before = JSON.stringify(plan);
    const reordered = { ...plan, categories: [...plan.categories].reverse(), mappings: [...plan.mappings].reverse() };
    expect(buildAtomicRegistryApplyPayload(reordered)).toEqual(buildAtomicRegistryApplyPayload(plan));
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("rejeita ausência, excesso, duplicata e contexto divergente", () => {
    const plan = smallPlan();
    expect(() => buildAtomicRegistryApplyPayload({ ...plan, mappings: plan.mappings.slice(1) })).toThrowError(/1:1|ausente/);
    expect(() => buildAtomicRegistryApplyPayload({ ...plan, mappings: [...plan.mappings, plan.mappings[0]!] })).toThrow();
    expect(() => buildAtomicRegistryApplyPayload({ ...plan, categories: [...plan.categories, plan.categories[0]!] })).toThrow();
    expect(() => buildAtomicRegistryApplyPayload({ ...plan, mappings: plan.mappings.map((value, index) => index === 0
      ? { ...value, verticalKey: "OTHER" } : value) })).toThrow();
  });

  it("valida root, paths, leaf, scope/tier, counts e IDs duplicados", () => {
    const payload = buildAtomicRegistryApplyPayload(smallPlan());
    const cases = [
      (value: any) => { value.context.contractVersion = "bad"; },
      (value: any) => { value.context.checkedAt = "bad"; },
      (value: any) => { value.context.expectedCategoryCount = 99; },
      (value: any) => { value.rows[0].externalCategoryId = "ROOT"; },
      (value: any) => { value.rows[0].pathNames = ["bad"]; },
      (value: any) => { value.rows[0].isLeaf = false; },
      (value: any) => { value.rows[0].priorityTier = null; },
      (value: any) => { value.context.expectedAutomaticEligibleCount = 0; },
    ];
    for (const change of cases) {
      const candidate = mutable(payload);
      change(candidate);
      expect(() => validateAtomicRegistryApplyPayload(candidate)).toThrow();
    }
  });

  it("mede bytes UTF-8 reais", () => {
    const measurement = measureAtomicRegistryApplyPayload(buildAtomicRegistryApplyPayload(smallPlan()));
    expect(measurement.bytes).toBe(Buffer.byteLength(JSON.stringify(buildAtomicRegistryApplyPayload(smallPlan())), "utf8"));
    expect(measurement.kibibytes).toBe(measurement.bytes / 1024);
    expect(measurement.mebibytes).toBe(measurement.bytes / 1024 / 1024);
  });

  it("aceita o snapshot completo lossless e mantém redução acima de 40%", async () => {
    const plan = await fullPlan();
    const payload = buildAtomicRegistryApplyPayload(plan);
    const measurement = measureAtomicRegistryApplyPayload(payload);
    const fullBytes = Buffer.byteLength(JSON.stringify(plan), "utf8");
    const reduction = 1 - measurement.bytes / fullBytes;
    expect(payload.rows).toHaveLength(3269);
    expect(payload.context).toMatchObject({ expectedCategoryCount: 3269, expectedMappingCount: 3269, expectedAutomaticEligibleCount: 144 });
    expect(fullBytes).toBe(3_110_501);
    expect(measurement.bytes).toBe(1_603_538);
    expect(reduction).toBeGreaterThanOrEqual(0.40);
    const categories = new Map(plan.categories.map((value) => [value.externalCategoryId, value]));
    const mappings = new Map(plan.mappings.map((value) => [value.externalCategoryId, value]));
    for (const row of payload.rows) {
      const category = categories.get(row.externalCategoryId)!;
      const mapping = mappings.get(row.externalCategoryId)!;
      expect(row).toMatchObject({ parentExternalCategoryId: category.parentExternalCategoryId, name: category.name,
        pathExternalIds: category.pathExternalIds, pathNames: category.pathNames, isLeaf: category.isLeaf,
        scopeStatus: mapping.scopeStatus, priorityTier: mapping.priorityTier, familyKey: mapping.familyKey,
        commercialFamilyKeyDefault: mapping.commercialFamilyKeyDefault, classificationRule: mapping.classificationRule,
        decisionReason: mapping.decisionReason });
    }
  });
});
