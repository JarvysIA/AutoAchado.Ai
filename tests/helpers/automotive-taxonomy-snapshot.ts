import { createHash } from "node:crypto";
import { TaxonomyTree } from "../../src/taxonomy/tree.js";
import type { TaxonomyCategoryNode, TaxonomyTreeEnvelope } from "../../src/taxonomy/types.js";

export const AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION = "meli-automotive-taxonomy-snapshot/v1" as const;
export const AUTOMOTIVE_SNAPSHOT_ROOT_ID = "MLB5672" as const;

export interface AutomotiveTaxonomySnapshotNode {
  externalCategoryId: string;
  name: string;
  parentExternalCategoryId: string | null;
  pathExternalCategoryIds: readonly string[];
  pathNames: readonly string[];
  isLeaf: boolean;
}

export interface AutomotiveTaxonomySnapshot {
  schemaVersion: typeof AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION;
  marketplaceKey: "MERCADO_LIVRE";
  siteId: "MLB";
  rootCategoryId: typeof AUTOMOTIVE_SNAPSHOT_ROOT_ID;
  sourceVersion: string;
  sourceContentCreated: string | null;
  nodeCount: number;
  nodes: readonly AutomotiveTaxonomySnapshotNode[];
}

export interface AutomotiveTaxonomySnapshotStats {
  nodeCount: number;
  leafCount: number;
  nonLeafCount: number;
  maxPathLength: number;
  rootChildCount: number;
}

const ENVELOPE_FIELDS = [
  "schemaVersion",
  "marketplaceKey",
  "siteId",
  "rootCategoryId",
  "sourceVersion",
  "sourceContentCreated",
  "nodeCount",
  "nodes",
] as const;

const NODE_FIELDS = [
  "externalCategoryId",
  "name",
  "parentExternalCategoryId",
  "pathExternalCategoryIds",
  "pathNames",
  "isLeaf",
] as const;

export const SNAPSHOT_FORBIDDEN_FIELDS = Object.freeze([
  "fetchedAt",
  "generatedAt",
  "accessToken",
  "refreshToken",
  "authorization",
  "settings",
  "translations",
  "picture",
  "permalink",
  "attribute_types",
  "channels_settings",
  "total_items_in_this_category",
] as const);

