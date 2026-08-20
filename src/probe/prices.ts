import { MeliClient, MeliApiError } from "../meli/client.js";
import { assertMlbId } from "../meli/endpoints.js";
import type { ItemDetail, PricesResponse, SalePriceResponse } from "../meli/types.js";
import { Availability, classifyAvailability } from "../report/availability.js";

export interface NormalizedSalePrice {
  amount: number | null;
  regular_amount: number | null;
  currency_id: string | null;
  reference_date: string | null;
  metadata_shape: string[];
  promotion_type: string | null;
}

export interface NormalizedPrice {
  type: string;
  amount: number | null;
  regular_amount: number | null;
  start_time: string | null;
  end_time: string | null;
  last_updated: string | null;
}

export interface PerItemPriceProbe {
  itemId: string;
  salePrice: { httpStatus: number; availability: Availability; data: NormalizedSalePrice | null };
  prices: { httpStatus: number; availability: Availability; data: NormalizedPrice[] };
}

export function normalizeSalePrice(value: SalePriceResponse): NormalizedSalePrice {
  const metadata = value.metadata && typeof value.metadata === "object" ? (value.metadata as Record<string, unknown>) : null;
  return {
    amount: typeof value.amount === "number" ? value.amount : null,
    regular_amount: typeof value.regular_amount === "number" ? value.regular_amount : null,
    currency_id: typeof value.currency_id === "string" ? value.currency_id : null,
    reference_date: typeof value.reference_date === "string" ? value.reference_date : null,
    metadata_shape: metadata ? Object.keys(metadata).sort() : [],
    promotion_type: typeof metadata?.promotion_type === "string" ? metadata.promotion_type : null,
  };
}

export function normalizePrices(value: PricesResponse): NormalizedPrice[] {
  return (value.prices ?? []).map((price) => ({
    type: price.type ?? "unknown",
    amount: typeof price.amount === "number" ? price.amount : null,
    regular_amount: typeof price.regular_amount === "number" ? price.regular_amount : null,
    start_time: price.conditions?.start_time ?? price.start_time ?? null,
    end_time: price.conditions?.end_time ?? price.end_time ?? null,
    last_updated: price.last_updated ?? null,
  }));
}

async function capture<T>(work: () => Promise<{ status: number; data: T | null }>): Promise<{ status: number; data: T | null }> {
  try {
    return await work();
  } catch (error) {
    return { status: error instanceof MeliApiError ? error.status : 0, data: null };
  }
}

export async function probePrices(client: MeliClient, items: ItemDetail[]): Promise<PerItemPriceProbe[]> {
  const results: PerItemPriceProbe[] = [];
  for (const item of items.slice(0, 5)) {
    const id = assertMlbId(item.id, "item");
    const sale = await capture(() => client.get<SalePriceResponse>(`/items/${id}/sale_price`));
    const normalizedSale = sale.data ? normalizeSalePrice(sale.data) : null;
    const prices = client.encounteredRateLimit
      ? { status: 429, data: null }
      : await capture(() => client.get<PricesResponse>(`/items/${id}/prices`));
    const normalizedPrices = prices.data ? normalizePrices(prices.data) : [];
    results.push({
      itemId: id,
      salePrice: {
        httpStatus: sale.status,
        availability: classifyAvailability(sale.status, normalizedSale?.amount !== null && normalizedSale !== null, normalizedSale?.regular_amount !== null),
        data: normalizedSale,
      },
      prices: {
        httpStatus: prices.status,
        availability: classifyAvailability(prices.status, normalizedPrices.length > 0, normalizedPrices.every((price) => price.amount !== null)),
        data: normalizedPrices,
      },
    });
    if (client.encounteredRateLimit) break;
  }
  return results;
}
