import { createHash } from "node:crypto";
import { TaxonomyError, taxonomyIntegrityError } from "./errors.js";
import {
  MARKETPLACE_MERCADO_LIVRE,
  type CategoryDetail,
  type SiteCategory,
  type TaxonomyCategoryNode,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new TaxonomyError("TAXONOMY_INVALID_RESPONSE", "Resposta de taxonomia inválida");
}

function readCategoryId(value: unknown, siteId: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}\d+$/.test(value)) return invalidResponse();
  if (!value.startsWith(siteId)) throw taxonomyIntegrityError("SITE_MISMATCH");
  return value;
}

function readName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return invalidResponse();
  return value;
}

function readSummary(value: unknown, siteId: string): SiteCategory {
  if (!isRecord(value)) return invalidResponse();
  return Object.freeze({
    externalCategoryId: readCategoryId(value.id, siteId),
    name: readName(value.name),
  });
}

function readSummaryArray(value: unknown, siteId: string): readonly SiteCategory[] {
  if (!Array.isArray(value)) return invalidResponse();
  return Object.freeze(value.map((entry) => readSummary(entry, siteId)));
}

export function parseSiteCategories(payload: unknown, siteId: string): readonly SiteCategory[] {
  return readSummaryArray(payload, siteId);
}

export function parseCategoryDetail(payload: unknown, siteId: string): CategoryDetail {
  if (!isRecord(payload)) return invalidResponse();
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
}

function walkCategory(value: unknown, context: WalkContext): void {
  if (context.depth > context.maxDepth) throw taxonomyIntegrityError("DEPTH_LIMIT");
  if (context.output.length >= context.maxNodes) throw taxonomyIntegrityError("NODE_LIMIT");
  if (!isRecord(value)) return invalidResponse();
  const summary = readSummary(value, context.siteId);
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
    if (!Array.isArray(rawChildren)) return invalidResponse();
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
      });
    }
  }
}

export function parseMeliCategoryTree(
  payload: unknown,
  siteId: string,
  limits: Readonly<{ maxNodes?: number; maxDepth?: number }> = {},
): readonly TaxonomyCategoryNode[] {
  if (!Array.isArray(payload) || payload.length === 0) return invalidResponse();
  const output: TaxonomyCategoryNode[] = [];
  const maxNodes = limits.maxNodes ?? 100_000;
  const maxDepth = limits.maxDepth ?? 64;
  for (const category of payload) {
    walkCategory(category, {
      siteId,
      parentExternalCategoryId: null,
      inferredPathIds: Object.freeze([]),
      inferredPathNames: Object.freeze([]),
      output,
      depth: 1,
      maxDepth,
      maxNodes,
    });
  }
  return Object.freeze(output);
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
