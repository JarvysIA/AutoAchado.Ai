import { MeliApiError, MeliClient } from "../meli/client.js";
import { assertMlbId, assertSellerId, assertUserProductId } from "../meli/endpoints.js";
import type {
  ItemDetail,
  MeliCategory,
  MeliCategorySummary,
  UserProductDetail,
  UserProductItemsSearchResponse,
} from "../meli/types.js";
import { sleep } from "../meli/resilience.js";
import { reportContainsSecret, sanitizeForReport } from "../report/redaction.js";
import { renderAlternativeReport } from "../report/alternative-renderer.js";
import { sanitizeItemDetail } from "./items.js";
import { probePrices, type PerItemPriceProbe } from "./prices.js";
import { probeSellers, type SellerProbeRow } from "./sellers.js";

export const MAX_USER_PRODUCTS = 20;
export const MAX_ITEM_DETAILS = 10;

export const ALTERNATIVE_CATEGORY_FAMILIES = [
  { id: "MLB456111", name: "Lubrificantes e Fluidos", keywords: ["oleo", "lubrificante", "fluido", "aditivo"] },
  { id: "MLB2238", name: "Pneus e Acessórios", keywords: ["pneu", "roda", "calota"] },
  { id: "MLB22693", name: "Peças de Carros e Caminhonetes", keywords: ["freio", "filtro", "motor", "suspensao"] },
  { id: "MLB188063", name: "Limpeza Automotiva", keywords: ["limpeza", "cera", "shampoo", "polimento"] },
  { id: "MLB1747", name: "Aces. de Carros e Caminhonetes", keywords: ["tapete", "farol", "capa", "acessorio"] },
] as const;

const EXCLUDED_CATEGORY_TERMS = ["outro", "servico", "tag de pedagio", "pedagio"];

export type AlternativeFormalStatus =
  | "PASS_0A_LIVE_ALTERNATIVE_DISCOVERY"
  | "PARTIAL_0A_LIVE_ALTERNATIVE_DISCOVERY"
  | "BLOCKED_0A_LIVE_USER_PRODUCT_TO_ITEM"
  | "BLOCKED_0A_LIVE_THIRD_PARTY_PRICE"
  | "BLOCKED_0A_LIVE_ALTERNATIVE_DISCOVERY";

export type UserProductClassification =
  | "USER_PRODUCT_WITH_SELLER_AND_ITEM"
  | "USER_PRODUCT_WITH_SELLER_NO_ITEM"
  | "USER_PRODUCT_WITH_ITEM_NO_SELLER"
  | "USER_PRODUCT_METADATA_ONLY"
  | "USER_PRODUCT_FETCH_FAILED";

export interface SelectedAlternativeCategory {
  rootId: string;
  rootName: string;
  categoryId: string;
  categoryName: string;
}

export interface AlternativeHighlightRow {
  categoryId: string;
  categoryName: string;
  httpStatus: number;
  id: string;
  type: string;
  position: number | null;
}

export interface UserProductEvidence {
  id: string;
  sourceCategories: string[];
  httpStatus: number;
  relationHttpStatus: number;
  name: string | null;
  familyName: string | null;
  familyId: string | null;
  domainId: string | null;
  sellerId: string | null;
  attributeCount: number;
  itemIds: string[];
  classification: UserProductClassification;
}

export interface AlternativeItemEvidence extends ItemDetail {
  sourceUserProductId: string;
  sourceCategoryIds: string[];
  httpStatus: number;
  thirdParty: boolean;
}

