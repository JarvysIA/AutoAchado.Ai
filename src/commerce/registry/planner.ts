import type { CategoryScope, RegistryCategoryPriorityTier } from "../../persistence/contracts.js";
import type { TaxonomyCategoryNode } from "../../taxonomy/types.js";
import { registrySyncError } from "./errors.js";
import type {
  BuildCommerceRegistrySyncPlanInput,
  CommerceRegistryPlanSummary,
  CommerceRegistrySyncPlan,
  DesiredMarketplaceCategory,
  DesiredVerticalCategoryMapping,
} from "./types.js";
import {
  validateRegistryClassification,
  validateRegistrySyncContext,
  validateRegistryTaxonomyUniverse,
} from "./validation.js";

function freezeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function desiredCategory(
  node: TaxonomyCategoryNode,
  input: BuildCommerceRegistrySyncPlanInput,
): Readonly<DesiredMarketplaceCategory> {
  const { context } = input;
  return Object.freeze({
    marketplaceKey: context.marketplaceKey,
    siteId: context.siteId,
    externalCategoryId: node.externalCategoryId,
    parentExternalCategoryId: node.parentExternalCategoryId,
    name: node.name,
    pathExternalIds: freezeStrings(node.pathExternalCategoryIds),
    pathNames: freezeStrings(node.pathNames),
    isLeaf: node.isLeaf,
    active: true,
    sourceVersion: context.sourceVersion,
    configVersion: context.configVersion,
    checkedAt: context.checkedAt,
  });
}

export function buildCommerceRegistrySyncPlan(
  input: BuildCommerceRegistrySyncPlanInput,
): Readonly<CommerceRegistrySyncPlan> {
  validateRegistrySyncContext(input.context);
  const root = input.taxonomyTree.nodes.find(
    (node) => node.externalCategoryId === input.context.rootExternalCategoryId,
  );
  if (!root) {
    throw registrySyncError("REGISTRY_INVALID_TREE", "Raiz do universo ausente");
  }
  const nodes = [root, ...input.taxonomyTree.getDescendants(root.externalCategoryId)]
    .sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId));
  validateRegistryTaxonomyUniverse(nodes, input.context);

  const scope: Record<Lowercase<CategoryScope>, number> = {
    allowed: 0,
    review: 0,
    excluded: 0,
    unknown: 0,
  };
  const tiers: Record<RegistryCategoryPriorityTier, number> = { A: 0, B: 0, C: 0 };
  let automaticEligibleCount = 0;
  const categories: Readonly<DesiredMarketplaceCategory>[] = [];
  const mappings: Readonly<DesiredVerticalCategoryMapping>[] = [];

  for (const node of nodes) {
    const classification = input.classifyCategory(node.externalCategoryId, input.taxonomyTree);
    validateRegistryClassification(
      classification,
      node.externalCategoryId,
      input.context.expectedClassificationVersion,
    );
    categories.push(desiredCategory(node, input));
    mappings.push(Object.freeze({
      verticalKey: input.context.verticalKey,
      marketplaceKey: input.context.marketplaceKey,
      siteId: input.context.siteId,
      externalCategoryId: node.externalCategoryId,
      scopeStatus: classification.scopeStatus,
      priorityTier: classification.priorityTier,
      familyKey: classification.familyKey,
      commercialFamilyKeyDefault: classification.commercialFamilyKeyDefault,
      classificationRule: classification.ruleId,
      classificationVersion: classification.classificationVersion,
      manualOverride: false,
      decisionSource: "AUTO",
      decisionReason: classification.reason,
      active: true,
    }));
    scope[classification.scopeStatus.toLowerCase() as Lowercase<CategoryScope>] += 1;
    if (classification.priorityTier !== null) tiers[classification.priorityTier] += 1;
    if (classification.scopeStatus === "ALLOWED"
      && (classification.priorityTier === "A" || classification.priorityTier === "B")) {
      automaticEligibleCount += 1;
    }
  }

  const summary: CommerceRegistryPlanSummary = Object.freeze({
    categoryCount: categories.length,
    mappingCount: mappings.length,
    scope: Object.freeze(scope),
    tiers: Object.freeze(tiers),
    automaticEligibleCount,
    rootExternalCategoryId: input.context.rootExternalCategoryId,
    sourceVersion: input.context.sourceVersion,
    classificationVersion: input.context.expectedClassificationVersion,
    configVersion: input.context.configVersion,
  });
  return Object.freeze({
    context: Object.freeze({ ...input.context }),
    categories: Object.freeze(categories),
    mappings: Object.freeze(mappings),
    summary,
  });
}
