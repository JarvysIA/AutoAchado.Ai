import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AUTOMOTIVE_CLASSIFICATION_VERSION,
  AutomotiveClassifierError,
  classifyAutomotiveCategory,
  isAutomaticAutomotiveDiscoveryEligible,
} from "../../../../src/commerce/classification/automotive/index.js";
import { TaxonomyTree } from "../../../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../../../src/taxonomy/types.js";
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

describe("classificador automotivo determinístico", () => {
  it.each([
    ["MLB5672", "REVIEW", null],
    ["MLB377674", "EXCLUDED", null],
    ["MLB445767", "EXCLUDED", null],
    ["MLB457400", "EXCLUDED", null],
    ["MLB45468", "EXCLUDED", null],
    ["MLB458209", "EXCLUDED", null],
    ["MLB419936", "EXCLUDED", null],
    ["MLB438364", "EXCLUDED", null],
    ["MLB6005", "EXCLUDED", null],
    ["MLB456046", "EXCLUDED", null],
    ["MLB5802", "REVIEW", null],
    ["MLB455216", "REVIEW", null],
    ["MLB2233", "ALLOWED", "A"],
    ["MLB3933", "ALLOWED", "A"],
    ["MLB4860", "ALLOWED", "B"],
    ["MLB22727", "ALLOWED", "B"],
    ["MLB22648", "ALLOWED", "C"],
  ])("classifica %s como %s/%s", (categoryId, scopeStatus, priorityTier) => {
    const result = classifyAutomotiveCategory(categoryId, tree);
    expect(result).toMatchObject({
      categoryId,
      scopeStatus,
      priorityTier,
      classificationVersion: AUTOMOTIVE_CLASSIFICATION_VERSION,
      commercialFamilyKeyDefault: null,
    });
  });

  it.each([
    "MLB420223", "MLB429043", "MLB433027", "MLB433028", "MLB438193",
    "MLB438194", "MLB439738", "MLB457401", "MLB432914", "MLB438045",
  ])("impede discovery de aplicação de veículo fora do MVP: %s", (categoryId) => {
    const result = classifyAutomotiveCategory(categoryId, tree);
    expect(result.scopeStatus).toBe("EXCLUDED");
    expect(isAutomaticAutomotiveDiscoveryEligible(result)).toBe(false);
  });

  it("aplica precedência exact > ancestral e ancestral mais próximo", () => {
    const cleaningOther = classifyAutomotiveCategory("MLB263725", tree);
    expect(cleaningOther.scopeStatus).toBe("REVIEW");
    expect(cleaningOther.matchedCategoryId).toBe("MLB263725");

    const cleaningLeaf = classifyAutomotiveCategory("MLB263726", tree);
    expect(cleaningLeaf).toMatchObject({ scopeStatus: "ALLOWED", priorityTier: "A", matchedAncestorId: "MLB188063" });

    const heavyFilter = classifyAutomotiveCategory("MLB412436", tree);
    expect(heavyFilter).toMatchObject({ scopeStatus: "EXCLUDED", matchedAncestorId: "MLB419936" });
  });

  it("separa escopo comercial de elegibilidade automática", () => {
    const results = [
      classifyAutomotiveCategory("MLB2233", tree),
      classifyAutomotiveCategory("MLB4860", tree),
      classifyAutomotiveCategory("MLB22648", tree),
      classifyAutomotiveCategory("MLB5672", tree),
      classifyAutomotiveCategory("MLB419936", tree),
    ];
    expect(results.map(isAutomaticAutomotiveDiscoveryEligible)).toEqual([true, true, false, false, false]);
  });

  it("não promove peça específica de baixa vendabilidade pela ancestralidade", () => {
    const specificBrakePart = classifyAutomotiveCategory("MLB445790", tree);
    const commonBrakePart = classifyAutomotiveCategory("MLB47097", tree);
    expect(specificBrakePart).toMatchObject({ scopeStatus: "ALLOWED", priorityTier: "C" });
    expect(isAutomaticAutomotiveDiscoveryEligible(specificBrakePart)).toBe(false);
    expect(commonBrakePart).toMatchObject({ scopeStatus: "ALLOWED", priorityTier: "B" });
    expect(isAutomaticAutomotiveDiscoveryEligible(commonBrakePart)).toBe(true);
  });

  it("não usa nome como identidade", () => {
    expect(tree.getNode("MLB6789").name).toBe("Freios");
    expect(tree.getNode("MLB45558").name).toBe("Freios");
    expect(tree.getNode("MLB437918").name).toBe("Freios");
    expect([
      classifyAutomotiveCategory("MLB6789", tree).scopeStatus,
      classifyAutomotiveCategory("MLB45558", tree).scopeStatus,
      classifyAutomotiveCategory("MLB437918", tree).scopeStatus,
    ]).toEqual(["ALLOWED", "REVIEW", "EXCLUDED"]);
  });

  it("é determinístico em 100 execuções e independente da ordem dos nós", () => {
    const expected = classifyAutomotiveCategory("MLB47097", tree);
    for (let index = 0; index < 100; index += 1) {
      expect(classifyAutomotiveCategory("MLB47097", tree)).toEqual(expected);
    }
    const reordered = new TaxonomyTree([...tree.nodes].reverse(), { requiredRootId: "MLB5672" });
    expect(classifyAutomotiveCategory("MLB47097", reordered)).toEqual(expected);
  });

  it("falha fechado para categoria nova sem regra", () => {
    const syntheticId = "MLB999999990";
    const nodes: TaxonomyCategoryNode[] = tree.nodes.map((node) => node.externalCategoryId === "MLB5672"
      ? { ...node, childrenExternalCategoryIds: [...node.childrenExternalCategoryIds, syntheticId], isLeaf: false }
      : { ...node, childrenExternalCategoryIds: [...node.childrenExternalCategoryIds], pathExternalCategoryIds: [...node.pathExternalCategoryIds], pathNames: [...node.pathNames] });
    nodes.push({
      marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", externalCategoryId: syntheticId,
      name: "Categoria futura", parentExternalCategoryId: "MLB5672", childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["MLB5672", syntheticId], pathNames: ["Acessórios para Veículos", "Categoria futura"], isLeaf: true,
    });
    const syntheticTree = new TaxonomyTree(nodes, { requiredRootId: "MLB5672" });
    const result = classifyAutomotiveCategory(syntheticId, syntheticTree);
    expect(result).toMatchObject({ scopeStatus: "UNKNOWN", reason: "FALLBACK_UNKNOWN" });
    expect(isAutomaticAutomotiveDiscoveryEligible(result)).toBe(false);
  });

  it("exclui categoria válida fora da raiz", () => {
    const outside: TaxonomyCategoryNode = {
      marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", externalCategoryId: "MLB999999991",
      name: "Outra vertical", parentExternalCategoryId: null, childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["MLB999999991"], pathNames: ["Outra vertical"], isLeaf: true,
    };
    const expanded = new TaxonomyTree([...tree.nodes, outside], { requiredRootId: "MLB5672" });
    expect(classifyAutomotiveCategory(outside.externalCategoryId, expanded)).toMatchObject({
      insideRoot: false, scopeStatus: "EXCLUDED", reason: "OUTSIDE_ROOT",
    });
  });

  it("usa erro tipado para ID ausente", () => {
    expect(() => classifyAutomotiveCategory("MLB999999999", tree)).toThrowError(
      expect.objectContaining<Partial<AutomotiveClassifierError>>({ code: "AUTOMOTIVE_CLASSIFIER_NODE_NOT_FOUND" }),
    );
  });
});
