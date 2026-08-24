import type { CategoryDecisionSource, CategoryScope, RegistryCategoryPriorityTier } from "../../persistence/contracts.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrySyncError } from "../../commerce/registry/errors.js";
import type {
  CurrentCommerceRegistryState,
  CurrentMarketplaceCategory,
  CurrentVerticalCategoryMapping,
} from "../../commerce/registry/types.js";
import { validateCurrentMapping } from "../../commerce/registry/validation.js";

export const REGISTRY_CURRENT_STATE_PAGE_SIZE = 1000;
const MAX_PAGES = 100_000;
const CATEGORY_FIELDS = [
  "marketplace_category_id", "marketplace_key", "site_id", "external_category_id",
  "parent_marketplace_category_id", "name", "path_external_ids", "path_names", "is_leaf", "active",
  "source_version", "config_version", "first_seen_at", "last_seen_at", "source_checked_at",
].join(",");
const MAPPING_FIELDS = [
  "vertical_key", "marketplace_category_id", "scope_status", "priority_tier", "family_key",
  "commercial_family_key_default", "classification_rule", "classification_version", "manual_override",
  "decision_source", "decision_reason", "decided_at", "active",
].join(",");

export interface RegistryReadResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface RegistryReadQuery {
  select(columns: string): RegistryReadQuery;
  eq(column: string, value: string): RegistryReadQuery;
  order(column: string, options?: { ascending?: boolean }): RegistryReadQuery;
  range(from: number, to: number): PromiseLike<RegistryReadResult>;
}

export interface RegistryReadClient {
  from(table: string): RegistryReadQuery;
}
export function registryReadClientFromSupabase(client: SupabaseClient): RegistryReadClient {
  return {
    from: (table) => client.from(table) as unknown as RegistryReadQuery,
  };
}


export interface LoadCurrentCommerceRegistryStateInput {
  readonly client: RegistryReadClient;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly rootExternalCategoryId: string;
  readonly desiredExternalCategoryIds: readonly string[];
}

interface RawCategory {
  marketplaceCategoryId: string;
  marketplaceKey: string;
  siteId: string;
  externalCategoryId: string;
  parentMarketplaceCategoryId: string | null;
  name: string;
  pathExternalIds: readonly string[];
  pathNames: readonly string[];
  isLeaf: boolean;
  active: boolean;
  sourceVersion: string | null;
  configVersion: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceCheckedAt: string;
}

function fail(code: "REGISTRY_CURRENT_STATE_READ_FAILED" | "REGISTRY_CURRENT_STATE_RESPONSE_INVALID"
  | "REGISTRY_CURRENT_STATE_PARENT_UNRESOLVED", message: string, externalCategoryId?: string): never {
  throw registrySyncError(code, message, externalCategoryId === undefined ? {} : { externalCategoryId });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Campo textual inválido");
  return value;
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Campo textual nullable inválido");
  return value;
}

function bool(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Campo booleano inválido");
  return value;
}

function strings(row: Record<string, unknown>, key: string): readonly string[] {
  const value = row[key];
  if (!Array.isArray(value) || value.length === 0
    || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Array textual inválido");
  }
  return Object.freeze([...(value as string[])]);
}

function timestamp(row: Record<string, unknown>, key: string): string {
  const value = text(row, key);
  if (!Number.isFinite(Date.parse(value))) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Timestamp inválido");
  return value;
}

function nullableTimestamp(row: Record<string, unknown>, key: string): string | null {
  const value = nullableText(row, key);
  if (value !== null && !Number.isFinite(Date.parse(value))) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Timestamp nullable inválido");
  return value;
}

function uuid(row: Record<string, unknown>, key: string): string {
  const value = text(row, key);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "UUID inválido");
  }
  return value;
}

function nullableUuid(row: Record<string, unknown>, key: string): string | null {
  return row[key] === null ? null : uuid(row, key);
}

