import { MeliClient, MeliApiError } from "../meli/client.js";
import { assertMlbId } from "../meli/endpoints.js";
import type { MeliCategorySummary } from "../meli/types.js";

export interface HighlightRow {
  id?: string;
  type?: string;
  position?: number;
}

export interface HighlightCategoryResult {
  categoryId: string;
  httpStatus: number;
  content: HighlightRow[];
}

export async function probeHighlights(client: MeliClient, categories: MeliCategorySummary[]): Promise<HighlightCategoryResult[]> {
  const output: HighlightCategoryResult[] = [];
  for (const category of categories.slice(0, 3)) {
    try {
      const id = assertMlbId(category.id, "category");
      const response = await client.get<{ content?: HighlightRow[] }>(`/highlights/MLB/category/${id}`);
      output.push({ categoryId: id, httpStatus: response.status, content: response.data?.content ?? [] });
    } catch (error) {
      output.push({ categoryId: category.id, httpStatus: error instanceof MeliApiError ? error.status : 0, content: [] });
    }
  }
  return output;
}
