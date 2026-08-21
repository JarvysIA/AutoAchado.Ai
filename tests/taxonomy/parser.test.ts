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
  TEST_LEAF_ID,
  TEST_OTHER_LEAF_ID,
  TEST_PARENT_ID,
  TEST_ROOT_ID,
  validAutomotiveDump,
  validAutomotiveObjectMap,
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

  it("normaliza object-map flat comprovado e deriva parent pelo path", () => {
    const nodes = parseMeliCategoryTree(validAutomotiveObjectMap(), "MLB");
    const tree = new TaxonomyTree(nodes, { requiredRootId: TEST_ROOT_ID });
    expect(nodes).toHaveLength(4);
    expect(tree.getNode(TEST_ROOT_ID)).toMatchObject({
      marketplaceKey: "MERCADO_LIVRE",
      siteId: "MLB",
      parentExternalCategoryId: null,
      childrenExternalCategoryIds: [TEST_PARENT_ID, TEST_OTHER_LEAF_ID],
      pathExternalCategoryIds: [TEST_ROOT_ID],
      pathNames: ["Acessórios para Veículos"],
      isLeaf: false,
    });
    expect(tree.getNode(TEST_PARENT_ID).parentExternalCategoryId).toBe(TEST_ROOT_ID);
    expect(tree.getNode(TEST_LEAF_ID)).toMatchObject({
      parentExternalCategoryId: TEST_PARENT_ID,
      childrenExternalCategoryIds: [],
      isLeaf: true,
    });
    expect(tree.getAncestors(TEST_LEAF_ID).map((node) => node.externalCategoryId))
      .toEqual([TEST_ROOT_ID, TEST_PARENT_ID]);
  });

  it("mantém checksum independente do formato e da ordem das keys", () => {
    const arrayNodes = parseMeliCategoryTree(validAutomotiveDump(), "MLB");
    const objectMap = validAutomotiveObjectMap();
    const reversedObjectMap = Object.fromEntries(Object.entries(objectMap).reverse());
    const objectNodes = parseMeliCategoryTree(objectMap, "MLB");
    const reversedNodes = parseMeliCategoryTree(reversedObjectMap, "MLB");
    expect(objectNodes).toEqual(reversedNodes);
    expect(calculateInternalChecksum(objectNodes)).toBe(calculateInternalChecksum(reversedNodes));
    expect(calculateInternalChecksum(objectNodes)).toBe(calculateInternalChecksum(arrayNodes));
  });

  it("aplica NODE_LIMIT ao número de keys antes de inspecionar values", () => {
    const oversized = {
      MLB900000011: null,
      MLB900000012: null,
      MLB900000013: null,
    };
    expect(reasonOf(() => parseMeliCategoryTree(oversized, "MLB", { maxNodes: 2 }))).toBe("NODE_LIMIT");
  });

  it.each([
    ["key arbitrária", { categories: [] }],
    ["value null", { MLB900000011: null }],
    ["value array", { MLB900000011: [] }],
    ["value string", { MLB900000011: "invalid" }],
    ["id ausente", { MLB900000011: { name: "Sintética", children_categories: [], path_from_root: [] } }],
    ["id numérico", { MLB900000011: { id: 1, name: "Sintética", children_categories: [], path_from_root: [] } }],
    ["id inválido", { MLB900000011: { id: "INVALID", name: "Sintética", children_categories: [], path_from_root: [] } }],
    ["key e id divergentes", { MLB900000011: { id: "MLB900000012", name: "Sintética", children_categories: [], path_from_root: [{ id: "MLB900000012", name: "Sintética" }] } }],
    ["name ausente", { MLB900000011: { id: "MLB900000011", children_categories: [], path_from_root: [] } }],
    ["name não string", { MLB900000011: { id: "MLB900000011", name: 1, children_categories: [], path_from_root: [] } }],
    ["name vazio", { MLB900000011: { id: "MLB900000011", name: "", children_categories: [], path_from_root: [] } }],
    ["children ausente", { MLB900000011: { id: "MLB900000011", name: "Sintética", path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["children não array", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: {}, path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["child null", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [null], path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["child sem id", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [{ name: "Filha" }], path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["child sem name", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [{ id: "MLB900000012" }], path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["child com id inválido", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [{ id: "INVALID", name: "Filha" }], path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["child com name inválido", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [{ id: "MLB900000012", name: 1 }], path_from_root: [{ id: "MLB900000011", name: "Sintética" }] } }],
    ["path ausente", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [] } }],
    ["path não array", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [], path_from_root: {} } }],
    ["path vazio", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [], path_from_root: [] } }],
    ["path com elemento inválido", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [], path_from_root: [null] } }],
    ["path com id inválido", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [], path_from_root: [{ id: "INVALID", name: "Sintética" }] } }],
    ["path com name inválido", { MLB900000011: { id: "MLB900000011", name: "Sintética", children_categories: [], path_from_root: [{ id: "MLB900000011", name: "" }] } }],
  ])("rejeita object-map inválido: %s", (_label, payload) => {
    expect(reasonOf(() => parseMeliCategoryTree(payload, "MLB"))).toBe("CATEGORY_SHAPE_INVALID");
  });

  it("rejeita path cujo último elemento não representa a própria categoria", () => {
    const payload = validAutomotiveObjectMap();
    const leaf = payload[TEST_LEAF_ID] as Record<string, unknown>;
    leaf.path_from_root = [
      { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
      { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste" },
    ];
    expect(reasonOf(() => parseMeliCategoryTree(payload, "MLB"))).toBe("PATH_MISMATCH");
  });

  it("aplica limite de profundidade ao path do object-map", () => {
    expect(reasonOf(() => parseMeliCategoryTree(validAutomotiveObjectMap(), "MLB", { maxDepth: 2 })))
      .toBe("DEPTH_LIMIT");
  });

  it("delega divergência children/path para a integridade global", () => {
    const payload = validAutomotiveObjectMap();
    const leaf = payload[TEST_LEAF_ID] as Record<string, unknown>;
    leaf.path_from_root = [
      { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
      { id: TEST_OTHER_LEAF_ID, name: "Outra Leaf Sintética" },
      { id: TEST_LEAF_ID, name: "Leaf Sintética de Teste" },
    ];
    const nodes = parseMeliCategoryTree(payload, "MLB");
    expect(reasonOf(() => new TaxonomyTree(nodes))).toBe("CHILD_MISMATCH");
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

  it("distingue top-level incompatível de item de categoria inválido", () => {
    try {
      parseMeliCategoryTree("wrapper", "MLB");
      throw new Error("esperava erro");
    } catch (error) {
      expect(error).toMatchObject({
        code: "TAXONOMY_INVALID_RESPONSE",
        details: { reason: "TOP_LEVEL_SHAPE_INVALID", topLevelKind: "STRING", topLevelObjectKeyCount: null },
      });
    }
    try {
      parseMeliCategoryTree(["invalid-category"], "MLB");
      throw new Error("esperava erro");
    } catch (error) {
      expect(error).toMatchObject({
        code: "TAXONOMY_INVALID_RESPONSE",
        details: { reason: "CATEGORY_SHAPE_INVALID", categoryIndex: 0 },
      });
    }
  });

  it.each([null, true, 1, "tree", [], {}])("rejeita top-level não contratual", (payload) => {
    expect(reasonOf(() => parseMeliCategoryTree(payload, "MLB"))).toBe("TOP_LEVEL_SHAPE_INVALID");
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
