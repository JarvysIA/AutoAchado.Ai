import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyAutomotiveCategory,
  isAutomaticAutomotiveDiscoveryEligible,
} from "../../../../src/commerce/classification/automotive/index.js";
import type { AutomotiveCategoryClassification } from "../../../../src/commerce/classification/automotive/index.js";
import type { TaxonomyTree } from "../../../../src/taxonomy/tree.js";
import {
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../../../helpers/automotive-taxonomy-snapshot.js";

const snapshotUrl = new URL("../../../fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);
const reportUrl = new URL("../../../../reports/0B3B2-classifier-coverage.md", import.meta.url);
let tree: TaxonomyTree;
let results: readonly AutomotiveCategoryClassification[];

beforeAll(async () => {
  const parsed: unknown = JSON.parse(await readFile(snapshotUrl, "utf8"));
  const snapshot = validateAutomotiveTaxonomySnapshot(parsed).snapshot;
  tree = snapshotToTaxonomyTree(snapshot);
  results = snapshot.nodes.map((node) => classifyAutomotiveCategory(node.externalCategoryId, tree));
});

const subtreeIds = (rootId: string): readonly string[] => [
  rootId,
  ...tree.getDescendants(rootId).map((node) => node.externalCategoryId),
];

describe("cobertura integral e invariantes comerciais", () => {
  it("classifica os 3269 nós exatamente uma vez e fecha as contagens", () => {
    expect(results).toHaveLength(3269);
    expect(new Set(results.map((result) => result.categoryId))).toHaveLength(3269);
    const decided = results.filter((result) =>
      ["ALLOWED", "REVIEW", "EXCLUDED", "UNKNOWN"].includes(result.scopeStatus));
    expect(decided).toHaveLength(3269);
    const byScope = results.reduce<Record<string, number>>((counts, result) => {
      counts[result.scopeStatus] = (counts[result.scopeStatus] ?? 0) + 1;
      return counts;
    }, {});
    expect(Object.values(byScope).reduce((sum, count) => sum + count, 0)).toBe(3269);
  });

  it("mantém o relatório versionado sincronizado com as contagens", async () => {
    const report = await readFile(reportUrl, "utf8");
    const expectedLines = [
      `| Total nodes | ${results.length} |`,
      `| ALLOWED | ${results.filter((result) => result.scopeStatus === "ALLOWED").length} |`,
      `| REVIEW | ${results.filter((result) => result.scopeStatus === "REVIEW").length} |`,
      `| EXCLUDED | ${results.filter((result) => result.scopeStatus === "EXCLUDED").length} |`,
      `| UNKNOWN | ${results.filter((result) => result.scopeStatus === "UNKNOWN").length} |`,
      `| Automatic discovery eligible | ${results.filter(isAutomaticAutomotiveDiscoveryEligible).length} |`,
    ];
    for (const line of expectedLines) expect(report).toContain(line);
  });

  it("só libera ALLOWED A/B para discovery automático", () => {
    for (const result of results) {
      const eligible = isAutomaticAutomotiveDiscoveryEligible(result);
      expect(eligible).toBe(result.scopeStatus === "ALLOWED"
        && (result.priorityTier === "A" || result.priorityTier === "B"));
      if (["C", null].includes(result.priorityTier)) expect(eligible).toBe(false);
    }
  });

  it.each([
    ["serviços", "MLB377674", 33],
    ["GNV", "MLB45468", 11],
    ["motos completas", "MLB458209", 4],
  ])("exclui integralmente %s", (_label, rootId, expectedCount) => {
    const ids = subtreeIds(rootId);
    expect(ids).toHaveLength(expectedCount);
    for (const id of ids) {
      const result = classifyAutomotiveCategory(id, tree);
      expect(result.scopeStatus).toBe("EXCLUDED");
      expect(isAutomaticAutomotiveDiscoveryEligible(result)).toBe(false);
    }
  });

  it.each([
    "MLB419936", "MLB438364", "MLB6005", "MLB456046",
  ])("bloqueia discovery em toda subtree excluída %s", (rootId) => {
    for (const id of subtreeIds(rootId)) {
      const result = classifyAutomotiveCategory(id, tree);
      expect(result.scopeStatus).toBe("EXCLUDED");
      expect(isAutomaticAutomotiveDiscoveryEligible(result)).toBe(false);
    }
  });

  it("limita pneus automáticos a carro/caminhonete e moto", () => {
    const automaticTires = subtreeIds("MLB2238")
      .map((id) => classifyAutomotiveCategory(id, tree))
      .filter(isAutomaticAutomotiveDiscoveryEligible)
      .map((result) => result.categoryId)
      .sort();
    expect(automaticTires).toEqual(["MLB2233", "MLB3933"]);
  });

  it("não deixa branches mistas promoverem aplicações excluídas", () => {
    const forbiddenIds = [
      "MLB420223", "MLB429043", "MLB433027", "MLB433028", "MLB438193",
      "MLB438194", "MLB439738", "MLB457401", "MLB432914", "MLB438045",
      "MLB430686", "MLB432920", "MLB456115", "MLB456116", "MLB456130",
    ];
    for (const id of forbiddenIds) {
      expect(isAutomaticAutomotiveDiscoveryEligible(classifyAutomotiveCategory(id, tree))).toBe(false);
    }
  });

  it("mantém branches amplas e ambíguas fora do discovery automático", () => {
    const mixedRoots = ["MLB1747", "MLB1771", "MLB22693", "MLB243551", "MLB456111", "MLB260634", "MLB1776"];
    for (const id of mixedRoots) {
      expect(isAutomaticAutomotiveDiscoveryEligible(classifyAutomotiveCategory(id, tree))).toBe(false);
    }
  });
});