export interface AlternativeDiscoveryResult {
  generatedAt: string;
  formalStatus: AlternativeFormalStatus;
  oauth: "PASS";
  authenticatedUserId: number;
  categories: SelectedAlternativeCategory[];
  categoryErrors: Array<{ rootId: string; httpStatus: number }>;
  highlights: AlternativeHighlightRow[];
  userProducts: UserProductEvidence[];
  items: AlternativeItemEvidence[];
  prices: PerItemPriceProbe[];
  sellers: SellerProbeRow[];
  repeatability: {
    categoriesWithCompleteChain: number;
    readableUserProducts: number;
    thirdPartyProducts: number;
    currentPrices: number;
    sellersWithReputation: number;
  };
  officialPath: string;
  requestCount: number;
  rateLimitHeaders: Array<Record<string, string>>;
  stoppedOnRateLimit: boolean;
  errors: string[];
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isValidUserProductId(value: string): boolean {
  return /^MLBU\d+$/.test(value);
}

export function isValidItemId(value: string): boolean {
  return /^MLB\d+$/.test(value);
}

export function isRelevantCategoryName(name: string): boolean {
  const normalized = normalize(name);
  return !EXCLUDED_CATEGORY_TERMS.some((term) => normalized.includes(term));
}

export function selectPreferredCategory(
  categories: MeliCategorySummary[],
  keywords: readonly string[],
): MeliCategorySummary | null {
  return [...categories]
    .filter((category) => isRelevantCategoryName(category.name) && /^MLB\d+$/.test(category.id))
    .sort((left, right) => {
      const score = (category: MeliCategorySummary) =>
        keywords.reduce((total, keyword, index) => total + (normalize(category.name).includes(keyword) ? keywords.length - index : 0), 0);
      return score(right) - score(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
    })[0] ?? null;
}

export function deduplicateUserProducts(rows: AlternativeHighlightRow[]): Array<{ id: string; sourceCategories: string[] }> {
  const categoriesById = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.type !== "USER_PRODUCT" || !isValidUserProductId(row.id)) continue;
    const categories = categoriesById.get(row.id) ?? new Set<string>();
    categories.add(row.categoryId);
    categoriesById.set(row.id, categories);
  }
  return [...categoriesById].slice(0, MAX_USER_PRODUCTS).map(([id, categories]) => ({ id, sourceCategories: [...categories] }));
}

export function isThirdPartySeller(sellerId: number | string | null | undefined, authenticatedUserId: number | string): boolean {
  return sellerId !== null && sellerId !== undefined && /^\d+$/.test(String(sellerId)) && String(sellerId) !== String(authenticatedUserId);
}

export function classifyUserProduct(
  fetched: boolean,
  sellerId: string | null,
  itemIds: string[],
): UserProductClassification {
  if (!fetched) return "USER_PRODUCT_FETCH_FAILED";
  if (sellerId && itemIds.length > 0) return "USER_PRODUCT_WITH_SELLER_AND_ITEM";
  if (sellerId) return "USER_PRODUCT_WITH_SELLER_NO_ITEM";
  if (itemIds.length > 0) return "USER_PRODUCT_WITH_ITEM_NO_SELLER";
  return "USER_PRODUCT_METADATA_ONLY";
}

export function httpStatusOf(error: unknown): number {
  return error instanceof MeliApiError ? error.status : 0;
}

export function classifyAlternativeStatus(input: {
  highlightCount: number;
  readableUserProducts: number;
  resolvedUserProducts: number;
  itemCount: number;
  thirdPartyCount: number;
  currentPriceCount: number;
  completeCategoryCount: number;
  sellersWithReputation: number;
}): AlternativeFormalStatus {
  if (input.highlightCount === 0 || input.readableUserProducts === 0) return "BLOCKED_0A_LIVE_ALTERNATIVE_DISCOVERY";
  if (input.resolvedUserProducts === 0) return "BLOCKED_0A_LIVE_USER_PRODUCT_TO_ITEM";
  if (input.itemCount > 0 && input.thirdPartyCount > 0 && input.currentPriceCount === 0) {
    return "BLOCKED_0A_LIVE_THIRD_PARTY_PRICE";
  }
  if (
    input.completeCategoryCount >= 3 &&
    input.resolvedUserProducts >= 3 &&
    input.thirdPartyCount >= 3 &&
    input.currentPriceCount >= 3 &&
    input.sellersWithReputation > 0
  ) {
    return "PASS_0A_LIVE_ALTERNATIVE_DISCOVERY";
  }
  return "PARTIAL_0A_LIVE_ALTERNATIVE_DISCOVERY";
}

async function selectLeafCategories(client: MeliClient): Promise<{
  selected: SelectedAlternativeCategory[];
  errors: Array<{ rootId: string; httpStatus: number }>;
}> {
  const selected: SelectedAlternativeCategory[] = [];
  const errors: Array<{ rootId: string; httpStatus: number }> = [];
  for (const family of ALTERNATIVE_CATEGORY_FAMILIES) {
    let current: MeliCategorySummary = { id: family.id, name: family.name };
    let found = false;
    try {
      for (let depth = 0; depth < 8; depth += 1) {
        const response = await client.get<MeliCategory>(`/categories/${assertMlbId(current.id, "category")}`);
        const detail = response.data;
        if (!detail) throw new Error("Categoria sem payload");
        const children = detail.children_categories ?? [];
        if (children.length === 0) {
          if (!isRelevantCategoryName(detail.name ?? current.name)) throw new Error("Categoria folha excluída");
          selected.push({ rootId: family.id, rootName: family.name, categoryId: detail.id, categoryName: detail.name });
          found = true;
          break;
        }
        const next = selectPreferredCategory(children, family.keywords);
        if (!next) throw new Error("Sem subcategoria física relevante");
        current = next;
      }
      if (!found) errors.push({ rootId: family.id, httpStatus: 0 });
    } catch (error) {
      errors.push({ rootId: family.id, httpStatus: httpStatusOf(error) });
    }
    if (client.encounteredRateLimit) break;
  }
  return { selected, errors };
}