function rawCategory(value: unknown): RawCategory {
  if (!isRecord(value)) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Categoria inválida");
  const category: RawCategory = {
    marketplaceCategoryId: uuid(value, "marketplace_category_id"),
    marketplaceKey: text(value, "marketplace_key"), siteId: text(value, "site_id"),
    externalCategoryId: text(value, "external_category_id"),
    parentMarketplaceCategoryId: nullableUuid(value, "parent_marketplace_category_id"),
    name: text(value, "name"), pathExternalIds: strings(value, "path_external_ids"),
    pathNames: strings(value, "path_names"), isLeaf: bool(value, "is_leaf"), active: bool(value, "active"),
    sourceVersion: nullableText(value, "source_version"), configVersion: text(value, "config_version"),
    firstSeenAt: timestamp(value, "first_seen_at"), lastSeenAt: timestamp(value, "last_seen_at"),
    sourceCheckedAt: timestamp(value, "source_checked_at"),
  };
  if (category.pathExternalIds.length !== category.pathNames.length
    || category.pathExternalIds.at(-1) !== category.externalCategoryId
    || category.pathNames.at(-1) !== category.name) {
    return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Path atual inválido", category.externalCategoryId);
  }
  return category;
}

function currentMapping(value: unknown, category: RawCategory): CurrentVerticalCategoryMapping {
  if (!isRecord(value)) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Mapping inválido");
  if (uuid(value, "marketplace_category_id") !== category.marketplaceCategoryId) {
    return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Referência de mapping inválida", category.externalCategoryId);
  }
  const scopeStatus = text(value, "scope_status") as CategoryScope;
  const priorityText = nullableText(value, "priority_tier");
  const mapping: CurrentVerticalCategoryMapping = {
    marketplaceCategoryId: category.marketplaceCategoryId,
    verticalKey: text(value, "vertical_key"), marketplaceKey: category.marketplaceKey, siteId: category.siteId,
    externalCategoryId: category.externalCategoryId, scopeStatus,
    priorityTier: priorityText as RegistryCategoryPriorityTier | null,
    familyKey: nullableText(value, "family_key"),
    commercialFamilyKeyDefault: nullableText(value, "commercial_family_key_default"),
    classificationRule: nullableText(value, "classification_rule"),
    classificationVersion: text(value, "classification_version"), manualOverride: bool(value, "manual_override"),
    decisionSource: text(value, "decision_source") as CategoryDecisionSource,
    decisionReason: nullableText(value, "decision_reason"), decidedAt: nullableTimestamp(value, "decided_at"),
    active: bool(value, "active"),
  };
  validateCurrentMapping(mapping);
  return Object.freeze(mapping);
}

async function loadPages(
  input: LoadCurrentCommerceRegistryStateInput,
  table: string,
  fields: string,
  filters: readonly (readonly [string, string])[],
  orderBy: string,
): Promise<readonly unknown[]> {
  const output: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = input.client.from(table).select(fields);
    for (const [column, value] of filters) query = query.eq(column, value);
    const from = page * REGISTRY_CURRENT_STATE_PAGE_SIZE;
    let result: RegistryReadResult;
    try {
      result = await query.order(orderBy, { ascending: true }).range(from, from + REGISTRY_CURRENT_STATE_PAGE_SIZE - 1);
    } catch {
      return fail("REGISTRY_CURRENT_STATE_READ_FAILED", "Falha de transporte na leitura paginada");
    }
    if (result.error !== null || !Array.isArray(result.data)) {
      return fail(result.error === null ? "REGISTRY_CURRENT_STATE_RESPONSE_INVALID" : "REGISTRY_CURRENT_STATE_READ_FAILED",
        "Falha sanitizada na leitura paginada");
    }
    output.push(...result.data);
    if (result.data.length < REGISTRY_CURRENT_STATE_PAGE_SIZE) return output;
  }
  return fail("REGISTRY_CURRENT_STATE_READ_FAILED", "Limite interno de paginação excedido");
}

