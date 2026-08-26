export const COMMERCE_DISCOVERY_RUN_CONTRACT = "commerce-discovery-run/v1" as const;
export const MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT = "marketplace-discovery-adapter/v1" as const;
export const MELI_HIGHLIGHTS_CATEGORY_V1 = "MELI_HIGHLIGHTS_CATEGORY_V1" as const;

export type DiscoveryPriorityTier = "A" | "B";
export type DiscoveryHighlightType = "PRODUCT" | "ITEM" | "USER_PRODUCT";
export type DiscoveryRunMode = "SMOKE" | "FULL_SWEEP";
export type DiscoveryCategoryStatus = "SUCCESS" | "EMPTY" | "FAILED" | "NOT_ATTEMPTED";

export type DiscoveryErrorCode =
  | "DISCOVERY_INVALID_ARGUMENTS"
  | "DISCOVERY_LIVE_NOT_ENABLED"
  | "DISCOVERY_PERSISTENCE_NOT_ENABLED"
  | "DISCOVERY_REGISTRY_READ_FAILED"
  | "DISCOVERY_REGISTRY_RESPONSE_INVALID"
  | "DISCOVERY_REGISTRY_ELIGIBILITY_MISMATCH"
  | "DISCOVERY_PLAN_INVALID"
  | "DISCOVERY_ADAPTER_SCHEMA_INVALID"
  | "DISCOVERY_ADAPTER_CONTRACT_DRIFT"
  | "DISCOVERY_AUTH_FATAL"
  | "DISCOVERY_CATEGORY_FAILED"
  | "DISCOVERY_CATEGORY_TRANSPORT_FAILED"
  | "DISCOVERY_RATE_LIMIT_STOP"
  | "DISCOVERY_GLOBAL_TRANSPORT_STOP";

export class DiscoveryError extends Error {
  constructor(
    readonly code: DiscoveryErrorCode,
    message: string,
    readonly details: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

export interface DiscoveryEligibleCategory {
  readonly marketplaceCategoryId: string;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly externalCategoryId: string;
  readonly priorityTier: DiscoveryPriorityTier;
  readonly manualOverride: boolean;
  readonly decisionSource: "AUTO" | "MANUAL";
  readonly classificationVersion: string;
  readonly sourceVersion: string | null;
  readonly categoryConfigVersion: string;
  readonly marketplaceConfigVersion: string;
  readonly verticalConfigVersion: string;
}

export interface DiscoveryRunConfig {
  readonly configVersion: string;
  readonly adapterVersion: string;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly expectedEligibleCategories: number;
  readonly smokeCategoriesPerTier: number;
  readonly concurrency: number;
  readonly candidateTypes: readonly DiscoveryHighlightType[];
  readonly knownOccurrenceTypes: readonly DiscoveryHighlightType[];
}

export interface DiscoveryRunPlan {
  readonly contractVersion: typeof COMMERCE_DISCOVERY_RUN_CONTRACT;
  readonly mode: DiscoveryRunMode;
  readonly config: DiscoveryRunConfig;
  readonly eligibleCategories: readonly DiscoveryEligibleCategory[];
  readonly selectedCategories: readonly DiscoveryEligibleCategory[];
  readonly registryDigest: string;
}

export interface DiscoveryOccurrence {
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly marketplaceCategoryId: string;
  readonly externalCategoryId: string;
  readonly priorityTier: DiscoveryPriorityTier;
  readonly highlightType: DiscoveryHighlightType;
  readonly externalId: string;
  readonly position: number | null;
  readonly observedAt: string;
  readonly sourceContract: typeof MELI_HIGHLIGHTS_CATEGORY_V1;
}

export interface DiscoveryCandidate {
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly highlightType: "PRODUCT";
  readonly externalId: string;
  readonly eligibleForNormalization: true;
  readonly occurrences: readonly DiscoveryOccurrence[];
}

export interface MarketplaceCategoryDiscoveryResult {
  readonly contractVersion: typeof MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT;
  readonly category: DiscoveryEligibleCategory;
  readonly occurrences: readonly DiscoveryOccurrence[];
  readonly rawHighlights: number;
  readonly productHighlights: number;
  readonly itemHighlights: number;
  readonly userProductHighlights: number;
  readonly unsupportedHighlights: number;
  readonly requestCount: number;
  readonly retryCount: number;
  readonly durationMs: number;
}

export interface MarketplaceDiscoveryAdapter {
  discoverCategory(category: DiscoveryEligibleCategory): Promise<MarketplaceCategoryDiscoveryResult>;
}

export interface DiscoveryCategoryOutcome {
  readonly category: DiscoveryEligibleCategory;
  readonly status: DiscoveryCategoryStatus;
  readonly errorCode: DiscoveryErrorCode | null;
  readonly occurrences: readonly DiscoveryOccurrence[];
  readonly rawHighlights: number;
  readonly requestCount: number;
  readonly retryCount: number;
  readonly durationMs: number;
}

export interface DiscoveryRunMetrics {
  readonly eligibleCategories: number;
  readonly selectedCategories: number;
  readonly attemptedCategories: number;
  readonly successfulCategories: number;
  readonly failedCategories: number;
  readonly emptyCategories: number;
  readonly notAttemptedCategories: number;
  readonly apiRequests: number;
  readonly retryCount: number;
  readonly rawHighlights: number;
  readonly productHighlights: number;
  readonly itemHighlights: number;
  readonly userProductHighlights: number;
  readonly unsupportedHighlights: number;
  readonly acceptedCandidates: number;
  readonly uniqueCandidates: number;
  readonly duplicateOccurrences: number;
  readonly rateLimited: boolean;
  readonly registryReadMs: number;
  readonly planningMs: number;
  readonly apiMs: number;
  readonly dedupMs: number;
  readonly persistenceMs: 0;
  readonly totalMs: number;
}

export interface DiscoveryRunResult {
  readonly contractVersion: typeof COMMERCE_DISCOVERY_RUN_CONTRACT;
  readonly mode: DiscoveryRunMode;
  readonly persistenceMode: "DRY_RUN";
  readonly registryDigest: string;
  readonly outcomes: readonly DiscoveryCategoryOutcome[];
  readonly occurrences: readonly DiscoveryOccurrence[];
  readonly candidates: readonly DiscoveryCandidate[];
  readonly metrics: DiscoveryRunMetrics;
  readonly fatalErrorCode: DiscoveryErrorCode | null;
}
