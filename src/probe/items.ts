import { MeliClient, MeliApiError } from "../meli/client.js";
import { assertMlbId } from "../meli/endpoints.js";
import type { ItemDetail } from "../meli/types.js";
import type { SanitizedSearchItem } from "./search.js";

export interface ItemProbeResult {
  status: "PASS" | "PARTIAL" | "FAIL";
  details: ItemDetail[];
  errors: Array<{ itemId: string; httpStatus: number }>;
}

export interface MultigetProbeResult {
  status: "PASS" | "PARTIAL" | "FAIL";
  requested: number;
  returned: number;
  httpStatus: number;
  durationMs: number;
  approximateBytes: number;
  perItemCodes: number[];
}

function sanitizeItemDetail(item: ItemDetail): ItemDetail {
  const output: ItemDetail = { id: item.id };
  if (item.title !== undefined) output.title = item.title;
  if (item.status !== undefined) output.status = item.status;
  if (item.condition !== undefined) output.condition = item.condition;
  if (item.category_id !== undefined) output.category_id = item.category_id;
  if (item.seller_id !== undefined) output.seller_id = item.seller_id;
  if (item.catalog_product_id !== undefined) output.catalog_product_id = item.catalog_product_id;
  if (item.permalink !== undefined) output.permalink = item.permalink;
  if (item.currency_id !== undefined) output.currency_id = item.currency_id;
  if (item.shipping?.free_shipping !== undefined) output.shipping = { free_shipping: item.shipping.free_shipping };
  if (item.available_quantity !== undefined) output.available_quantity = item.available_quantity;
  if (item.sold_quantity !== undefined) output.sold_quantity = item.sold_quantity;
  return output;
}

export async function probeItems(client: MeliClient, candidates: SanitizedSearchItem[]): Promise<ItemProbeResult> {
  const details: ItemDetail[] = [];
  const errors: ItemProbeResult["errors"] = [];
  for (const candidate of candidates.slice(0, 5)) {
    try {
      const id = assertMlbId(candidate.item_id, "item");
      const response = await client.get<ItemDetail>(`/items/${id}`);
      if (response.data) details.push(sanitizeItemDetail(response.data));
    } catch (error) {
      errors.push({ itemId: candidate.item_id, httpStatus: error instanceof MeliApiError ? error.status : 0 });
    }
  }
  return { status: details.length >= 5 ? "PASS" : details.length > 0 ? "PARTIAL" : "FAIL", details, errors };
}

export async function probeMultiget(client: MeliClient, items: ItemDetail[]): Promise<MultigetProbeResult> {
  const ids = items.slice(0, 20).map((item) => assertMlbId(item.id, "item"));
  if (ids.length === 0) {
    return { status: "FAIL", requested: 0, returned: 0, httpStatus: 0, durationMs: 0, approximateBytes: 0, perItemCodes: [] };
  }
  const attributes = "id,title,status,condition,category_id,seller_id,catalog_product_id,permalink,currency_id,shipping";
  const response = await client.get<Array<{ code?: number; body?: ItemDetail }>>(
    `/items?ids=${ids.join(",")}&attributes=${attributes}`,
  );
  const rows = response.data ?? [];
  const returned = rows.filter((row) => row.body?.id).length;
  return {
    status: returned === ids.length ? "PASS" : returned > 0 ? "PARTIAL" : "FAIL",
    requested: ids.length,
    returned,
    httpStatus: response.status,
    durationMs: response.durationMs,
    approximateBytes: response.approximateBytes,
    perItemCodes: rows.map((row) => row.code ?? 0),
  };
}

export function isThirdPartyItem(item: Pick<ItemDetail, "seller_id">, authenticatedUserId: number): boolean {
  return typeof item.seller_id === "number" && item.seller_id !== authenticatedUserId;
}
