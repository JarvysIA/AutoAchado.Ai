/**
 * Persistence boundary for BUILD 0B1. Monetary values cross this boundary as
 * decimal strings to avoid binary floating-point rounding before PostgreSQL.
 * No database client is initialized by these contracts.
 */
export type DecimalString = string;
export type IsoTimestamp = string;
export type IsoDate = string;
export type JsonObject = Readonly<Record<string, unknown>>;

export type ScanStatus = 'PENDING' | 'RUNNING' | 'PARTIAL' | 'COMPLETED' | 'FAILED';
export type CategoryPriority = 'A' | 'B' | 'C' | 'EXCLUDED';
export type CategoryScope = 'ALLOWED' | 'REVIEW' | 'EXCLUDED' | 'UNKNOWN';
export type CategoryDecisionSource = 'AUTO' | 'MANUAL';
export type HighlightType = 'PRODUCT' | 'ITEM' | 'USER_PRODUCT';

export interface MarketplaceRecord {
  marketplaceKey: string;
  name: string;
  active: boolean;
  configVersion: string;
}

export interface CommerceVerticalRecord {
  verticalKey: string;
  name: string;
  description: string | null;
  active: boolean;
  configVersion: string;
}

export interface MarketplaceCategoryRecord {
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
  firstSeenAt: IsoTimestamp;
  lastSeenAt: IsoTimestamp;
  sourceCheckedAt: IsoTimestamp;
  configVersion: string;
}

export interface VerticalCategoryMappingRecord {
  verticalKey: string;
  marketplaceCategoryId: string;
  scopeStatus: CategoryScope;
  priorityTier: CategoryPriority;
  familyKey: string | null;
  commercialFamilyKeyDefault: string | null;
  classificationRule: string | null;
  classificationVersion: string;
  manualOverride: boolean;
  decisionSource: CategoryDecisionSource;
  decisionReason: string | null;
  decidedAt: IsoTimestamp | null;
  active: boolean;
}

export interface AutomotiveCategoryRecord {
  categoryId: string;
  marketplaceCategoryId: string | null;
  parentId: string | null;
  name: string;
  path: readonly string[];
  familyKey: string | null;
  commercialFamilyKey: string | null;
  priorityTier: CategoryPriority;
  scopeStatus: CategoryScope;
  isLeaf: boolean;
  manualOverride: boolean | null;
  active: boolean;
  configVersion: string;
  checkedAt: IsoTimestamp | null;
}

export interface CatalogProductRecord {
  productId: string;
  categoryId: string | null;
  domainId: string | null;
  name: string;
  familyName: string | null;
  commercialFamilyKey: string | null;
  status: string | null;
  firstSeenAt: IsoTimestamp;
  lastSeenAt: IsoTimestamp;
  metadataCheckedAt: IsoTimestamp | null;
  active: boolean;
  configVersion: string;
}

export interface SellerProfileRecord {
  sellerId: string;
  nickname: string | null;
  levelId: string | null;
  powerSellerStatus: string | null;
  status: string | null;
  transactionsCompleted: string | null;
  checkedAt: IsoTimestamp;
  expiresAt: IsoTimestamp | null;
}

export interface MarketplaceOfferRecord {
  itemId: string;
  productId: string;
  sellerId: string;
  categoryId: string | null;
  title: string | null;
  status: string | null;
  price: DecimalString | null;
  originalPrice: DecimalString | null;
  currencyId: string | null;
  condition: string | null;
  eligible: boolean;
  eligibilityReason: string | null;
  permalink: string | null;
  observedAt: IsoTimestamp;
  active: boolean;
}

export interface ScanRunIdentity {
  scheduledBucket: IsoTimestamp;
  jobType: string;
  shardKey: string;
}

export interface ScanRunRecord extends ScanRunIdentity {
  runId: string;
  status: ScanStatus;
  configVersion: string;
  startedAt: IsoTimestamp | null;
  finishedAt: IsoTimestamp | null;
  cursor: JsonObject;
  requestCount: number;
  errorCounts: Readonly<Record<string, number>>;
  rateLimited: boolean;
  leaseExpiresAt: IsoTimestamp | null;
}

