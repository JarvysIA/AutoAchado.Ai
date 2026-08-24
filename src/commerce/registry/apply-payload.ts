import type { CategoryScope, IsoTimestamp, RegistryCategoryPriorityTier } from "../../persistence/contracts.js";
import { registrySyncError } from "./errors.js";
import type { CommerceRegistrySyncPlan, DesiredMarketplaceCategory, DesiredVerticalCategoryMapping } from "./types.js";

export const COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION = "commerce-registry-apply/v1" as const;

export interface AtomicRegistryApplyContext {
  readonly contractVersion: typeof COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly rootExternalCategoryId: string;
  readonly sourceVersion: string;
  readonly classificationVersion: string;
  readonly configVersion: string;
  readonly checkedAt: IsoTimestamp;
  readonly expectedCategoryCount: number;
  readonly expectedMappingCount: number;
  readonly expectedAutomaticEligibleCount: number;
}

export interface AtomicRegistryApplyRow {
  readonly externalCategoryId: string;
  readonly parentExternalCategoryId: string | null;
  readonly name: string;
  readonly pathExternalIds: readonly string[];
  readonly pathNames: readonly string[];
  readonly isLeaf: boolean;
  readonly scopeStatus: CategoryScope;
  readonly priorityTier: RegistryCategoryPriorityTier | null;
  readonly familyKey: string | null;
  readonly commercialFamilyKeyDefault: string | null;
  readonly classificationRule: string;
  readonly decisionReason: string | null;
}

export interface AtomicRegistryApplyPayload {
  readonly context: Readonly<AtomicRegistryApplyContext>;
  readonly rows: readonly Readonly<AtomicRegistryApplyRow>[];
}

export interface AtomicRegistryPayloadMeasurement {
  readonly bytes: number;
  readonly kibibytes: number;
  readonly mebibytes: number;
}

const SCOPES = new Set<CategoryScope>(["ALLOWED", "REVIEW", "EXCLUDED", "UNKNOWN"]);
const TIERS = new Set<RegistryCategoryPriorityTier>(["A", "B", "C"]);

function fail(message: string, externalCategoryId?: string): never {
  throw registrySyncError("REGISTRY_APPLY_PAYLOAD_INVALID", message, externalCategoryId === undefined ? {} : { externalCategoryId });
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function validNullableText(value: unknown): value is string | null {
  return value === null || nonEmpty(value);
}

function validStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
}

function freezeRow(row: AtomicRegistryApplyRow): Readonly<AtomicRegistryApplyRow> {
  return Object.freeze({
    ...row,
    pathExternalIds: Object.freeze([...row.pathExternalIds]),
    pathNames: Object.freeze([...row.pathNames]),
  });
}

function categoryIdentity(category: DesiredMarketplaceCategory): string {
  return JSON.stringify([category.marketplaceKey, category.siteId, category.externalCategoryId]);
}

function mappingIdentity(mapping: DesiredVerticalCategoryMapping): string {
  return JSON.stringify([mapping.marketplaceKey, mapping.siteId, mapping.externalCategoryId]);
}

export function validateAtomicRegistryApplyPayload(value: unknown): asserts value is AtomicRegistryApplyPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("Payload deve ser objeto");
  const payload = value as Record<string, unknown>;
  const contextValue = payload.context;
  if (typeof contextValue !== "object" || contextValue === null || Array.isArray(contextValue)) fail("Contexto inválido");
  const context = contextValue as Record<string, unknown>;
  if (context.contractVersion !== COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION) fail("Versão do contrato inválida");
  for (const key of [
    "marketplaceKey", "siteId", "verticalKey", "rootExternalCategoryId", "sourceVersion",
    "classificationVersion", "configVersion", "checkedAt",
  ]) if (!nonEmpty(context[key])) fail("Contexto incompleto");
  if (!validIsoDateTime(context.checkedAt as string)) fail("checkedAt inválido");
  for (const key of ["expectedCategoryCount", "expectedMappingCount", "expectedAutomaticEligibleCount"]) {
    if (!validCount(context[key])) fail("Contagem esperada inválida");
  }
  if (!Array.isArray(payload.rows)) fail("Rows inválidas");
  const rows = payload.rows as unknown[];
  if (rows.length !== context.expectedCategoryCount || rows.length !== context.expectedMappingCount) fail("Contagem de rows divergente");

  const byId = new Map<string, AtomicRegistryApplyRow>();
  const childCounts = new Map<string, number>();
  let automaticEligibleCount = 0;
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) fail("Row inválida");
    const row = raw as unknown as AtomicRegistryApplyRow;
    if (!nonEmpty(row.externalCategoryId) || byId.has(row.externalCategoryId)) {
      fail("ID externo vazio ou duplicado", typeof row.externalCategoryId === "string" ? row.externalCategoryId : undefined);
    }
    if (row.parentExternalCategoryId !== null && !nonEmpty(row.parentExternalCategoryId)) fail("Parent inválido", row.externalCategoryId);
    if (!nonEmpty(row.name) || !validStringArray(row.pathExternalIds) || !validStringArray(row.pathNames)
      || typeof row.isLeaf !== "boolean" || !SCOPES.has(row.scopeStatus)
      || (row.priorityTier !== null && !TIERS.has(row.priorityTier))
      || !validNullableText(row.familyKey) || !validNullableText(row.commercialFamilyKeyDefault)
      || !nonEmpty(row.classificationRule) || !validNullableText(row.decisionReason)) {
      fail("Campos da row inválidos", row.externalCategoryId);
    }
    const tierValid = row.scopeStatus === "ALLOWED" ? row.priorityTier !== null : row.priorityTier === null;
    if (!tierValid || row.pathExternalIds.length !== row.pathNames.length
      || row.pathExternalIds[0] !== context.rootExternalCategoryId
      || row.pathExternalIds.at(-1) !== row.externalCategoryId || row.pathNames.at(-1) !== row.name
      || (row.parentExternalCategoryId !== null && row.pathExternalIds.at(-2) !== row.parentExternalCategoryId)) {
      fail("Semântica da row inválida", row.externalCategoryId);
    }
    if (row.parentExternalCategoryId !== null) {
      childCounts.set(row.parentExternalCategoryId, (childCounts.get(row.parentExternalCategoryId) ?? 0) + 1);
    }
    if (row.scopeStatus === "ALLOWED" && (row.priorityTier === "A" || row.priorityTier === "B")) automaticEligibleCount += 1;
    byId.set(row.externalCategoryId, row);
  }

  const root = byId.get(context.rootExternalCategoryId as string);
  if (!root || root.parentExternalCategoryId !== null || root.pathExternalIds.length !== 1
    || root.pathExternalIds[0] !== root.externalCategoryId || root.pathNames.length !== 1 || root.pathNames[0] !== root.name) {
    fail("Raiz inválida");
  }
  for (const row of byId.values()) {
    if (row.externalCategoryId !== root.externalCategoryId
      && (row.parentExternalCategoryId === null || !byId.has(row.parentExternalCategoryId))) fail("Parent ausente", row.externalCategoryId);
    if (row.isLeaf !== ((childCounts.get(row.externalCategoryId) ?? 0) === 0)) fail("Leaf divergente", row.externalCategoryId);
    const pathIds = new Set(row.pathExternalIds);
    if (pathIds.size !== row.pathExternalIds.length
      || row.pathExternalIds.some((pathId) => !byId.has(pathId))
      || row.pathExternalIds.some((pathId, index) => byId.get(pathId)?.name !== row.pathNames[index])) {
      fail("Path referencia categoria ausente ou nome divergente", row.externalCategoryId);
    }
  }
  if (automaticEligibleCount !== context.expectedAutomaticEligibleCount) fail("Contagem automática divergente");
}

