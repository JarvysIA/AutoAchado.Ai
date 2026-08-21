import { TaxonomyError, taxonomyIntegrityError } from "./errors.js";
import type { TaxonomyCategoryNode } from "./types.js";

export interface TaxonomyTreeOptions {
  maxNodes?: number;
  maxDepth?: number;
  requiredRootId?: string;
}

const sameArray = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export class TaxonomyTree {
  readonly nodes: readonly TaxonomyCategoryNode[];
  private readonly byId = new Map<string, TaxonomyCategoryNode>();
  private readonly childrenByParent = new Map<string | null, readonly string[]>();

  constructor(nodes: readonly TaxonomyCategoryNode[], options: TaxonomyTreeOptions = {}) {
    const maxNodes = options.maxNodes ?? 100_000;
    const maxDepth = options.maxDepth ?? 64;
    if (nodes.length > maxNodes) throw taxonomyIntegrityError("NODE_LIMIT");
    this.nodes = Object.freeze(nodes.map((node) => Object.freeze({
      ...node,
      childrenExternalCategoryIds: Object.freeze([...node.childrenExternalCategoryIds]),
      pathExternalCategoryIds: Object.freeze([...node.pathExternalCategoryIds]),
      pathNames: Object.freeze([...node.pathNames]),
    })));

    for (const node of this.nodes) {
      if (this.byId.has(node.externalCategoryId)) throw taxonomyIntegrityError("DUPLICATE_ID");
      if (node.parentExternalCategoryId === node.externalCategoryId) throw taxonomyIntegrityError("SELF_PARENT");
      this.byId.set(node.externalCategoryId, node);
    }

    const expectedSiteId = this.nodes[0]?.siteId;
    const expectedMarketplaceKey = this.nodes[0]?.marketplaceKey;
    for (const node of this.nodes) {
      const parentId = node.parentExternalCategoryId;
      if (parentId !== null && !this.byId.has(parentId)) throw taxonomyIntegrityError("PARENT_MISSING");
    }

    for (const node of this.nodes) {
      const parentId = node.parentExternalCategoryId;
      for (const childId of node.childrenExternalCategoryIds) {
        const child = this.byId.get(childId);
        if (!child || child.parentExternalCategoryId !== node.externalCategoryId) {
          throw taxonomyIntegrityError("CHILD_MISMATCH");
        }
      }
      if (parentId !== null) {
        const parent = this.byId.get(parentId);
        if (!parent?.childrenExternalCategoryIds.includes(node.externalCategoryId)) {
          throw taxonomyIntegrityError("CHILD_MISMATCH");
        }
      }
      if (node.isLeaf !== (node.childrenExternalCategoryIds.length === 0)) {
        throw taxonomyIntegrityError("CHILD_MISMATCH");
      }
      if (node.siteId !== expectedSiteId || node.marketplaceKey !== expectedMarketplaceKey) {
        throw taxonomyIntegrityError("SITE_MISMATCH");
      }
    }

    const visiting = new Set<string>();
    const cycleChecked = new Set<string>();
    const validateAcyclic = (nodeId: string): void => {
      if (visiting.has(nodeId)) throw taxonomyIntegrityError("CYCLE");
      if (cycleChecked.has(nodeId)) return;
      visiting.add(nodeId);
      const node = this.byId.get(nodeId)!;
      for (const childId of node.childrenExternalCategoryIds) validateAcyclic(childId);
      visiting.delete(nodeId);
      cycleChecked.add(nodeId);
    };

    const roots = this.nodes.filter((node) => node.parentExternalCategoryId === null);
    for (const node of this.nodes) validateAcyclic(node.externalCategoryId);
    const reachable = new Set<string>();
    const visitFromRoot = (nodeId: string, depth: number): void => {
      if (depth > maxDepth) throw taxonomyIntegrityError("DEPTH_LIMIT");
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);
      for (const childId of this.byId.get(nodeId)!.childrenExternalCategoryIds) visitFromRoot(childId, depth + 1);
    };
    for (const root of roots) visitFromRoot(root.externalCategoryId, 1);
    if (roots.length === 0 || reachable.size !== this.nodes.length) throw taxonomyIntegrityError("UNREACHABLE_NODE");

    for (const node of this.nodes) {
      const expected = this.computePath(node.externalCategoryId);
      const expectedNames = expected.map((id) => this.byId.get(id)!.name);
      if (!sameArray(expected, node.pathExternalCategoryIds) || !sameArray(expectedNames, node.pathNames)) {
        throw taxonomyIntegrityError("PATH_MISMATCH");
      }
    }

    if (options.requiredRootId && !this.byId.has(options.requiredRootId)) {
      throw taxonomyIntegrityError("ROOT_MISSING");
    }

    const grouped = new Map<string | null, string[]>();
    for (const node of this.nodes) {
      const children = grouped.get(node.parentExternalCategoryId) ?? [];
      children.push(node.externalCategoryId);
      grouped.set(node.parentExternalCategoryId, children);
    }
    for (const [parent, children] of grouped) this.childrenByParent.set(parent, Object.freeze([...children]));
  }

  private requireNode(nodeId: string): TaxonomyCategoryNode {
    const node = this.byId.get(nodeId);
    if (!node) throw new TaxonomyError("TAXONOMY_NODE_NOT_FOUND", "Categoria de taxonomia não encontrada");
    return node;
  }

  private computePath(nodeId: string): string[] {
    const path: string[] = [];
    let current: TaxonomyCategoryNode | undefined = this.requireNode(nodeId);
    while (current) {
      path.push(current.externalCategoryId);
      current = current.parentExternalCategoryId === null
        ? undefined
        : this.byId.get(current.parentExternalCategoryId);
    }
    return path.reverse();
  }

  getNode(nodeId: string): TaxonomyCategoryNode {
    return this.requireNode(nodeId);
  }

  isDescendantOf(nodeId: string, ancestorId: string): boolean {
    this.requireNode(ancestorId);
    let current = this.requireNode(nodeId);
    while (current.parentExternalCategoryId !== null) {
      if (current.parentExternalCategoryId === ancestorId) return true;
      current = this.requireNode(current.parentExternalCategoryId);
    }
    return false;
  }

  isDescendantOrSelf(nodeId: string, ancestorId: string): boolean {
    return nodeId === ancestorId ? Boolean(this.requireNode(nodeId)) : this.isDescendantOf(nodeId, ancestorId);
  }

  getAncestors(nodeId: string): readonly TaxonomyCategoryNode[] {
    const ids = this.computePath(nodeId).slice(0, -1);
    return Object.freeze(ids.map((id) => this.requireNode(id)));
  }

  getPath(nodeId: string): readonly TaxonomyCategoryNode[] {
    return Object.freeze(this.computePath(nodeId).map((id) => this.requireNode(id)));
  }

  getChildren(nodeId: string): readonly TaxonomyCategoryNode[] {
    this.requireNode(nodeId);
    return Object.freeze((this.childrenByParent.get(nodeId) ?? []).map((id) => this.requireNode(id)));
  }

  getDescendants(nodeId: string): readonly TaxonomyCategoryNode[] {
    this.requireNode(nodeId);
    const output: TaxonomyCategoryNode[] = [];
    const visit = (parentId: string): void => {
      for (const child of this.getChildren(parentId)) {
        output.push(child);
        visit(child.externalCategoryId);
      }
    };
    visit(nodeId);
    return Object.freeze(output);
  }

  isLeaf(nodeId: string): boolean {
    return this.requireNode(nodeId).isLeaf;
  }
}