export interface HighlightSnapshotRecord {
  runId: string;
  categoryId: string;
  productId: string;
  observedAt: IsoTimestamp;
  observedBucket: IsoTimestamp;
  position: number | null;
  type: HighlightType;
}

export interface PriceSnapshotRecord {
  runId: string;
  productId: string;
  itemId: string | null;
  sellerId: string | null;
  observedAt: IsoTimestamp;
  observedBucket: IsoTimestamp;
  bestEligiblePrice: DecimalString | null;
  secondBestPrice: DecimalString | null;
  eligiblePriceMedian: DecimalString | null;
  eligibleOfferCount: number;
  originalPrice: DecimalString | null;
  currencyId: string | null;
  condition: string | null;
  highlightPosition: number | null;
  sellerLevelId: string | null;
  eligible: boolean;
  anomalyCode: string | null;
  selectionReason: string | null;
}

export interface DailyProductStatsRecord {
  productId: string;
  statDate: IsoDate;
  dailyBestEligiblePrice: DecimalString | null;
  dailyHighPrice: DecimalString | null;
  observationCount: number;
  eligibleOfferCount: number;
  medianOfferPrice: DecimalString | null;
  highlightBestPosition: number | null;
  highlightPresence: boolean;
}

export interface OpportunityCandidateRecord {
  productId: string;
  itemId: string | null;
  candidateDate: IsoDate;
  currentPrice: DecimalString;
  referencePrice: DecimalString | null;
  realDiscountPercent: DecimalString | null;
  absoluteSaving: DecimalString | null;
  historicalDiscountScore: DecimalString;
  demandScore: DecimalString;
  sellabilityScore: DecimalString;
  universalAppealScore: DecimalString;
  sellerQualityScore: DecimalString;
  priceAttractivenessScore: DecimalString;
  historyConfidenceScore: DecimalString;
  specificityPenalty: DecimalString;
  finalScore: DecimalString;
  scoreVersion: string;
  configVersion: string;
  reasonCodes: readonly string[];
  gateResults: Readonly<Record<string, boolean | number | string | null>>;
  shortlisted: boolean;
  reviewed: boolean;
  promotionCooldownUntil: IsoTimestamp | null;
  breakoutTrigger: boolean;
  breakoutReason: string | null;
  recycleReason: string | null;
}

export interface ScanRunRepository {
  createOrGet(identity: ScanRunIdentity, configVersion: string): Promise<ScanRunRecord>;
  checkpoint(runId: string, cursor: JsonObject, requestCount: number): Promise<void>;
  finish(runId: string, status: Exclude<ScanStatus, 'PENDING' | 'RUNNING'>): Promise<void>;
}

export interface ProductRepository {
  upsertCategories(records: readonly AutomotiveCategoryRecord[]): Promise<void>;
  upsertProducts(records: readonly CatalogProductRecord[]): Promise<void>;
  findProduct(productId: string): Promise<CatalogProductRecord | null>;
}

export interface SellerRepository {
  upsertProfiles(records: readonly SellerProfileRecord[]): Promise<void>;
  findFreshProfile(sellerId: string, checkedAfter: IsoTimestamp): Promise<SellerProfileRecord | null>;
}

export interface OfferRepository {
  upsertOffers(records: readonly MarketplaceOfferRecord[]): Promise<void>;
  markUnseenInactive(productId: string, seenItemIds: readonly string[], observedAt: IsoTimestamp): Promise<void>;
}

export interface SnapshotRepository {
  upsertHighlights(records: readonly HighlightSnapshotRecord[]): Promise<void>;
  upsertPrices(records: readonly PriceSnapshotRecord[]): Promise<void>;
  upsertDailyStats(records: readonly DailyProductStatsRecord[]): Promise<void>;
  upsertCandidates(records: readonly OpportunityCandidateRecord[]): Promise<void>;
}
