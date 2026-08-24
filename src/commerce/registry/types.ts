import type {
  CategoryDecisionSource,
  CategoryScope,
  IsoTimestamp,
  RegistryCategoryPriorityTier,
} from "../../persistence/contracts.js";
import type { TaxonomyTree } from "../../taxonomy/tree.js";

export const COMMERCE_REGISTRY_SYNC_CONFIG_VERSION = "commerce-registry-sync/v1" as const;

export interface CommerceRegistrySyncContext {
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly rootExternalCategoryId: string;
  readonly sourceVersion: string;
  readonly expectedClassificationVersion: string;
  readonly configVersion: string;
  readonly checkedAt: IsoTimestamp;
}

export interface RegistryClassifierOutput {
  readonly externalCategoryId: string;
  readonly scopeStatus: CategoryScope;
  readonly priorityTier: RegistryCategoryPriorityTier | null;
  readonly familyKey: string | null;
  readonly commercialFamilyKeyDefault: string | null;
  readonly ruleId: string;
  readonly classificationVersion: string;
  readonly reason: string | null;
}

export type RegistryCategoryClassifier = (
  externalCategoryId: string,
  tree: TaxonomyTree,
) => RegistryClassifierOutput;

export interface BuildCommerceRegistrySyncPlanInput {
  readonly context: CommerceRegistrySyncContext;
  readonly taxonomyTree: TaxonomyTree;
  readonly classifyCategory: RegistryCategoryClassifier;
}

export interface DesiredMarketplaceCategory {
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly externalCategoryId: string;
  readonly parentExternalCategoryId: string | null;
  readonly name: string;
  readonly pathExternalIds: readonly string[];
  readonly pathNames: readonly string[];
  readonly isLeaf: boolean;
  readonly active: true;
  readonly sourceVersion: string;
  readonly configVersion: string;
  readonly checkedAt: IsoTimestamp;
}

export interface DesiredVerticalCategoryMapping {
  readonly verticalKey: string;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly externalCategoryId: string;
  readonly scopeStatus: CategoryScope;
  readonly priorityTier: RegistryCategoryPriorityTier | null;
  readonly familyKey: string | null;
  readonly commercialFamilyKeyDefault: string | null;
  readonly classificationRule: string;
  readonly classificationVersion: string;
  readonly manualOverride: false;
  readonly decisionSource: "AUTO";
  readonly decisionReason: string | null;
  readonly active: true;
}

export interface CommerceRegistryPlanSummary {
  readonly categoryCount: number;
  readonly mappingCount: number;
  readonly scope: Readonly<Record<Lowercase<CategoryScope>, number>>;
  readonly tiers: Readonly<Record<RegistryCategoryPriorityTier, number>>;
  readonly automaticEligibleCount: number;
  readonly rootExternalCategoryId: string;
  readonly sourceVersion: string;
  readonly classificationVersion: string;
  readonly configVersion: string;
}

export interface CommerceRegistrySyncPlan {
  readonly context: Readonly<CommerceRegistrySyncContext>;
  readonly categories: readonly Readonly<DesiredMarketplaceCategory>[];
  readonly mappings: readonly Readonly<DesiredVerticalCategoryMapping>[];
  readonly summary: Readonly<CommerceRegistryPlanSummary>;
}

export interface CurrentMarketplaceCategory {
  readonly marketplaceCategoryId?: string;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly externalCategoryId: string;
  readonly parentExternalCategoryId: string | null;
  readonly name: string;
  readonly pathExternalIds: readonly string[];
  readonly pathNames: readonly string[];
  readonly isLeaf: boolean;
  readonly active: boolean;
  readonly sourceVersion: string | null;
  readonly configVersion: string;
  readonly firstSeenAt?: IsoTimestamp;
  readonly lastSeenAt?: IsoTimestamp;
  readonly sourceCheckedAt?: IsoTimestamp;
}

export interface CurrentVerticalCategoryMapping {
  readonly marketplaceCategoryId?: string;
  readonly verticalKey: string;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly externalCategoryId: string;
  readonly scopeStatus: CategoryScope;
  readonly priorityTier: RegistryCategoryPriorityTier | null;
  readonly familyKey: string | null;
  readonly commercialFamilyKeyDefault: string | null;
  readonly classificationRule: string | null;
  readonly classificationVersion: string;
  readonly manualOverride: boolean;
  readonly decisionSource: CategoryDecisionSource;
  readonly decisionReason: string | null;
  readonly decidedAt: IsoTimestamp | null;
  readonly active: boolean;
}

export interface CurrentCommerceRegistryState {
  readonly categories: readonly CurrentMarketplaceCategory[];
  readonly mappings: readonly CurrentVerticalCategoryMapping[];
  /** Exact external IDs the future loader proved belong to this sync universe. */
  readonly controlledMappingExternalCategoryIds: readonly string[];
}

export type CategoryDiffKind = "INSERT" | "UPDATE" | "UNCHANGED" | "REACTIVATE";
export type MappingDiffKind =
  | "INSERT"
  | "UPDATE"
  | "UNCHANGED"
  | "REACTIVATE"
  | "INACTIVATE"
  | "MANUAL_OVERRIDE_SKIPPED";

export interface CategoryDiffOperation {
  readonly kind: CategoryDiffKind;
  readonly identityKey: string;
  readonly current: CurrentMarketplaceCategory | null;
  readonly desired: DesiredMarketplaceCategory;
}

export interface MappingDiffOperation {
  readonly kind: MappingDiffKind;
  readonly identityKey: string;
  readonly current: CurrentVerticalCategoryMapping | null;
  readonly desired: DesiredVerticalCategoryMapping | null;
  readonly decisionChanged: boolean;
}

export interface CommerceRegistryDiffSummary {
  readonly categories: Readonly<Record<Lowercase<CategoryDiffKind>, number>>;
  readonly mappings: Readonly<Record<Lowercase<MappingDiffKind>, number>>;
}

export interface CommerceRegistryStateDiff {
  readonly categories: readonly Readonly<CategoryDiffOperation>[];
  readonly mappings: readonly Readonly<MappingDiffOperation>[];
  readonly summary: Readonly<CommerceRegistryDiffSummary>;
}
