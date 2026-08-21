import { describe, expect, it } from "vitest";
import { TaxonomyError } from "../../src/taxonomy/errors.js";
import { parseMeliCategoryTree } from "../../src/taxonomy/parser.js";
import { TaxonomyTree } from "../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode } from "../../src/taxonomy/types.js";
import {
  TEST_LEAF_ID,
  TEST_OTHER_LEAF_ID,
  TEST_PARENT_ID,
  TEST_ROOT_ID,
  validAutomotiveDump,
} from "../fixtures/meli-taxonomy.js";

const reasonOf = (factory: () => TaxonomyTree): string | null => {
  try {
    factory();
    return null;
  } catch (error) {
    return error instanceof TaxonomyError ? error.details.reason : null;
  }
};

const mutableCopy = (node: TaxonomyCategoryNode): TaxonomyCategoryNode => ({
  ...node,
  childrenExternalCategoryIds: [...node.childrenExternalCategoryIds],
  pathExternalCategoryIds: [...node.pathExternalCategoryIds],
  pathNames: [...node.pathNames],
});

describe("árvore normalizada", () => {
  it("responde ancestry, descendants, children e leaf deterministicamente", () => {
    const tree = new TaxonomyTree(parseMeliCategoryTree(validAutomotiveDump(), "MLB"));
    expect(tree.isDescendantOf(TEST_LEAF_ID, TEST_ROOT_ID)).toBe(true);
    expect(tree.isDescendantOf(TEST_ROOT_ID, TEST_ROOT_ID)).toBe(false);
    expect(tree.isDescendantOrSelf(TEST_ROOT_ID, TEST_ROOT_ID)).toBe(true);
    expect(tree.getAncestors(TEST_LEAF_ID).map((node) => node.externalCategoryId)).toEqual([TEST_ROOT_ID, TEST_PARENT_ID]);
    expect(tree.getPath(TEST_LEAF_ID).map((node) => node.externalCategoryId)).toEqual([TEST_ROOT_ID, TEST_PARENT_ID, TEST_LEAF_ID]);
    expect(tree.getChildren(TEST_ROOT_ID).map((node) => node.externalCategoryId)).toEqual([TEST_PARENT_ID, TEST_OTHER_LEAF_ID]);
    expect(tree.getDescendants(TEST_ROOT_ID).map((node) => node.externalCategoryId)).toEqual([TEST_PARENT_ID, TEST_LEAF_ID, TEST_OTHER_LEAF_ID]);
    expect(tree.isLeaf(TEST_LEAF_ID)).toBe(true);
    expect(tree.isLeaf(TEST_ROOT_ID)).toBe(false);
  });

  it("usa política única de erro tipado para node desconhecido", () => {
    const tree = new TaxonomyTree(parseMeliCategoryTree(validAutomotiveDump(), "MLB"));
    expect(() => tree.getNode("MLB999999999")).toThrowError(expect.objectContaining({ code: "TAXONOMY_NODE_NOT_FOUND" }));
    expect(() => tree.getChildren("MLB999999999")).toThrowError(expect.objectContaining({ code: "TAXONOMY_NODE_NOT_FOUND" }));
  });

  it("expõe cópias congeladas e não altera a entrada", () => {
    const source = parseMeliCategoryTree(validAutomotiveDump(), "MLB").map(mutableCopy);
    const tree = new TaxonomyTree(source);
    expect(Object.isFrozen(tree.nodes)).toBe(true);
    expect(Object.isFrozen(tree.nodes[0])).toBe(true);
    expect(Object.isFrozen(tree.nodes[0]!.childrenExternalCategoryIds)).toBe(true);
    source[0]!.name = "Mutação externa";
    expect(tree.getNode(TEST_ROOT_ID).name).toBe("Acessórios para Veículos");
  });

  it("detecta parent ausente, self-parent e child mismatch", () => {
    const base = parseMeliCategoryTree(validAutomotiveDump(), "MLB").map(mutableCopy);
    const missingParent = base.map((node) => node.externalCategoryId === TEST_LEAF_ID
      ? { ...node, parentExternalCategoryId: "MLB999999998" }
      : node);
    expect(reasonOf(() => new TaxonomyTree(missingParent))).toBe("PARENT_MISSING");

    const selfParent = base.map((node) => node.externalCategoryId === TEST_ROOT_ID
      ? { ...node, parentExternalCategoryId: TEST_ROOT_ID }
      : node);
    expect(reasonOf(() => new TaxonomyTree(selfParent))).toBe("SELF_PARENT");

    const childMismatch = base.map((node) => node.externalCategoryId === TEST_LEAF_ID
      ? { ...node, parentExternalCategoryId: TEST_ROOT_ID }
      : node);
    expect(reasonOf(() => new TaxonomyTree(childMismatch))).toBe("CHILD_MISMATCH");
  });

  it("detecta ciclo consistente, limite de profundidade e limite de nós", () => {
    const base = parseMeliCategoryTree(validAutomotiveDump(), "MLB").map(mutableCopy);
    const cycle = base.map((node) => {
      if (node.externalCategoryId === TEST_ROOT_ID) {
        return { ...node, parentExternalCategoryId: TEST_LEAF_ID };
      }
      if (node.externalCategoryId === TEST_LEAF_ID) {
        return { ...node, childrenExternalCategoryIds: [...node.childrenExternalCategoryIds, TEST_ROOT_ID], isLeaf: false };
      }
      return node;
    });
    expect(reasonOf(() => new TaxonomyTree(cycle))).toBe("CYCLE");
    expect(reasonOf(() => new TaxonomyTree(base, { maxDepth: 2 }))).toBe("DEPTH_LIMIT");
    expect(reasonOf(() => new TaxonomyTree(base, { maxNodes: 3 }))).toBe("NODE_LIMIT");
  });

  it("rejeita mistura de sites na árvore genérica", () => {
    const base = parseMeliCategoryTree(validAutomotiveDump(), "MLB").map(mutableCopy);
    const mixed = base.map((node) => node.externalCategoryId === TEST_LEAF_ID
      ? { ...node, siteId: "MLA" }
      : node);
    expect(reasonOf(() => new TaxonomyTree(mixed))).toBe("SITE_MISMATCH");
  });
});