async function probeAlternativeHighlights(
  client: MeliClient,
  categories: SelectedAlternativeCategory[],
): Promise<AlternativeHighlightRow[]> {
  const output: AlternativeHighlightRow[] = [];
  for (const category of categories) {
    try {
      const response = await client.get<{ content?: Array<{ id?: string; type?: string; position?: number }> }>(
        `/highlights/MLB/category/${assertMlbId(category.categoryId, "category")}`,
      );
      for (const row of (response.data?.content ?? []).slice(0, 20)) {
        if (typeof row.id !== "string" || typeof row.type !== "string") continue;
        output.push({
          categoryId: category.categoryId,
          categoryName: category.categoryName,
          httpStatus: response.status,
          id: row.id,
          type: row.type,
          position: typeof row.position === "number" ? row.position : null,
        });
      }
    } catch (error) {
      output.push({
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        httpStatus: httpStatusOf(error),
        id: "",
        type: "ERROR",
        position: null,
      });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}

async function probeUserProducts(
  client: MeliClient,
  highlights: AlternativeHighlightRow[],
): Promise<UserProductEvidence[]> {
  const output: UserProductEvidence[] = [];
  for (const candidate of deduplicateUserProducts(highlights)) {
    const base: UserProductEvidence = {
      id: candidate.id,
      sourceCategories: candidate.sourceCategories,
      httpStatus: 0,
      relationHttpStatus: 0,
      name: null,
      familyName: null,
      familyId: null,
      domainId: null,
      sellerId: null,
      attributeCount: 0,
      itemIds: [],
      classification: "USER_PRODUCT_FETCH_FAILED",
    };
    try {
      const id = assertUserProductId(candidate.id);
      const response = await client.get<UserProductDetail>(`/user-products/${id}`);
      const data = response.data;
      base.httpStatus = response.status;
      if (!data) throw new Error("User Product sem payload");
      base.name = typeof data.name === "string" ? data.name : null;
      base.familyName = typeof data.family_name === "string" ? data.family_name : null;
      base.familyId = data.family_id === null || data.family_id === undefined ? null : String(data.family_id);
      base.domainId = typeof data.domain_id === "string" ? data.domain_id : null;
      base.sellerId = data.user_id === undefined ? null : String(data.user_id);
      base.attributeCount = Array.isArray(data.attributes) ? data.attributes.length : 0;
      if (base.sellerId) {
        try {
          const relation = await client.get<UserProductItemsSearchResponse>(
            `/users/${assertSellerId(base.sellerId)}/items/search?user_product_id=${encodeURIComponent(id)}`,
          );
          base.relationHttpStatus = relation.status;
          base.itemIds = [...new Set((relation.data?.results ?? []).filter(isValidItemId))].slice(0, 5);
        } catch (error) {
          base.relationHttpStatus = httpStatusOf(error);
        }
      }
      base.classification = classifyUserProduct(true, base.sellerId, base.itemIds);
    } catch (error) {
      base.httpStatus = httpStatusOf(error);
      base.classification = classifyUserProduct(false, null, []);
    }
    output.push(base);
    if (client.encounteredRateLimit) break;
  }
  return output;
}

async function probeResolvedItems(
  client: MeliClient,
  userProducts: UserProductEvidence[],
  authenticatedUserId: number,
): Promise<AlternativeItemEvidence[]> {
  const candidates = userProducts
    .flatMap((up) => up.itemIds.slice(0, 1).map((itemId) => ({ itemId, up })))
    .filter((candidate, index, rows) => rows.findIndex((row) => row.itemId === candidate.itemId) === index)
    .slice(0, MAX_ITEM_DETAILS);
  const output: AlternativeItemEvidence[] = [];
  for (const candidate of candidates) {
    try {
      const response = await client.get<ItemDetail>(`/items/${assertMlbId(candidate.itemId, "item")}`);
      if (!response.data) continue;
      const item = sanitizeItemDetail(response.data);
      if (candidate.up.sellerId && String(item.seller_id ?? "") !== candidate.up.sellerId) continue;
      output.push({
        ...item,
        sourceUserProductId: candidate.up.id,
        sourceCategoryIds: candidate.up.sourceCategories,
        httpStatus: response.status,
        thirdParty: isThirdPartySeller(item.seller_id, authenticatedUserId),
      });
    } catch {
      // O status individual já fica evidenciado pela ausência do detalhe; a cadeia segue conservadoramente.
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}

function hasSellerReputation(row: SellerProbeRow): boolean {
  return (
    typeof row.level_id === "string" ||
    typeof row.power_seller_status === "string" ||
    typeof row.transactions_completed === "number" ||
    row.ratings !== undefined
  );
}

export async function runAlternativeDiscoveryProbe(
  accessToken: string,
  authenticatedUserId: number,
): Promise<{ result: AlternativeDiscoveryResult; markdown: string }> {
  const client = new MeliClient({ accessToken, timeoutMs: 12_000 });
  const errors: string[] = [];
  const categoryProbe = await selectLeafCategories(client);
  await sleep(100);
  const highlights = await probeAlternativeHighlights(client, categoryProbe.selected);
  await sleep(100);
  const userProducts = await probeUserProducts(client, highlights);
  await sleep(100);
  const items = await probeResolvedItems(client, userProducts, authenticatedUserId);
  await sleep(100);
  const thirdPartyItems = items.filter((item) => item.thirdParty);
  const prices = client.encounteredRateLimit ? [] : await probePrices(client, thirdPartyItems);
  await sleep(100);
  const sellers = client.encounteredRateLimit ? [] : await probeSellers(client, thirdPartyItems);

  const pricedItemIds = new Set(
    prices.filter((row) => typeof row.salePrice.data?.amount === "number" && row.salePrice.data.amount > 0).map((row) => row.itemId),
  );
  const completeCategories = new Set(
    thirdPartyItems.flatMap((item) => (pricedItemIds.has(item.id) ? item.sourceCategoryIds : [])),
  );
  const readableUserProducts = userProducts.filter((row) => row.httpStatus === 200).length;
  const resolvedUserProducts = userProducts.filter((row) => row.itemIds.length > 0).length;
  const sellersWithReputation = sellers.filter(hasSellerReputation).length;
  const counts = {
    highlightCount: highlights.filter((row) => row.type === "USER_PRODUCT" && isValidUserProductId(row.id)).length,
    readableUserProducts,
    resolvedUserProducts,
    itemCount: items.length,
    thirdPartyCount: thirdPartyItems.length,
    currentPriceCount: pricedItemIds.size,
    completeCategoryCount: completeCategories.size,
    sellersWithReputation,
  };
  if (client.encounteredRateLimit) errors.push("HTTP 429 observado; expansão da amostra interrompida.");
  if (readableUserProducts > 0 && resolvedUserProducts === 0) {
    errors.push("USER_PRODUCT_TO_ITEM_OFFICIAL_PATH_NOT_FOUND na amostra executada.");
  }

  const result: AlternativeDiscoveryResult = {
    generatedAt: new Date().toISOString(),
    formalStatus: classifyAlternativeStatus(counts),
    oauth: "PASS",
    authenticatedUserId,
    categories: categoryProbe.selected,
    categoryErrors: categoryProbe.errors,
    highlights,
    userProducts,
    items,
    prices,
    sellers,
    repeatability: {
      categoriesWithCompleteChain: completeCategories.size,
      readableUserProducts,
      thirdPartyProducts: thirdPartyItems.length,
      currentPrices: pricedItemIds.size,
      sellersWithReputation,
    },
    officialPath: "CATEGORY → HIGHLIGHTS → USER_PRODUCT → /users/{seller}/items/search?user_product_id → ITEM → SALE_PRICE → SELLER",
    requestCount: client.requestCount,
    rateLimitHeaders: client.observedHeaders.filter((headers) =>
      Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after"),
    ),
    stoppedOnRateLimit: client.encounteredRateLimit,
    errors,
  };
  const safe = sanitizeForReport(result) as AlternativeDiscoveryResult;
  const markdown = renderAlternativeReport(safe);
  if (reportContainsSecret(markdown, [accessToken])) throw new Error("Resultado 0A-LIVE-B rejeitado pelo secret scan");
  return { result: safe, markdown };
}
