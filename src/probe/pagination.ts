import { MeliClient, MeliApiError } from "../meli/client";
import { assertMlbId } from "../meli/endpoints";
import type { MeliCategorySummary, SearchResponse } from "../meli/types";

export interface PaginationPage {
  requestedOffset: number;
  httpStatus: number;
  total?: number;
  limit?: number;
  offset?: number;
  returned: number;
}

export async function probePagination(client: MeliClient, category: MeliCategorySummary | undefined): Promise<PaginationPage[]> {
  if (!category) return [];
  const id = assertMlbId(category.id, "category");
  const pages: PaginationPage[] = [];
  const limit = 10;
  for (const requestedOffset of [0, 10, 20]) {
    try {
      const response = await client.get<SearchResponse>(`/sites/MLB/search?category=${id}&limit=${limit}&offset=${requestedOffset}`);
      const page: PaginationPage = { requestedOffset, httpStatus: response.status, returned: response.data?.results?.length ?? 0 };
      if (response.data?.paging?.total !== undefined) page.total = response.data.paging.total;
      if (response.data?.paging?.limit !== undefined) page.limit = response.data.paging.limit;
      if (response.data?.paging?.offset !== undefined) page.offset = response.data.paging.offset;
      pages.push(page);
    } catch (error) {
      pages.push({ requestedOffset, httpStatus: error instanceof MeliApiError ? error.status : 0, returned: 0 });
      break;
    }
  }
  return pages;
}