function validateInput(input: LoadCurrentCommerceRegistryStateInput): Set<string> {
  for (const value of [input.marketplaceKey, input.siteId, input.verticalKey, input.rootExternalCategoryId]) {
    if (value.trim().length === 0) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Contexto de leitura inválido");
  }
  const desired = new Set<string>();
  for (const value of input.desiredExternalCategoryIds) {
    if (value.trim().length === 0 || desired.has(value)) {
      return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Desired ID vazio ou duplicado", value);
    }
    desired.add(value);
  }
  return desired;
}

export async function loadCurrentCommerceRegistryState(
  input: LoadCurrentCommerceRegistryStateInput,
): Promise<Readonly<CurrentCommerceRegistryState>> {
  const desired = validateInput(input);
  const categoryRows = await loadPages(input, "marketplace_categories", CATEGORY_FIELDS, [
    ["marketplace_key", input.marketplaceKey], ["site_id", input.siteId],
  ], "external_category_id");
  const allCategories = categoryRows.map(rawCategory);
  const byUuid = new Map<string, RawCategory>();
  const byExternalId = new Map<string, RawCategory>();
  for (const category of allCategories) {
    if (byUuid.has(category.marketplaceCategoryId) || byExternalId.has(category.externalCategoryId)) {
      return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Categoria atual duplicada", category.externalCategoryId);
    }
    byUuid.set(category.marketplaceCategoryId, category);
    byExternalId.set(category.externalCategoryId, category);
  }

  const controlled = new Set<string>();
  const relevant = allCategories.filter((category) => {
    const inRoot = category.pathExternalIds.includes(input.rootExternalCategoryId);
    if (inRoot) controlled.add(category.externalCategoryId);
    return inRoot || desired.has(category.externalCategoryId);
  });
  const relevantUuids = new Set(relevant.map((category) => category.marketplaceCategoryId));
  const categories: CurrentMarketplaceCategory[] = relevant.map((category) => {
    const parent = category.parentMarketplaceCategoryId === null ? null : byUuid.get(category.parentMarketplaceCategoryId);
    if (category.parentMarketplaceCategoryId !== null && !parent) {
      return fail("REGISTRY_CURRENT_STATE_PARENT_UNRESOLVED", "Parent atual não resolvido", category.externalCategoryId);
    }
    return Object.freeze({
      marketplaceCategoryId: category.marketplaceCategoryId, marketplaceKey: category.marketplaceKey,
      siteId: category.siteId, externalCategoryId: category.externalCategoryId,
      parentExternalCategoryId: parent?.externalCategoryId ?? null, name: category.name,
      pathExternalIds: category.pathExternalIds, pathNames: category.pathNames, isLeaf: category.isLeaf,
      active: category.active, sourceVersion: category.sourceVersion, configVersion: category.configVersion,
      firstSeenAt: category.firstSeenAt, lastSeenAt: category.lastSeenAt, sourceCheckedAt: category.sourceCheckedAt,
    });
  }).sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));

  const mappingRows = await loadPages(input, "vertical_category_mappings", MAPPING_FIELDS,
    [["vertical_key", input.verticalKey]], "marketplace_category_id");
  const mappings: CurrentVerticalCategoryMapping[] = [];
  const mappingIds = new Set<string>();
  for (const value of mappingRows) {
    if (!isRecord(value)) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Mapping inválido");
    const categoryId = uuid(value, "marketplace_category_id");
    if (!relevantUuids.has(categoryId)) continue;
    const category = byUuid.get(categoryId);
    if (!category) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Categoria do mapping ausente");
    const mapping = currentMapping(value, category);
    const identity = JSON.stringify([mapping.verticalKey, mapping.marketplaceKey, mapping.siteId, mapping.externalCategoryId]);
    if (mappingIds.has(identity)) return fail("REGISTRY_CURRENT_STATE_RESPONSE_INVALID", "Mapping atual duplicado", mapping.externalCategoryId);
    mappingIds.add(identity);
    mappings.push(mapping);
  }
  mappings.sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));
  return Object.freeze({
    categories: Object.freeze(categories), mappings: Object.freeze(mappings),
    controlledMappingExternalCategoryIds: Object.freeze([...controlled].sort()),
  });
}