function fail(reason: string): never {
  throw new Error(`AUTOMOTIVE_SNAPSHOT_INVALID:${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactFields(record: Record<string, unknown>, expected: readonly string[], reason: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) fail(reason);
}

function readStringArray(value: unknown, reason: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    return fail(reason);
  }
  return Object.freeze([...value] as string[]);
}

function readNode(value: unknown): AutomotiveTaxonomySnapshotNode {
  if (!isRecord(value)) return fail("NODE_SHAPE");
  assertExactFields(value, NODE_FIELDS, "NODE_FIELDS");
  if (typeof value.externalCategoryId !== "string" || !/^MLB\d+$/.test(value.externalCategoryId)) fail("NODE_ID");
  if (typeof value.name !== "string" || value.name.trim().length === 0) fail("NODE_NAME");
  if (value.parentExternalCategoryId !== null
    && (typeof value.parentExternalCategoryId !== "string" || !/^MLB\d+$/.test(value.parentExternalCategoryId))) {
    fail("NODE_PARENT");
  }
  if (typeof value.isLeaf !== "boolean") fail("NODE_IS_LEAF");
  return Object.freeze({
    externalCategoryId: value.externalCategoryId,
    name: value.name,
    parentExternalCategoryId: value.parentExternalCategoryId as string | null,
    pathExternalCategoryIds: readStringArray(value.pathExternalCategoryIds, "NODE_PATH_IDS"),
    pathNames: readStringArray(value.pathNames, "NODE_PATH_NAMES"),
    isLeaf: value.isLeaf,
  });
}

export function validateAutomotiveTaxonomySnapshot(value: unknown): {
  snapshot: AutomotiveTaxonomySnapshot;
  stats: AutomotiveTaxonomySnapshotStats;
} {
  if (!isRecord(value)) return fail("ENVELOPE_SHAPE");
  assertExactFields(value, ENVELOPE_FIELDS, "ENVELOPE_FIELDS");
  if (value.schemaVersion !== AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION) fail("SCHEMA_VERSION");
  if (value.marketplaceKey !== "MERCADO_LIVRE") fail("MARKETPLACE");
  if (value.siteId !== "MLB") fail("SITE");
  if (value.rootCategoryId !== AUTOMOTIVE_SNAPSHOT_ROOT_ID) fail("ROOT_ID");
  if (typeof value.sourceVersion !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.sourceVersion)) fail("SOURCE_VERSION");
  if (value.sourceContentCreated !== null
    && (typeof value.sourceContentCreated !== "string" || value.sourceContentCreated.length === 0)) {
    fail("SOURCE_CONTENT_CREATED");
  }
  if (!Number.isSafeInteger(value.nodeCount) || (value.nodeCount as number) <= 0) fail("NODE_COUNT");
  if (!Array.isArray(value.nodes)) fail("NODES");

  const nodes = Object.freeze(value.nodes.map(readNode));
  if (value.nodeCount !== nodes.length) fail("NODE_COUNT_MISMATCH");
  const byId = new Map<string, AutomotiveTaxonomySnapshotNode>();
  for (const [index, node] of nodes.entries()) {
    if (byId.has(node.externalCategoryId)) fail("DUPLICATE_ID");
    if (index > 0 && nodes[index - 1]!.externalCategoryId.localeCompare(node.externalCategoryId) >= 0) fail("NODE_ORDER");
    byId.set(node.externalCategoryId, node);
  }

  const root = byId.get(AUTOMOTIVE_SNAPSHOT_ROOT_ID);
  if (!root || root.parentExternalCategoryId !== null || root.isLeaf
    || root.pathExternalCategoryIds.length !== 1 || root.pathExternalCategoryIds[0] !== AUTOMOTIVE_SNAPSHOT_ROOT_ID
    || root.pathNames.length !== 1 || root.pathNames[0] !== root.name) {
    fail("ROOT_SHAPE");
  }

  const childCounts = new Map<string, number>();
  let maxPathLength = 0;
  for (const node of nodes) {
    const ids = node.pathExternalCategoryIds;
    const names = node.pathNames;
    if (ids.length !== names.length || ids[0] !== AUTOMOTIVE_SNAPSHOT_ROOT_ID
      || ids.at(-1) !== node.externalCategoryId || names.at(-1) !== node.name) {
      fail("PATH_SHAPE");
    }
    if (ids.some((id) => !byId.has(id))) fail("PATH_NODE_MISSING");
    if (node.externalCategoryId !== AUTOMOTIVE_SNAPSHOT_ROOT_ID) {
      if (node.parentExternalCategoryId === null || !byId.has(node.parentExternalCategoryId)) fail("PARENT_MISSING");
      if (ids.at(-2) !== node.parentExternalCategoryId) fail("PATH_PARENT_MISMATCH");
      childCounts.set(node.parentExternalCategoryId, (childCounts.get(node.parentExternalCategoryId) ?? 0) + 1);
    }
    const seen = new Set<string>();
    let current: AutomotiveTaxonomySnapshotNode | undefined = node;
    while (current) {
      if (seen.has(current.externalCategoryId)) fail("CYCLE");
      seen.add(current.externalCategoryId);
      current = current.parentExternalCategoryId === null ? undefined : byId.get(current.parentExternalCategoryId);
      if (current === undefined && !seen.has(AUTOMOTIVE_SNAPSHOT_ROOT_ID)) fail("UNREACHABLE");
    }
    maxPathLength = Math.max(maxPathLength, ids.length);
  }

  for (const node of nodes) {
    if (node.isLeaf !== ((childCounts.get(node.externalCategoryId) ?? 0) === 0)) fail("LEAF_MISMATCH");
  }

  const snapshot: AutomotiveTaxonomySnapshot = Object.freeze({
    schemaVersion: AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION,
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    rootCategoryId: AUTOMOTIVE_SNAPSHOT_ROOT_ID,
    sourceVersion: value.sourceVersion as string,
    sourceContentCreated: value.sourceContentCreated as string | null,
    nodeCount: value.nodeCount as number,
    nodes,
  });
  const leafCount = nodes.filter((node) => node.isLeaf).length;
  return {
    snapshot,
    stats: Object.freeze({
      nodeCount: nodes.length,
      leafCount,
      nonLeafCount: nodes.length - leafCount,
      maxPathLength,
      rootChildCount: childCounts.get(AUTOMOTIVE_SNAPSHOT_ROOT_ID) ?? 0,
    }),
  };
}

export function buildAutomotiveTaxonomySnapshot(envelope: TaxonomyTreeEnvelope): AutomotiveTaxonomySnapshot {
  if (envelope.marketplaceKey !== "MERCADO_LIVRE" || envelope.siteId !== "MLB") fail("SOURCE_CONTEXT");
  const tree = new TaxonomyTree(envelope.nodes, { requiredRootId: AUTOMOTIVE_SNAPSHOT_ROOT_ID });
  const sourceNodes = [tree.getNode(AUTOMOTIVE_SNAPSHOT_ROOT_ID), ...tree.getDescendants(AUTOMOTIVE_SNAPSHOT_ROOT_ID)]
    .sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));
  const nodes = sourceNodes.map((node): AutomotiveTaxonomySnapshotNode => ({
    externalCategoryId: node.externalCategoryId,
    name: node.name,
    parentExternalCategoryId: node.parentExternalCategoryId,
    pathExternalCategoryIds: [...node.pathExternalCategoryIds],
    pathNames: [...node.pathNames],
    isLeaf: node.isLeaf,
  }));
  return validateAutomotiveTaxonomySnapshot({
    schemaVersion: AUTOMOTIVE_SNAPSHOT_SCHEMA_VERSION,
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    rootCategoryId: AUTOMOTIVE_SNAPSHOT_ROOT_ID,
    sourceVersion: envelope.sourceVersion,
    sourceContentCreated: envelope.sourceContentCreated,
    nodeCount: nodes.length,
    nodes,
  }).snapshot;
}

export function serializeAutomotiveTaxonomySnapshot(snapshot: AutomotiveTaxonomySnapshot): string {
  const validated = validateAutomotiveTaxonomySnapshot(snapshot).snapshot;
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export function checksumAutomotiveTaxonomySnapshot(serialized: string): string {
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function snapshotToTaxonomyTree(snapshot: AutomotiveTaxonomySnapshot): TaxonomyTree {
  const { snapshot: validated } = validateAutomotiveTaxonomySnapshot(snapshot);
  const childrenByParent = new Map<string, string[]>();
  for (const node of validated.nodes) {
    if (node.parentExternalCategoryId === null) continue;
    const children = childrenByParent.get(node.parentExternalCategoryId) ?? [];
    children.push(node.externalCategoryId);
    childrenByParent.set(node.parentExternalCategoryId, children);
  }
  const nodes: TaxonomyCategoryNode[] = validated.nodes.map((node) => ({
    marketplaceKey: validated.marketplaceKey,
    siteId: validated.siteId,
    externalCategoryId: node.externalCategoryId,
    name: node.name,
    parentExternalCategoryId: node.parentExternalCategoryId,
    childrenExternalCategoryIds: [...(childrenByParent.get(node.externalCategoryId) ?? [])].sort(),
    pathExternalCategoryIds: [...node.pathExternalCategoryIds],
    pathNames: [...node.pathNames],
    isLeaf: node.isLeaf,
  }));
  return new TaxonomyTree(nodes, { requiredRootId: AUTOMOTIVE_SNAPSHOT_ROOT_ID });
}
