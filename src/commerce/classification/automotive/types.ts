export const AUTOMOTIVE_CLASSIFICATION_VERSION = "automotive-classifier/mlb/v1" as const;
export const AUTOMOTIVE_ROOT_CATEGORY_ID = "MLB5672" as const;

export type AutomotiveScopeStatus = "ALLOWED" | "REVIEW" | "EXCLUDED" | "UNKNOWN";
export type AutomotivePriorityTier = "A" | "B" | "C";

export type AutomotiveClassificationReason =
  | "OUTSIDE_ROOT"
  | "EXACT_OVERRIDE"
  | "ALLOWED_ANCESTOR"
  | "EXCLUDED_ANCESTOR"
  | "REVIEW_ANCESTOR"
  | "MVP_VEHICLE_SCOPE_EXCLUSION"
  | "SERVICE_CATEGORY"
  | "COMPLETE_VEHICLE_CATEGORY"
  | "LOW_BREADTH_MVP"
  | "RESIDUAL_REVIEW"
  | "MIXED_BRANCH_REVIEW"
  | "FALLBACK_UNKNOWN";

export interface AutomotiveRuleDecision {
  scopeStatus: AutomotiveScopeStatus;
  priorityTier: AutomotivePriorityTier | null;
  familyKey: string | null;
  commercialFamilyKeyDefault: string | null;
  reason: AutomotiveClassificationReason;
}

export interface AutomotiveCategoryRule extends AutomotiveRuleDecision {
  categoryId: string;
  ruleId: string;
  allowsExcludedAncestorOverride?: true;
}

export interface AutomotiveClassifierRules {
  classificationVersion: typeof AUTOMOTIVE_CLASSIFICATION_VERSION;
  marketplaceKey: "MERCADO_LIVRE";
  siteId: "MLB";
  rootCategoryId: typeof AUTOMOTIVE_ROOT_CATEGORY_ID;
  exactRules: readonly AutomotiveCategoryRule[];
  ancestorRules: readonly AutomotiveCategoryRule[];
}

export interface AutomotiveCategoryClassification extends AutomotiveRuleDecision {
  verticalKey: "AUTOMOTIVE";
  marketplaceKey: "MERCADO_LIVRE";
  siteId: "MLB";
  categoryId: string;
  insideRoot: boolean;
  ruleId: string;
  matchedCategoryId: string | null;
  matchedAncestorId: string | null;
  classificationVersion: typeof AUTOMOTIVE_CLASSIFICATION_VERSION;
}

export type AutomotiveClassifierErrorCode =
  | "AUTOMOTIVE_CLASSIFIER_CONTEXT_INVALID"
  | "AUTOMOTIVE_CLASSIFIER_NODE_NOT_FOUND"
  | "AUTOMOTIVE_CLASSIFIER_RULESET_INVALID";

export class AutomotiveClassifierError extends Error {
  constructor(readonly code: AutomotiveClassifierErrorCode, message: string) {
    super(message);
    this.name = "AutomotiveClassifierError";
  }
}
