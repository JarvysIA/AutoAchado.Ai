import { registrySyncError } from "../../commerce/registry/errors.js";
import type { AtomicRegistryApplyPayload } from "../../commerce/registry/apply-payload.js";

export const COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION = "commerce-registry-apply-result/v1" as const;

export interface CommerceRegistryApplyResult {
  readonly contractVersion: typeof COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly rootExternalCategoryId: string;
  readonly sourceVersion: string;
  readonly classificationVersion: string;
  readonly categories: Readonly<{ inserted: number; updated: number; unchanged: number; reactivated: number }>;
  readonly mappings: Readonly<{
    inserted: number; updated: number; unchanged: number; reactivated: number;
    inactivated: number; manualOverrideSkipped: number;
  }>;
  readonly desired: Readonly<{ categories: number; mappings: number; automaticEligible: number }>;
  readonly effective: Readonly<{
    activeMappings: number; allowed: number; review: number; excluded: number; unknown: number;
    tierA: number; tierB: number; tierC: number; automaticEligible: number;
  }>;
}

function invalid(): never {
  throw registrySyncError("REGISTRY_APPLY_RESULT_INVALID", "Resposta do apply inválida");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return invalid();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

export function validateCommerceRegistryApplyResult(
  value: unknown,
  expected?: AtomicRegistryApplyPayload,
): Readonly<CommerceRegistryApplyResult> {
  const input = record(value);
  if (input.contractVersion !== COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION) return invalid();
  const categoriesInput = record(input.categories);
  const mappingsInput = record(input.mappings);
  const desiredInput = record(input.desired);
  const effectiveInput = record(input.effective);
  const result: CommerceRegistryApplyResult = {
    contractVersion: COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION,
    marketplaceKey: text(input.marketplaceKey), siteId: text(input.siteId), verticalKey: text(input.verticalKey),
    rootExternalCategoryId: text(input.rootExternalCategoryId), sourceVersion: text(input.sourceVersion),
    classificationVersion: text(input.classificationVersion),
    categories: {
      inserted: count(categoriesInput.inserted), updated: count(categoriesInput.updated),
      unchanged: count(categoriesInput.unchanged), reactivated: count(categoriesInput.reactivated),
    },
    mappings: {
      inserted: count(mappingsInput.inserted), updated: count(mappingsInput.updated),
      unchanged: count(mappingsInput.unchanged), reactivated: count(mappingsInput.reactivated),
      inactivated: count(mappingsInput.inactivated), manualOverrideSkipped: count(mappingsInput.manualOverrideSkipped),
    },
    desired: {
      categories: count(desiredInput.categories), mappings: count(desiredInput.mappings),
      automaticEligible: count(desiredInput.automaticEligible),
    },
    effective: {
      activeMappings: count(effectiveInput.activeMappings), allowed: count(effectiveInput.allowed),
      review: count(effectiveInput.review), excluded: count(effectiveInput.excluded), unknown: count(effectiveInput.unknown),
      tierA: count(effectiveInput.tierA), tierB: count(effectiveInput.tierB), tierC: count(effectiveInput.tierC),
      automaticEligible: count(effectiveInput.automaticEligible),
    },
  };

  const categoryTotal = result.categories.inserted + result.categories.updated
    + result.categories.unchanged + result.categories.reactivated;
  const mappingTotal = result.mappings.inserted + result.mappings.updated + result.mappings.unchanged
    + result.mappings.reactivated + result.mappings.manualOverrideSkipped;
  const scopeTotal = result.effective.allowed + result.effective.review
    + result.effective.excluded + result.effective.unknown;
  const tierTotal = result.effective.tierA + result.effective.tierB + result.effective.tierC;
  if (categoryTotal !== result.desired.categories || mappingTotal !== result.desired.mappings
    || scopeTotal !== result.effective.activeMappings || tierTotal !== result.effective.allowed
    || result.effective.automaticEligible !== result.effective.tierA + result.effective.tierB) return invalid();

  if (expected) {
    const contextMatches = result.marketplaceKey === expected.context.marketplaceKey
      && result.siteId === expected.context.siteId && result.verticalKey === expected.context.verticalKey
      && result.rootExternalCategoryId === expected.context.rootExternalCategoryId
      && result.sourceVersion === expected.context.sourceVersion
      && result.classificationVersion === expected.context.classificationVersion;
    if (!contextMatches) {
      throw registrySyncError("REGISTRY_APPLY_RESULT_CONTEXT_MISMATCH", "Contexto da resposta divergente");
    }
    if (result.desired.categories !== expected.context.expectedCategoryCount
      || result.desired.mappings !== expected.context.expectedMappingCount
      || result.desired.automaticEligible !== expected.context.expectedAutomaticEligibleCount) return invalid();
  }
  return Object.freeze(result);
}
