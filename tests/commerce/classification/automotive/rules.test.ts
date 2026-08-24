import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AUTOMOTIVE_MLB_RULES_V1,
  validateAutomotiveClassifierRules,
} from "../../../../src/commerce/classification/automotive/index.js";
import type {
  AutomotiveCategoryRule,
  AutomotiveClassifierRules,
} from "../../../../src/commerce/classification/automotive/index.js";
import type { TaxonomyTree } from "../../../../src/taxonomy/tree.js";
import {
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../../../helpers/automotive-taxonomy-snapshot.js";

const snapshotUrl = new URL("../../../fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);
let tree: TaxonomyTree;

beforeAll(async () => {
  const parsed: unknown = JSON.parse(await readFile(snapshotUrl, "utf8"));
  tree = snapshotToTaxonomyTree(validateAutomotiveTaxonomySnapshot(parsed).snapshot);
});

const cloneRules = (): AutomotiveClassifierRules =>
  JSON.parse(JSON.stringify(AUTOMOTIVE_MLB_RULES_V1)) as AutomotiveClassifierRules;
const sampleReview = (categoryId: string, ruleId: string): AutomotiveCategoryRule => ({
  categoryId, ruleId, scopeStatus: "REVIEW", priorityTier: null, familyKey: null,
  commercialFamilyKeyDefault: null, reason: "RESIDUAL_REVIEW",
});

describe("validação do ruleset automotivo", () => {
  it("aceita o ruleset congelado e não contém regras baseadas em nome ou preço", () => {
    expect(() => validateAutomotiveClassifierRules(AUTOMOTIVE_MLB_RULES_V1, tree)).not.toThrow();
    const serialized = JSON.stringify(AUTOMOTIVE_MLB_RULES_V1);
    expect(serialized).not.toContain('"name"');
    expect(serialized).not.toContain("price");
    expect(serialized).not.toContain("discount");
    expect(serialized).not.toContain("commission");
  });

  it.each([
    ["exact duplicada", (rules: AutomotiveClassifierRules) => (rules.exactRules as AutomotiveCategoryRule[]).push(rules.exactRules[0]!)],
    ["ancestral duplicada", (rules: AutomotiveClassifierRules) => (rules.ancestorRules as AutomotiveCategoryRule[]).push(rules.ancestorRules[0]!)],
    ["ruleId duplicada", (rules: AutomotiveClassifierRules) => (rules.exactRules as AutomotiveCategoryRule[]).push({ ...sampleReview("MLB22223", rules.exactRules[0]!.ruleId), categoryId: "MLB271606" })],
  ])("rejeita %s", (_label, mutate) => {
    const rules = cloneRules();
    mutate(rules);
    expect(() => validateAutomotiveClassifierRules(rules, tree)).toThrow(/Ruleset automotivo inválido/);
  });

  it.each([
    ["ALLOWED sem tier", { scopeStatus: "ALLOWED", priorityTier: null }],
    ["REVIEW com tier", { scopeStatus: "REVIEW", priorityTier: "A" }],
    ["UNKNOWN com tier", { scopeStatus: "UNKNOWN", priorityTier: "B" }],
    ["EXCLUDED com tier", { scopeStatus: "EXCLUDED", priorityTier: "C" }],
    ["scope desconhecido", { scopeStatus: "INVALID" }],
    ["tier desconhecido", { scopeStatus: "ALLOWED", priorityTier: "D", familyKey: "filters" }],
    ["family inválida", { familyKey: "Invalid Family" }],
  ])("rejeita decisão inválida: %s", (_label, changes) => {
    const rules = cloneRules();
    (rules.exactRules as AutomotiveCategoryRule[])[0] = {
      ...rules.exactRules[0]!,
      ...changes,
    } as AutomotiveCategoryRule;
    expect(() => validateAutomotiveClassifierRules(rules, tree)).toThrow(/Ruleset automotivo inválido/);
  });

  it("rejeita categoria inexistente", () => {
    const rules = cloneRules();
    (rules.exactRules as AutomotiveCategoryRule[]).push(sampleReview("MLB999999999", "invalid.missing"));
    expect(() => validateAutomotiveClassifierRules(rules, tree)).toThrow(/CATEGORY_NOT_FOUND/);
  });

  it("detecta ALLOWED acidental sob ancestral EXCLUDED", () => {
    const rules = cloneRules();
    (rules.exactRules as AutomotiveCategoryRule[]).push({
      categoryId: "MLB445767", ruleId: "invalid.service-override", scopeStatus: "ALLOWED",
      priorityTier: "A", familyKey: "brakes", commercialFamilyKeyDefault: null,
      reason: "EXACT_OVERRIDE",
    });
    expect(() => validateAutomotiveClassifierRules(rules, tree)).toThrow(/ALLOWED_UNDER_EXCLUDED_ANCESTOR/);
  });
});
