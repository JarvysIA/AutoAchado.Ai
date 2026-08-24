import { registrySyncError } from "./errors.js";
import type {
  CategoryDiffKind,
  CategoryDiffOperation,
  CommerceRegistryStateDiff,
  CommerceRegistrySyncPlan,
  CurrentCommerceRegistryState,
  CurrentMarketplaceCategory,
  CurrentVerticalCategoryMapping,
  DesiredMarketplaceCategory,
  DesiredVerticalCategoryMapping,
  MappingDiffKind,
  MappingDiffOperation,
} from "./types.js";
import { validateCurrentMapping } from "./validation.js";

export function marketplaceCategoryIdentityKey(
  value: Pick<DesiredMarketplaceCategory, "marketplaceKey" | "siteId" | "externalCategoryId">,
): string {
  return JSON.stringify([value.marketplaceKey, value.siteId, value.externalCategoryId]);
}

export function verticalMappingIdentityKey(
  value: Pick<DesiredVerticalCategoryMapping, "verticalKey" | "marketplaceKey" | "siteId" | "externalCategoryId">,
): string {
  return JSON.stringify([value.verticalKey, value.marketplaceKey, value.siteId, value.externalCategoryId]);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function categoryFactsEqual(
  current: CurrentMarketplaceCategory,
  desired: DesiredMarketplaceCategory,
): boolean {
  return current.name === desired.name
    && current.parentExternalCategoryId === desired.parentExternalCategoryId
    && sameArray(current.pathExternalIds, desired.pathExternalIds)
    && sameArray(current.pathNames, desired.pathNames)
    && current.isLeaf === desired.isLeaf
    && current.sourceVersion === desired.sourceVersion
    && current.configVersion === desired.configVersion;
}

function mappingDecisionEqual(
  current: CurrentVerticalCategoryMapping,
  desired: DesiredVerticalCategoryMapping,
): boolean {
  return current.scopeStatus === desired.scopeStatus
    && current.priorityTier === desired.priorityTier
    && current.familyKey === desired.familyKey
    && current.commercialFamilyKeyDefault === desired.commercialFamilyKeyDefault
    && current.classificationRule === desired.classificationRule
    && current.classificationVersion === desired.classificationVersion
    && current.decisionReason === desired.decisionReason;
}

function categorySummary(operations: readonly CategoryDiffOperation[]) {
  const summary: Record<Lowercase<CategoryDiffKind>, number> = {
    insert: 0,
    update: 0,
    unchanged: 0,
    reactivate: 0,
  };
  for (const operation of operations) summary[operation.kind.toLowerCase() as Lowercase<CategoryDiffKind>] += 1;
  return Object.freeze(summary);
}

function mappingSummary(operations: readonly MappingDiffOperation[]) {
  const summary: Record<Lowercase<MappingDiffKind>, number> = {
    insert: 0,
    update: 0,
    unchanged: 0,
    reactivate: 0,
    inactivate: 0,
    manual_override_skipped: 0,
  };
  for (const operation of operations) summary[operation.kind.toLowerCase() as Lowercase<MappingDiffKind>] += 1;
  return Object.freeze(summary);
}

function currentCategoryMap(
  values: readonly CurrentMarketplaceCategory[],
): ReadonlyMap<string, CurrentMarketplaceCategory> {
  const output = new Map<string, CurrentMarketplaceCategory>();
  for (const value of values) {
    const key = marketplaceCategoryIdentityKey(value);
    if (output.has(key)) {
      throw registrySyncError("REGISTRY_DUPLICATE_CURRENT_CATEGORY", "Categoria atual duplicada", {
        externalCategoryId: value.externalCategoryId,
      });
    }
    output.set(key, value);
  }
  return output;
}

function currentMappingMap(
  values: readonly CurrentVerticalCategoryMapping[],
): ReadonlyMap<string, CurrentVerticalCategoryMapping> {
  const output = new Map<string, CurrentVerticalCategoryMapping>();
  for (const value of values) {
    validateCurrentMapping(value);
    const key = verticalMappingIdentityKey(value);
    if (output.has(key)) {
      throw registrySyncError("REGISTRY_DUPLICATE_CURRENT_MAPPING", "Mapping atual duplicado", {
        externalCategoryId: value.externalCategoryId,
      });
    }
    output.set(key, value);
  }
  return output;
}

function inPlanScope(mapping: CurrentVerticalCategoryMapping, plan: CommerceRegistrySyncPlan): boolean {
  return mapping.marketplaceKey === plan.context.marketplaceKey
    && mapping.siteId === plan.context.siteId
    && mapping.verticalKey === plan.context.verticalKey;
}

export function diffCommerceRegistryState(
  desired: CommerceRegistrySyncPlan,
  current: CurrentCommerceRegistryState,
): Readonly<CommerceRegistryStateDiff> {
  const categoriesByKey = currentCategoryMap(current.categories);
  const mappingsByKey = currentMappingMap(current.mappings);
  const controlled = new Set(current.controlledMappingExternalCategoryIds);
  if (controlled.size !== current.controlledMappingExternalCategoryIds.length) {
    throw registrySyncError("REGISTRY_INVALID_CURRENT_STATE", "Membership do universo contém IDs duplicados");
  }

  const categoryOperations: CategoryDiffOperation[] = desired.categories.map((record) => {
    const identityKey = marketplaceCategoryIdentityKey(record);
    const existing = categoriesByKey.get(identityKey) ?? null;
    let kind: CategoryDiffKind;
    if (existing === null) kind = "INSERT";
    else if (!existing.active) kind = "REACTIVATE";
    else if (!categoryFactsEqual(existing, record)) kind = "UPDATE";
    else kind = "UNCHANGED";
    return Object.freeze({ kind, identityKey, current: existing, desired: record });
  });

  const desiredMappingKeys = new Set<string>();
  const mappingOperations: MappingDiffOperation[] = [];
  for (const record of desired.mappings) {
    const identityKey = verticalMappingIdentityKey(record);
    desiredMappingKeys.add(identityKey);
    const existing = mappingsByKey.get(identityKey) ?? null;
    if (existing === null) {
      mappingOperations.push(Object.freeze({
        kind: "INSERT", identityKey, current: null, desired: record, decisionChanged: true,
      }));
      continue;
    }
    const decisionChanged = !mappingDecisionEqual(existing, record);
    let kind: MappingDiffKind;
    if (!existing.active) kind = "REACTIVATE";
    else if (existing.manualOverride && decisionChanged) kind = "MANUAL_OVERRIDE_SKIPPED";
    else if (existing.manualOverride) kind = "UNCHANGED";
    else if (decisionChanged) kind = "UPDATE";
    else kind = "UNCHANGED";
    mappingOperations.push(Object.freeze({
      kind,
      identityKey,
      current: existing,
      desired: record,
      decisionChanged: existing.manualOverride ? false : decisionChanged,
    }));
  }

  for (const existing of current.mappings) {
    if (!inPlanScope(existing, desired) || !controlled.has(existing.externalCategoryId)) continue;
    const identityKey = verticalMappingIdentityKey(existing);
    if (desiredMappingKeys.has(identityKey)) continue;
    mappingOperations.push(Object.freeze({
      kind: existing.active ? "INACTIVATE" : "UNCHANGED",
      identityKey,
      current: existing,
      desired: null,
      decisionChanged: false,
    }));
  }

  categoryOperations.sort((left, right) => left.identityKey.localeCompare(right.identityKey));
  mappingOperations.sort((left, right) => left.identityKey.localeCompare(right.identityKey));
  return Object.freeze({
    categories: Object.freeze(categoryOperations),
    mappings: Object.freeze(mappingOperations),
    summary: Object.freeze({
      categories: categorySummary(categoryOperations),
      mappings: mappingSummary(mappingOperations),
    }),
  });
}
