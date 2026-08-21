export const MARKETPLACE_MERCADO_LIVRE = "MERCADO_LIVRE" as const;
export type MarketplaceKey = string;

export type TaxonomyTopLevelKind = "ARRAY" | "OBJECT" | "STRING" | "NUMBER" | "BOOLEAN" | "NULL" | "OTHER";

export interface TaxonomyResponseDiagnostics {
  status: number | null;
  operation: string | null;
  contentType: string | null;
  contentEncoding: string | null;
  contentLength: number | null;
  transportBytes: number | null;
  processedBytes: number | null;
  bodyHadGzipMagic: boolean | null;
  topLevelKind: TaxonomyTopLevelKind | null;
  topLevelArrayLength: number | null;
  topLevelObjectKeyCount: number | null;
}

export interface SiteCategory {
  externalCategoryId: string;
  name: string;
}

export interface CategoryDetail extends SiteCategory {
  childrenExternalCategoryIds: readonly string[];
  pathExternalCategoryIds: readonly string[];
  pathNames: readonly string[];
}

export interface TaxonomyCategoryNode extends CategoryDetail {
  marketplaceKey: MarketplaceKey;
  siteId: string;
  parentExternalCategoryId: string | null;
  isLeaf: boolean;
}

export interface TaxonomySourceMetadata {
  sourceVersion: string;
  sourceContentCreated: string | null;
  sourceContentMd5: string | null;
  internalChecksum: string;
  fetchedAt: string;
}

export interface TaxonomyTreeEnvelope extends TaxonomySourceMetadata {
  marketplaceKey: MarketplaceKey;
  siteId: string;
  nodes: readonly TaxonomyCategoryNode[];
  responseDiagnostics: Readonly<TaxonomyResponseDiagnostics>;
}

export interface MarketplaceTaxonomyAdapter {
  listSiteCategories(siteId: string): Promise<readonly SiteCategory[]>;
  fetchCategory(categoryId: string): Promise<CategoryDetail>;
  fetchCategoryTree(siteId: string): Promise<TaxonomyTreeEnvelope>;
}
