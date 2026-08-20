import { MeliClient, MeliApiError } from "../meli/client";
import { assertSellerId } from "../meli/endpoints";
import type { ItemDetail, UserDetail } from "../meli/types";

export interface SellerProbeRow {
  seller_id: number;
  http_status: number;
  nickname?: string;
  level_id?: string | null;
  power_seller_status?: string | null;
  transactions_completed?: number;
  ratings?: Record<string, number>;
}

export async function probeSellers(client: MeliClient, items: ItemDetail[]): Promise<SellerProbeRow[]> {
  const ids = [...new Set(items.flatMap((item) => (typeof item.seller_id === "number" ? [item.seller_id] : [])))].slice(0, 5);
  const rows: SellerProbeRow[] = [];
  for (const sellerId of ids) {
    try {
      const response = await client.get<UserDetail>(`/users/${assertSellerId(sellerId)}`);
      const data = response.data;
      const row: SellerProbeRow = { seller_id: sellerId, http_status: response.status };
      if (data?.nickname !== undefined) row.nickname = data.nickname;
      if (data?.seller_reputation?.level_id !== undefined) row.level_id = data.seller_reputation.level_id;
      if (data?.seller_reputation?.power_seller_status !== undefined) row.power_seller_status = data.seller_reputation.power_seller_status;
      if (data?.seller_reputation?.transactions?.completed !== undefined) row.transactions_completed = data.seller_reputation.transactions.completed;
      if (data?.seller_reputation?.transactions?.ratings !== undefined) row.ratings = data.seller_reputation.transactions.ratings;
      rows.push(row);
    } catch (error) {
      rows.push({ seller_id: sellerId, http_status: error instanceof MeliApiError ? error.status : 0 });
    }
  }
  return rows;
}
