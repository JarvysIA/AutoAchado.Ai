import { describe, expect, it } from "vitest";
import { TaxonomyError } from "../../src/taxonomy/errors.js";
import {
  calculateInternalChecksum,
  canonicalizeTaxonomy,
  parseCategoryDetail,
  parseMeliCategoryTree,
  parseSiteCategories,
} from "../../src/taxonomy/parser.js";
import { TaxonomyTree } from "../../src/taxonomy/tree.js";
import {
  categoryDetailPayload,
  siteCategoriesPayload,
  TEST_ROOT_ID,
  validAutomotiveDump,
} from "../fixtures/meli-taxonomy.js";

function reasonOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof TaxonomyError ? error.details.reason : null;
  }
}

describe("parser de taxonomia", () => {
  it("normaliza categorias do site e detalhe sem campos extras", () => {
    expect(parseSiteCategories(siteCategoriesPayload, "MLB")).toEqual([
      { externalCategoryId: TEST_ROOT_ID, name: "Acessórios para Veículos" },
    ]);
    expect(parseCategoryDetail(categoryDetailPayload, "MLB")).toMatchObject({
      externalCategoryId: "MLB900000001",
      childrenExternalCategoryIds: ["MLB900000002"],
      pathExternalCategoryIds: [TEST_ROOT_ID, "MLB900000001"],
    });
  });

  it("normaliza dump aninhado e ignora campos adicionais", () => {
    const nodes = parseMeliCategoryTree(validAutomotiveDump(), "MLB");
    expect(nodes).toHaveLength(4);
    expect(nodes.find((node) => node.externalCategoryId === "MLB900000002")).toMatchObject({
      parentExternalCategoryId: "MLB900000001",
      isLeaf: true,
    });
    expect(() => new TaxonomyTree(nodes, { requiredRootId: TEST_ROOT_ID })).not.toThrow();
  });

  it.each([
    ["payload vazio", []],
    ["ID inválido", [{ id: "INVALID", name: "Teste", children_categories: [] }]],
    ["name inválido", [{ id: TEST_ROOT_ID, name: "", children_categories: [] }]],
    ["children inválido", [{ id: TEST_ROOT_ID, name: "Teste", children_categories: {} }]],
    ["path inválido", [{ id: TEST_ROOT_ID, name: "Teste", path_from_root: {}, children_categories: [] }]],
  ])("rejeita %s", (_label, payload) => {
    expect(() => parseMeliCategoryTree(payload, "MLB")).toThrowError(TaxonomyError);
  });

  it("rejeita site divergente", () => {
    expect(reasonOf(() => parseMeliCategoryTree([
      { id: "MLA900000001", name: "Site divergente", children_categories: [] },
    ], "MLB"))).toBe("SITE_MISMATCH");
  });

  it("detecta duplicate ID e root ausente na construção", () => {
    const nodes = parseMeliCategoryTree(validAutomotiveDump(), "MLB");
    expect(reasonOf(() => new TaxonomyTree([...nodes, nodes[0]!]))).toBe("DUPLICATE_ID");
    expect(reasonOf(() => new TaxonomyTree(nodes, { requiredRootId: "MLB999999999" }))).toBe("ROOT_MISSING");
  });

  it("detecta path divergente", () => {
    const raw = validAutomotiveDump() as Array<Record<string, unknown>>;
    const root = raw[0]!;
    const children = root.children_categories as Array<Record<string, unknown>>;
    children[0]!.path_from_root = [{ id: TEST_ROOT_ID, name: "Acessórios para Veículos" }];
    const nodes = parseMeliCategoryTree(raw, "MLB");
    expect(reasonOf(() => new TaxonomyTree(nodes))).toBe("PATH_MISMATCH");
  });

  it("interrompe o parser nos limites de nós e profundidade", () => {
    expect(reasonOf(() => parseMeliCategoryTree(validAutomotiveDump(), "MLB", { maxNodes: 3 }))).toBe("NODE_LIMIT");
    expect(reasonOf(() => parseMeliCategoryTree(validAutomotiveDump(), "MLB", { maxDepth: 2 }))).toBe("DEPTH_LIMIT");
  });

  it("canonicaliza de forma determinística e calcula SHA-256 sem fetchedAt", () => {
    const nodes = parseMeliCategoryTree(validAutomotiveDump(), "MLB");
    const reversed = [...nodes].reverse();
    expect(canonicalizeTaxonomy(nodes)).toBe(canonicalizeTaxonomy(reversed));
    expect(calculateInternalChecksum(nodes)).toMatch(/^[a-f0-9]{64}$/);
    expect(calculateInternalChecksum(nodes)).toBe(calculateInternalChecksum(reversed));
    const changed = nodes.map((node, index) => index === 0 ? { ...node, name: `${node.name} alterado` } : node);
    expect(calculateInternalChecksum(changed)).not.toBe(calculateInternalChecksum(nodes));
  });
});
