import { TaxonomyError } from "../../../taxonomy/errors.js";
import type { TaxonomyTree } from "../../../taxonomy/tree.js";
import type { AutomotiveCategoryRule, AutomotiveClassifierRules } from "./types.js";
import {
  AUTOMOTIVE_CLASSIFICATION_VERSION,
  AUTOMOTIVE_ROOT_CATEGORY_ID,
  AutomotiveClassifierError,
} from "./types.js";

const ID_PATTERN = /^MLB\d+$/;
const KEY_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const VALID_SCOPES = new Set(["ALLOWED", "REVIEW", "EXCLUDED", "UNKNOWN"]);
const VALID_TIERS = new Set(["A", "B", "C"]);

function invalid(reason: string): never {
  throw new AutomotiveClassifierError(
    "AUTOMOTIVE_CLASSIFIER_RULESET_INVALID",
    `Ruleset automotivo inválido: ${reason}`,
  );
}

function assertRuleDecision(rule: AutomotiveCategoryRule): void {
  if (!ID_PATTERN.test(rule.categoryId)) invalid("CATEGORY_ID");
  if (rule.ruleId.trim().length === 0) invalid("RULE_ID");
  if (!VALID_SCOPES.has(rule.scopeStatus)) invalid("SCOPE_STATUS");
  if (rule.priorityTier !== null && !VALID_TIERS.has(rule.priorityTier)) invalid("PRIORITY_TIER");
  if (rule.scopeStatus === "ALLOWED") {
    if (rule.priorityTier === null) invalid("ALLOWED_WITHOUT_TIER");
  } else if (rule.priorityTier !== null) {
    invalid("NON_ALLOWED_WITH_TIER");
  }
  if (rule.familyKey !== null && !KEY_PATTERN.test(rule.familyKey)) invalid("FAMILY_KEY");
  if (rule.commercialFamilyKeyDefault !== null
    && !KEY_PATTERN.test(rule.commercialFamilyKeyDefault)) invalid("COMMERCIAL_FAMILY_KEY");
  if (rule.scopeStatus !== "ALLOWED"
    && (rule.familyKey !== null || rule.commercialFamilyKeyDefault !== null)) {
    invalid("NON_ALLOWED_WITH_FAMILY");
  }
}

function requireRuleNode(tree: TaxonomyTree, categoryId: string): void {
  try {
    tree.getNode(categoryId);
  } catch (error) {
    if (error instanceof TaxonomyError && error.code === "TAXONOMY_NODE_NOT_FOUND") invalid("CATEGORY_NOT_FOUND");
    throw error;
  }
}

export function validateAutomotiveClassifierRules(
  rules: AutomotiveClassifierRules,
  tree: TaxonomyTree,
): void {
  if (rules.classificationVersion !== AUTOMOTIVE_CLASSIFICATION_VERSION) invalid("VERSION");
  if (rules.marketplaceKey !== "MERCADO_LIVRE" || rules.siteId !== "MLB") invalid("CONTEXT");
  if (rules.rootCategoryId !== AUTOMOTIVE_ROOT_CATEGORY_ID) invalid("ROOT");
  requireRuleNode(tree, rules.rootCategoryId);
  const root = tree.getNode(rules.rootCategoryId);
  if (root.marketplaceKey !== rules.marketplaceKey || root.siteId !== rules.siteId) invalid("TREE_CONTEXT");

  const exactIds = new Set<string>();
  const ancestorIds = new Set<string>();
  const ruleIds = new Set<string>();
  for (const [kind, collection] of [
    ["EXACT", rules.exactRules],
    ["ANCESTOR", rules.ancestorRules],
  ] as const) {
    const categoryIds = kind === "EXACT" ? exactIds : ancestorIds;
    for (const rule of collection) {
      assertRuleDecision(rule);
      if (categoryIds.has(rule.categoryId)) invalid(`DUPLICATE_${kind}_CATEGORY`);
      if (ruleIds.has(rule.ruleId)) invalid("DUPLICATE_RULE_ID");
      categoryIds.add(rule.categoryId);
      ruleIds.add(rule.ruleId);
      requireRuleNode(tree, rule.categoryId);
      if (!tree.isDescendantOrSelf(rule.categoryId, rules.rootCategoryId)) invalid("RULE_OUTSIDE_ROOT");
    }
  }

  const excludedAncestors = rules.ancestorRules.filter((rule) => rule.scopeStatus === "EXCLUDED");
  for (const rule of rules.exactRules) {
    if (rule.scopeStatus !== "ALLOWED") continue;
    const excludedParent = excludedAncestors.find((candidate) =>
      tree.isDescendantOrSelf(rule.categoryId, candidate.categoryId));
    if (excludedParent && rule.allowsExcludedAncestorOverride !== true) {
      invalid("ALLOWED_UNDER_EXCLUDED_ANCESTOR");
    }
  }
}
