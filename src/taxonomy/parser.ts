import { createHash } from "node:crypto";
import { taxonomyIntegrityError, taxonomyInvalidResponse, type TaxonomySafeErrorDetails } from "./errors.js";
import {
  MARKETPLACE_MERCADO_LIVRE,
  type CategoryDetail,
  type SiteCategory,
  type TaxonomyCategoryNode,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function topLevelKind(value: unknown): "ARRAY" | "OBJECT" | "STRING" | "NUMBER" | "BOOLEAN" | "NULL" | "OTHER" {
  if (value === null) return "NULL";
  if (Array.isArray(value)) return "ARRAY";
  if (typeof value === "object") return "OBJECT";
  if (typeof value === "string") return "STRING";
  if (typeof value === "number") return "NUMBER";
  if (typeof value === "boolean") return "BOOLEAN";
  return "OTHER";
}

function topLevelDetails(value: unknown): Pick<
  TaxonomySafeErrorDetails,
  "topLevelKind" | "topLevelArrayLength" | "topLevelObjectKeyCount"
> {
  const kind = topLevelKind(value);
  return {
    topLevelKind: kind,
    topLevelArrayLength: kind === "ARRAY" ? (value as unknown[]).length : null,
    topLevelObjectKeyCount: kind === "OBJECT" ? Object.keys(value as Record<string, unknown>).length : null,
  };
}

function invalidCategoryShape(categoryIndex: number | null = null): never {
  throw taxonomyInvalidResponse("CATEGORY_SHAPE_INVALID", { categoryIndex });
}

function readCategoryId(value: unknown, siteId: string, categoryIndex: number | null): string {
  if (typeof value !== "string" || !/^[A-Z]{3}\d+$/.test(value)) return invalidCategoryShape(categoryIndex);
  if (!value.startsWith(siteId)) throw taxonomyIntegrityError("SITE_MISMATCH");
  return value;
}

function readName(value: unknown, categoryIndex: number | null): string {
  if (typeof value !== "string" || value.trim().length === 0) return invalidCategoryShape(categoryIndex);
  return value;
}

function readSummary(value: unknown, siteId: string, categoryIndex: number | null = null): SiteCategory {
  if (!isRecord(value)) return invalidCategoryShape(categoryIndex);
  return Object.freeze({
    externalCategoryId: readCategoryId(value.id, siteId, categoryIndex),
    name: readName(value.name, categoryIndex),
  });
}

function readSummaryArray(value: unknown, siteId: string, exposeIndex = false): readonly SiteCategory[] {
  if (!Array.isArray(value)) return invalidCategoryShape();
  return Object.freeze(value.map((entry, index) => readSummary(entry, siteId, exposeIndex ? index : null)));
}

export function parseSiteCategories(payload: unknown, siteId: string): readonly SiteCategory[] {
  if (!Array.isArray(payload)) throw taxonomyInvalidResponse("TOP_LEVEL_SHAPE_INVALID", topLevelDetails(payload));
  return readSummaryArray(payload, siteId, true);
}

export function parseCategoryDetail(payload: unknown, siteId: string): CategoryDetail {
  if (!isRecord(payload)) throw taxonomyInvalidResponse("TOP_LEVEL_SHAPE_INVALID", topLevelDetails(payload));
  const summary = readSummary(payload, siteId);
  const children = payload.children_categories === undefined
    ? Object.freeze([]) as readonly SiteCategory[]
    : readSummaryArray(payload.children_categories, siteId);
  const path = payload.path_from_root === undefined
    ? Object.freeze([summary])
    : readSummaryArray(payload.path_from_root, siteId);
  return Object.freeze({
    ...summary,
    childrenExternalCategoryIds: Object.freeze(children.map((child) => child.externalCategoryId)),
    pathExternalCategoryIds: Object.freeze(path.map((entry) => entry.externalCategoryId)),
    pathNames: Object.freeze(path.map((entry) => entry.name)),
  });
}

interface WalkContext {
  siteId: string;
  parentExternalCategoryId: string | null;
  inferredPathIds: readonly string[];
  inferredPathNames: readonly string[];
  output: TaxonomyCategoryNode[];
  depth: number;
  maxDepth: number;
  maxNodes: number;
  rootIndex: number;
}

function walkCategory(value: unknown, context: WalkContext): void {
  if (context.depth > context.maxDepth) throw taxonomyIntegrityError("DEPTH_LIMIT");
  if (context.output.length >= context.maxNodes) throw taxonomyIntegrityError("NODE_LIMIT");
  if (!isRecord(value)) return invalidCategoryShape(context.depth === 1 ? context.rootIndex : null);
  const summary = readSummary(value, context.siteId, context.depth === 1 ? context.rootIndex : null);
  const children = value.children_categories === undefined
    ? Object.freeze([]) as readonly SiteCategory[]
    : readSummaryArray(value.children_categories, context.siteId);
  const inferredPathIds = Object.freeze([...context.inferredPathIds, summary.externalCategoryId]);
  const inferredPathNames = Object.freeze([...context.inferredPathNames, summary.name]);
  const suppliedPath = value.path_from_root === undefined
    ? null
    : readSummaryArray(value.path_from_root, context.siteId);
  const pathExternalCategoryIds = suppliedPath
    ? Object.freeze(suppliedPath.map((entry) => entry.externalCategoryId))
    : inferredPathIds;
  const pathNames = suppliedPath
    ? Object.freeze(suppliedPath.map((entry) => entry.name))
    : inferredPathNames;

  context.output.push(Object.freeze({
    marketplaceKey: MARKETPLACE_MERCADO_LIVRE,
    siteId: context.siteId,
    externalCategoryId: summary.externalCategoryId,
    name: summary.name,
    parentExternalCategoryId: context.parentExternalCategoryId,
    childrenExternalCategoryIds: Object.freeze(children.map((child) => child.externalCategoryId)),
    pathExternalCategoryIds,
    pathNames,
    isLeaf: children.length === 0,
  }));

  const rawChildren = value.children_categories;
  if (rawChildren !== undefined) {
    if (!Array.isArray(rawChildren)) return invalidCategoryShape(context.depth === 1 ? context.rootIndex : null);
    for (const child of rawChildren) {
      walkCategory(child, {
        siteId: context.siteId,
        parentExternalCategoryId: summary.externalCategoryId,
        inferredPathIds,
        inferredPathNames,
        output: context.output,
        depth: context.depth + 1,
        maxDepth: context.maxDepth,
        maxNodes: context.maxNodes,
        rootIndex: context.rootIndex,
      });
    }
  }
}

function parseMeliCategoryTreeArray(
  payload: readonly unknown[],
  siteId: string,
  maxNodes: number,
  maxDepth: number,
): readonly TaxonomyCategoryNode[] {
  const output: TaxonomyCategoryNode[] = [];
  for (const [rootIndex, category] of payload.entries()) {
    walkCategory(category, {
      siteId,
      parentExternalCategoryId: null,
      inferredPathIds: Object.freeze([]),
      inferredPathNames: Object.freeze([]),
      output,
      depth: 1,
      maxDepth,
      maxNodes,
      rootIndex,
    });
  }
  return Object.freeze(output);
}

function parseMeliCategoryTreeObjectMap(
  payload: Record<string, unknown>,
  siteId: string,
  maxNodes: number,
  maxDepth: number,
): readonly TaxonomyCategoryNode[] {
  const keys = Object.keys(payload);
  if (keys.length > maxNodes) throw taxonomyIntegrityError("NODE_LIMIT");

  const output = keys
    .sort((left, right) => left.localeCompare(right))
    .map((mapKey, categoryIndex): TaxonomyCategoryNode => {
      const value = payload[mapKey];
      if (!/^MLB\d+$/.test(mapKey)) return invalidCategoryShape(categoryIndex);
      if (!isRecord(value)) return invalidCategoryShape(categoryIndex);

      const summary = readSummary(value, siteId, categoryIndex);
      if (summary.externalCategoryId !== mapKey) return invalidCategoryShape(categoryIndex);
      if (!Object.hasOwn(value, "children_categories") || !Object.hasOwn(value, "path_from_root")) {
        return invalidCategoryShape(categoryIndex);
      }

      const children = readSummaryArray(value.children_categories, siteId);
      const path = readSummaryArray(value.path_from_root, siteId);
      if (path.length === 0) return invalidCategoryShape(categoryIndex);
      if (path.length > maxDepth) throw taxonomyIntegrityError("DEPTH_LIMIT");

      const currentPathEntry = path[path.length - 1]!;
      if (currentPathEntry.externalCategoryId !== summary.externalCategoryId || currentPathEntry.name !== summary.name) {
        throw taxonomyIntegrityError("PATH_MISMATCH");
      }
      const parentExternalCategoryId = path.length === 1
        ? null
        : path[path.length - 2]!.externalCategoryId;

      return Object.freeze({
        marketplaceKey: MARKETPLACE_MERCADO_LIVRE,
        siteId,
        externalCategoryId: summary.externalCategoryId,
        name: summary.name,
        parentExternalCategoryId,
        childrenExternalCategoryIds: Object.freeze(children.map((child) => child.externalCategoryId)),
        pathExternalCategoryIds: Object.freeze(path.map((entry) => entry.externalCategoryId)),
        pathNames: Object.freeze(path.map((entry) => entry.name)),
        isLeaf: children.length === 0,
      });
    });

  return Object.freeze(output);
}

export function parseMeliCategoryTree(
  payload: unknown,
  siteId: string,
  limits: Readonly<{ maxNodes?: number; maxDepth?: number }> = {},
): readonly TaxonomyCategoryNode[] {
  const maxNodes = limits.maxNodes ?? 100_000;
  const maxDepth = limits.maxDepth ?? 64;
  if (Array.isArray(payload)) {
    if (payload.length === 0) throw taxonomyInvalidResponse("TOP_LEVEL_SHAPE_INVALID", topLevelDetails(payload));
    return parseMeliCategoryTreeArray(payload, siteId, maxNodes, maxDepth);
  }
  if (isRecord(payload)) {
    if (Object.keys(payload).length === 0) {
      throw taxonomyInvalidResponse("TOP_LEVEL_SHAPE_INVALID", topLevelDetails(payload));
    }
    return parseMeliCategoryTreeObjectMap(payload, siteId, maxNodes, maxDepth);
  }
  throw taxonomyInvalidResponse("TOP_LEVEL_SHAPE_INVALID", topLevelDetails(payload));
}

function canonicalNode(node: TaxonomyCategoryNode): Record<string, unknown> {
  return {
    id: node.externalCategoryId,
    name: node.name,
    parent: node.parentExternalCategoryId,
    children: [...node.childrenExternalCategoryIds].sort(),
    pathIds: [...node.pathExternalCategoryIds],
    pathNames: [...node.pathNames],
    isLeaf: node.isLeaf,
    marketplaceKey: node.marketplaceKey,
    siteId: node.siteId,
  };
}

export function canonicalizeTaxonomy(nodes: readonly TaxonomyCategoryNode[]): string {
  return JSON.stringify([...nodes]
    .sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId))
    .map(canonicalNode));
}

export function calculateInternalChecksum(nodes: readonly TaxonomyCategoryNode[]): string {
  return createHash("sha256").update(canonicalizeTaxonomy(nodes), "utf8").digest("hex");
}
