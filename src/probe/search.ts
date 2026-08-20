import { MeliClient, MeliApiError } from "../meli/client.js";
import { assertMlbId } from "../meli/endpoints.js";
import type { MeliCategorySummary, SearchItem, SearchResponse } from "../meli/types.js";

export interface SanitizedSearchItem {
  item_id: string;
  title?: string;
  seller_id?: number;
  category_id?: string;
  condition?: string;
  permalink?: string;
  catalog_product_id?: string | null;
  free_shipping?: boolean;
  search_price?: number;
}

export interface SearchProbeResult {
  status: "PASS" | "PARTIAL" | "FAIL";
  categoriesTested: number;
  candidates: SanitizedSearchItem[];
  thirdParty: SanitizedSearchItem[];
  errors: Array<{ categoryId: string; httpStatus: number; message: string }>;
}

function sellerId(item: SearchItem): number | undefined {
  return item.seller?.id ?? item.seller_id;
}

function sanitize(item: SearchItem): SanitizedSearchItem {
  const result: SanitizedSearchItem = { item_id: item.id };
  if (item.title !== undefined) result.title = item.title;
  const seller = sellerId(item);
  if (seller !== undefined) result.seller_id = seller;
  if (item.category_id !== undefined) result.category_id = item.category_id;
  if (item.condition !== undefined) result.condition = item.condition;
  if (item.permalink !== undefined) result.permalink = item.permalink;
  if (item.catalog_product_id !== undefined) result.catalog_product_id = item.catalog_product_id;
  if (item.shipping?.free_shipping !== undefined) result.free_shipping = item.shipping.free_shipping;
  if (item.price !== undefined) result.search_price = item.price;
  return result;
}

export async function probeSearch(
  client: MeliClient,
  leaves: MeliCategorySummary[],
  authenticatedUserId: number,
): Promise<SearchProbeResult> {
  const candidates: SanitizedSearchItem[] = [];
  const errors: SearchProbeResult["errors"] = [];
  const selected = leaves.slice(0, 3);
  for (const category of selected) {
    try {
      const id = assertMlbId(category.id, "category");
      const response = await client.get<SearchResponse>(`/sites/MLB/search?category=${id}&limit=10&offset=0`);
      candidates.push(...(response.data?.results ?? []).slice(0, 10).map(sanitize));
    } catch (error) {
      errors.push({
        categoryId: category.id,
        httpStatus: error instanceof MeliApiError ? error.status : 0,
        message: error instanceof Error ? error.message : "Falha desconhecida",
      });
    }
  }
  const thirdParty = candidates.filter((item) => item.seller_id !== undefined && item.seller_id !== authenticatedUserId);
  return {
    status: thirdParty.length >= 5 ? "PASS" : thirdParty.length > 0 ? "PARTIAL" : "FAIL",
    categoriesTested: selected.length,
    candidates,
    thirdParty,
    errors,
  };
}
