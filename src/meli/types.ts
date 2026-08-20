export interface MeliCategorySummary {
  id: string;
  name: string;
}

export interface MeliCategory extends MeliCategorySummary {
  children_categories?: MeliCategorySummary[];
  path_from_root?: MeliCategorySummary[];
}

export interface SearchItem {
  id: string;
  title?: string;
  seller?: { id?: number };
  seller_id?: number;
  category_id?: string;
  condition?: string;
  permalink?: string;
  catalog_product_id?: string | null;
  shipping?: { free_shipping?: boolean };
  price?: number;
}

export interface SearchResponse {
  paging?: { total?: number; limit?: number; offset?: number };
  results?: SearchItem[];
}

export interface ItemDetail {
  id: string;
  title?: string;
  price?: number;
  status?: string;
  condition?: string;
  category_id?: string;
  seller_id?: number;
  catalog_product_id?: string | null;
  permalink?: string;
  currency_id?: string;
  shipping?: { free_shipping?: boolean };
  available_quantity?: number;
  sold_quantity?: number;
  user_product_id?: string | null;
}

export interface UserDetail {
  id: number;
  nickname?: string;
  site_id?: string;
  country_id?: string;
  seller_reputation?: {
    level_id?: string | null;
    power_seller_status?: string | null;
    transactions?: {
      completed?: number;
      ratings?: Record<string, number>;
    };
  };
}

export interface SalePriceResponse {
  amount?: number | null;
  regular_amount?: number | null;
  currency_id?: string;
  reference_date?: string;
  metadata?: unknown;
}

export interface UserProductDetail {
  id: string;
  name?: string;
  family_name?: string | null;
  family_id?: number | string | null;
  user_id?: number | string;
  domain_id?: string;
  attributes?: unknown[];
}

export interface UserProductItemsSearchResponse {
  seller_id?: number | string;
  results?: string[];
  paging?: { total?: number; limit?: number; offset?: number };
}

export interface PricesResponse {
  id?: string;
  prices?: Array<{
    type?: string;
    amount?: number | null;
    regular_amount?: number | null;
    last_updated?: string;
    conditions?: { start_time?: string | null; end_time?: string | null };
    start_time?: string | null;
    end_time?: string | null;
  }>;
}