export function buildAtomicRegistryApplyPayload(plan: CommerceRegistrySyncPlan): Readonly<AtomicRegistryApplyPayload> {
  const categories = new Map<string, DesiredMarketplaceCategory>();
  const categoryIds = new Set<string>();
  for (const category of plan.categories) {
    const identity = categoryIdentity(category);
    if (categories.has(identity) || categoryIds.has(category.externalCategoryId)
      || category.marketplaceKey !== plan.context.marketplaceKey || category.siteId !== plan.context.siteId) {
      fail("Categoria duplicada ou fora do contexto", category.externalCategoryId);
    }
    categories.set(identity, category);
    categoryIds.add(category.externalCategoryId);
  }

  const mappings = new Map<string, DesiredVerticalCategoryMapping>();
  for (const mapping of plan.mappings) {
    const identity = mappingIdentity(mapping);
    if (mappings.has(identity) || mapping.marketplaceKey !== plan.context.marketplaceKey
      || mapping.siteId !== plan.context.siteId || mapping.verticalKey !== plan.context.verticalKey
      || mapping.classificationVersion !== plan.context.expectedClassificationVersion) {
      fail("Mapping duplicado ou fora do contexto", mapping.externalCategoryId);
    }
    mappings.set(identity, mapping);
  }
  if (categories.size !== mappings.size) fail("Relação category/mapping não é 1:1");

  const rows = [...categories.values()].sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId))
    .map((category) => {
      const identity = categoryIdentity(category);
      const mapping = mappings.get(identity);
      if (!mapping) fail("Mapping ausente", category.externalCategoryId);
      mappings.delete(identity);
      return freezeRow({
        externalCategoryId: category.externalCategoryId, parentExternalCategoryId: category.parentExternalCategoryId,
        name: category.name, pathExternalIds: category.pathExternalIds, pathNames: category.pathNames,
        isLeaf: category.isLeaf, scopeStatus: mapping.scopeStatus, priorityTier: mapping.priorityTier,
        familyKey: mapping.familyKey, commercialFamilyKeyDefault: mapping.commercialFamilyKeyDefault,
        classificationRule: mapping.classificationRule, decisionReason: mapping.decisionReason,
      });
    });
  if (mappings.size !== 0) fail("Mapping sem categoria correspondente");

  const payload: AtomicRegistryApplyPayload = Object.freeze({
    context: Object.freeze({
      contractVersion: COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION,
      marketplaceKey: plan.context.marketplaceKey, siteId: plan.context.siteId, verticalKey: plan.context.verticalKey,
      rootExternalCategoryId: plan.context.rootExternalCategoryId, sourceVersion: plan.context.sourceVersion,
      classificationVersion: plan.context.expectedClassificationVersion, configVersion: plan.context.configVersion,
      checkedAt: plan.context.checkedAt, expectedCategoryCount: plan.summary.categoryCount,
      expectedMappingCount: plan.summary.mappingCount, expectedAutomaticEligibleCount: plan.summary.automaticEligibleCount,
    }),
    rows: Object.freeze(rows),
  });
  validateAtomicRegistryApplyPayload(payload);
  return payload;
}

export function measureAtomicRegistryApplyPayload(payload: AtomicRegistryApplyPayload): Readonly<AtomicRegistryPayloadMeasurement> {
  validateAtomicRegistryApplyPayload(payload);
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  return Object.freeze({ bytes, kibibytes: bytes / 1024, mebibytes: bytes / (1024 * 1024) });
}
