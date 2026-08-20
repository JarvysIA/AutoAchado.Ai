import { MeliClient } from "../meli/client";
import { assertMlbId } from "../meli/endpoints";
import type { MeliCategory, MeliCategorySummary } from "../meli/types";

export interface CategoriesProbeResult {
  status: "PASS" | "PARTIAL" | "FAIL";
  httpStatus: number;
  root: MeliCategorySummary | null;
  immediateChildren: MeliCategorySummary[];
  leaves: MeliCategorySummary[];
  dump: { httpStatus: number; headers: Record<string, string> } | null;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function findAutomotiveRoot(categories: MeliCategorySummary[]): MeliCategorySummary | null {
  const matches = categories.filter((category) => {
    const name = normalize(category.name);
    return name.includes("veiculo") || name.includes("automot") || name.includes("autopart");
  });
  return matches.find((category) => category.id === "MLB5672") ?? matches[0] ?? null;
}

export async function probeCategories(client: MeliClient): Promise<CategoriesProbeResult> {
  const listResponse = await client.get<MeliCategorySummary[]>("/sites/MLB/categories");
  const categories = listResponse.data ?? [];
  const root = findAutomotiveRoot(categories);
  if (!root) {
    return { status: "FAIL", httpStatus: listResponse.status, root: null, immediateChildren: [], leaves: [], dump: null };
  }

  const rootDetail = await client.get<MeliCategory>(`/categories/${assertMlbId(root.id, "category")}`);
  const immediateChildren = rootDetail.data?.children_categories ?? [];
  const leaves: MeliCategorySummary[] = [];
  const queue = [...immediateChildren];
  const visited = new Set<string>();

  while (queue.length > 0 && leaves.length < 10 && visited.size < 60) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    const response = await client.get<MeliCategory>(`/categories/${assertMlbId(next.id, "category")}`);
    const children = response.data?.children_categories ?? [];
    if (children.length === 0) leaves.push({ id: next.id, name: response.data?.name ?? next.name });
    else queue.push(...children);
  }

  let dump: CategoriesProbeResult["dump"] = null;
  try {
    const dumpResponse = await client.getHeadersOnly("/sites/MLB/categories/all");
    dump = { httpStatus: dumpResponse.status, headers: dumpResponse.headers };
  } catch {
    dump = null;
  }

  return {
    status: leaves.length >= 3 ? "PASS" : leaves.length > 0 ? "PARTIAL" : "FAIL",
    httpStatus: listResponse.status,
    root,
    immediateChildren,
    leaves,
    dump,
  };
}
