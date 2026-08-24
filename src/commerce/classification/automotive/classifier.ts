import { TaxonomyError } from "../../../taxonomy/errors.js";
import type { TaxonomyTree } from "../../../taxonomy/tree.js";
import { AUTOMOTIVE_MLB_RULES_V1 } from "./rules.js";
import type {
  AutomotiveCategoryClassification,
  AutomotiveCategoryRule,
  AutomotiveClassifierRules,
} from "./types.js";
import { AutomotiveClassifierError } from "./types.js";

function readNodeOrThrow(tree: TaxonomyTree, categoryId: string): ReturnType<TaxonomyTree["getNode"]> {
  try {
    return tree.getNode(categoryId);
  } catch (error) {
    if (error instanceof TaxonomyError && error.code === "TAXONOMY_NODE_NOT_FOUND") {
      throw new AutomotiveClassifierError(
        "AUTOMOTIVE_CLASSIFIER_NODE_NOT_FOUND",
        "Categoria ausente da árvore de classificação",
      );
    }
    throw error;
  }
}

function resultFromRule(
  categoryId: string,
  rule: AutomotiveCategoryRule,
  rules: AutomotiveClassifierRules,
  matchedAs: "EXACT" | "ANCESTOR",
): AutomotiveCategoryClassification {
  return Object.freeze({
    verticalKey: "AUTOMOTIVE",
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    categoryId,
    insideRoot: true,
    scopeStatus: rule.scopeStatus,
    priorityTier: rule.priorityTier,
    familyKey: rule.familyKey,
    commercialFamilyKeyDefault: rule.commercialFamilyKeyDefault,
    ruleId: rule.ruleId,
    reason: rule.reason,
    matchedCategoryId: matchedAs === "EXACT" ? rule.categoryId : null,
    matchedAncestorId: matchedAs === "ANCESTOR" ? rule.categoryId : null,
    classificationVersion: rules.classificationVersion,
  });
}

export function classifyAutomotiveCategory(
  categoryId: string,
  tree: TaxonomyTree,
  rules: AutomotiveClassifierRules = AUTOMOTIVE_MLB_RULES_V1,
): AutomotiveCategoryClassification {
  const root = readNodeOrThrow(tree, rules.rootCategoryId);
  if (root.marketplaceKey !== rules.marketplaceKey || root.siteId !== rules.siteId) {
    throw new AutomotiveClassifierError(
      "AUTOMOTIVE_CLASSIFIER_CONTEXT_INVALID",
      "Contexto da árvore incompatível com o classificador automotivo",
    );
  }

  const node = readNodeOrThrow(tree, categoryId);
  const insideRoot = tree.isDescendantOrSelf(categoryId, rules.rootCategoryId);
  if (!insideRoot) {
    return Object.freeze({
      verticalKey: "AUTOMOTIVE",
      marketplaceKey: "MERCADO_LIVRE",
      siteId: "MLB",
      categoryId,
      insideRoot: false,
      scopeStatus: "EXCLUDED",
      priorityTier: null,
      familyKey: null,
      commercialFamilyKeyDefault: null,
      ruleId: "outside-root",
      reason: "OUTSIDE_ROOT",
      matchedCategoryId: null,
      matchedAncestorId: null,
      classificationVersion: rules.classificationVersion,
    });
  }

  if (node.marketplaceKey !== rules.marketplaceKey || node.siteId !== rules.siteId) {
    throw new AutomotiveClassifierError(
      "AUTOMOTIVE_CLASSIFIER_CONTEXT_INVALID",
      "Contexto da categoria incompatível com o classificador automotivo",
    );
  }

  const exact = rules.exactRules.find((rule) => rule.categoryId === categoryId);
  if (exact) return resultFromRule(categoryId, exact, rules, "EXACT");

  const ancestorIds = tree.getAncestors(categoryId)
    .map((ancestor) => ancestor.externalCategoryId)
    .reverse();
  for (const ancestorId of ancestorIds) {
    const ancestor = rules.ancestorRules.find((rule) => rule.categoryId === ancestorId);
    if (ancestor) return resultFromRule(categoryId, ancestor, rules, "ANCESTOR");
  }

  return Object.freeze({
    verticalKey: "AUTOMOTIVE",
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    categoryId,
    insideRoot: true,
    scopeStatus: "UNKNOWN",
    priorityTier: null,
    familyKey: null,
    commercialFamilyKeyDefault: null,
    ruleId: "fallback.unknown",
    reason: "FALLBACK_UNKNOWN",
    matchedCategoryId: null,
    matchedAncestorId: null,
    classificationVersion: rules.classificationVersion,
  });
}

export function isAutomaticAutomotiveDiscoveryEligible(
  result: AutomotiveCategoryClassification,
): boolean {
  return result.scopeStatus === "ALLOWED"
    && (result.priorityTier === "A" || result.priorityTier === "B");
}
