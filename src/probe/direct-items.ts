import { MeliApiError, MeliClient } from "../meli/client.js";
import { assertMlbId, assertSellerId } from "../meli/endpoints.js";
import type { MeliCategory, MeliCategorySummary, UserDetail } from "../meli/types.js";
import { sleep } from "../meli/resilience.js";
import { reportContainsSecret, sanitizeForReport } from "../report/redaction.js";
import { renderDirectItemReport } from "../report/direct-item-renderer.js";
import { ALTERNATIVE_CATEGORY_FAMILIES, isRelevantCategoryName } from "./alternative.js";
import { probePrices, type PerItemPriceProbe } from "./prices.js";

const MAX_LEAVES_PER_FAMILY = 3;
const MAX_CATEGORY_NODES_PER_FAMILY = 14;
const MAX_DIRECT_ITEM_CANDIDATES = 20;
const MAX_ITEM_DETAILS = 10;
const MAX_SELLERS = 5;

const EXTRA_PREFERENCES: Record<string, readonly string[]> = {
  MLB456111: ["oleo", "fluido", "aditivo", "lubrificante"],
  MLB2238: ["pneus para carros", "passeio", "automotivo", "pneu"],
  MLB22693: ["filtro", "freio", "suspensao", "motor"],
  MLB188063: ["cera", "shampoo", "limpeza", "polimento"],
  MLB1747: ["tapete", "capa", "iluminacao", "acessorio"],
};

export type DirectItemFormalStatus =
  | "PASS_0A_LIVE_DIRECT_ITEM_DISCOVERY"
  | "PARTIAL_0A_LIVE_DIRECT_ITEM_DISCOVERY"
  | "BLOCKED_0A_LIVE_DIRECT_ITEM_DETAIL"
  | "BLOCKED_0A_LIVE_DIRECT_ITEM_PRICE"
  | "BLOCKED_0A_LIVE_NO_DIRECT_ITEMS";

export interface DirectHighlightRow {
  id: string;
  type: string;
  position: number | null;
}

export interface DirectHighlightAttempt {
  rootId: string;
  rootName: string;
  categoryId: string;
  categoryName: string;
  httpStatus: number;
  content: DirectHighlightRow[];
}

export interface DirectItemCandidate {
  itemId: string;
  sourceCategoryIds: string[];
  positions: number[];
}

export interface DirectItemData {
  id: string;
  title?: string;
  seller_id?: number;
  category_id?: string;
  price?: number;
  base_price?: number;
  original_price?: number | null;
  currency_id?: string;
  condition?: string;
  status?: string;
  catalog_product_id?: string | null;
  permalink?: string;
  available_quantity?: number;
  sold_quantity?: number;
}

export interface DirectItemDetailEvidence {
  itemId: string;
  sourceCategoryIds: string[];
  httpStatus: number;
  data: DirectItemData | null;
  thirdParty: boolean;
}

export interface DirectSellerEvidence {
  sellerId: number;
  httpStatus: number;
  nickname: string | null;
  levelId: string | null;
  powerSellerStatus: string | null;
  transactionsCompleted: number | null;
  ratings: Record<string, number> | null;
  siteStatus: string | null;
}

export interface DirectItemDiscoveryResult {
  generatedAt: string;
  formalStatus: DirectItemFormalStatus;
  oauth: "PASS";
  authenticatedUserId: number;
  highlightAttempts: DirectHighlightAttempt[];
  highlightTypeCounts: { ITEM: number; PRODUCT: number; USER_PRODUCT: number; OTHER: number };
  candidates: DirectItemCandidate[];
  itemDetails: DirectItemDetailEvidence[];
  prices: PerItemPriceProbe[];
  sellers: DirectSellerEvidence[];
  repeatability: {
    highlights200Categories: number;
    directItemCandidates: number;
    itemDetailsPass: number;
    thirdPartyItems: number;
    currentPrices: number;
    sellersWithReputation: number;
  };
  productObservations: { count: number; action: "OBSERVED_ONLY"; note: string };
  requestCount: number;
  rateLimitHeaders: Array<Record<string, string>>;
  stoppedOnRateLimit: boolean;
  errors: string[];
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isValidDirectItemId(value: string): boolean {
  return /^MLB\d+$/.test(value);
}

export function isDirectItemHighlight(row: Pick<DirectHighlightRow, "id" | "type">): boolean {
  return row.type === "ITEM" && isValidDirectItemId(row.id);
}

export function deduplicateDirectItems(attempts: DirectHighlightAttempt[]): DirectItemCandidate[] {
  const byId = new Map<string, { categories: Set<string>; positions: Set<number> }>();
  for (const attempt of attempts) {
    for (const row of attempt.content) {
      if (!isDirectItemHighlight(row)) continue;
      const evidence = byId.get(row.id) ?? { categories: new Set<string>(), positions: new Set<number>() };
      evidence.categories.add(attempt.categoryId);
      if (row.position !== null) evidence.positions.add(row.position);
      byId.set(row.id, evidence);
    }
  }
  return [...byId]
    .slice(0, MAX_DIRECT_ITEM_CANDIDATES)
    .map(([itemId, evidence]) => ({ itemId, sourceCategoryIds: [...evidence.categories], positions: [...evidence.positions] }));
}

export function isDirectThirdParty(sellerId: number | null | undefined, authenticatedUserId: number): boolean {
  return typeof sellerId === "number" && sellerId !== authenticatedUserId;
}

export function isItemDetailPass(row: DirectItemDetailEvidence): boolean {
  return row.httpStatus === 200 && row.data !== null && isValidDirectItemId(row.data.id) && typeof row.data.seller_id === "number";
}

export function isCurrentPricePass(row: PerItemPriceProbe): boolean {
  return typeof row.salePrice.data?.amount === "number" && row.salePrice.data.amount > 0;
}

export function hasDirectSellerReputation(row: DirectSellerEvidence): boolean {
  return (
    typeof row.levelId === "string" ||
    typeof row.powerSellerStatus === "string" ||
    typeof row.transactionsCompleted === "number" ||
    row.ratings !== null
  );
}

export function shouldTryNextLeaf(httpStatus: number): boolean {
  return httpStatus !== 200 && httpStatus !== 429;
}

export function shouldStopDirectExpansion(httpStatus: number): boolean {
  return httpStatus === 429;
}

export function classifyDirectItemStatus(input: {
  highlights200Categories: number;
  directItemCandidates: number;
  itemDetailsPass: number;
  thirdPartyItems: number;
  currentPrices: number;
  sellersWithReputation: number;
}): DirectItemFormalStatus {
  if (input.directItemCandidates < 3) return "BLOCKED_0A_LIVE_NO_DIRECT_ITEMS";
  if (input.itemDetailsPass === 0) return "BLOCKED_0A_LIVE_DIRECT_ITEM_DETAIL";
  if (input.thirdPartyItems > 0 && input.currentPrices === 0) return "BLOCKED_0A_LIVE_DIRECT_ITEM_PRICE";
  if (
    input.highlights200Categories >= 2 &&
    input.itemDetailsPass >= 3 &&
    input.thirdPartyItems >= 3 &&
    input.currentPrices >= 3 &&
    input.sellersWithReputation >= 1
  ) {
    return "PASS_0A_LIVE_DIRECT_ITEM_DISCOVERY";
  }
  return "PARTIAL_0A_LIVE_DIRECT_ITEM_DISCOVERY";
}

function rankCategories(categories: MeliCategorySummary[], rootId: string): MeliCategorySummary[] {
  const preferences = EXTRA_PREFERENCES[rootId] ?? [];
  const score = (category: MeliCategorySummary): number => {
    const name = normalize(category.name);
    const positive = preferences.reduce(
      (total, keyword, index) => total + (name.includes(keyword) ? (preferences.length - index) * 10 : 0),
      0,
    );
    const agriculturalPenalty = name.includes("agricola") ? 100 : 0;
    return positive - agriculturalPenalty;
  };
  return [...categories]
    .filter((category) => isRelevantCategoryName(category.name) && isValidDirectItemId(category.id))
    .sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

async function discoverLeafCandidates(
  client: MeliClient,
  family: (typeof ALTERNATIVE_CATEGORY_FAMILIES)[number],
): Promise<MeliCategorySummary[]> {
  const queue: MeliCategorySummary[] = [{ id: family.id, name: family.name }];
  const visited = new Set<string>();
  const leaves: MeliCategorySummary[] = [];
  while (
    queue.length > 0 &&
    leaves.length < MAX_LEAVES_PER_FAMILY &&
    visited.size < MAX_CATEGORY_NODES_PER_FAMILY &&
    !client.encounteredRateLimit
  ) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    try {
      const response = await client.get<MeliCategory>(`/categories/${assertMlbId(next.id, "category")}`);
      const detail = response.data;
      if (!detail) continue;
      const children = detail.children_categories ?? [];
      if (children.length === 0) {
        if (isRelevantCategoryName(detail.name)) leaves.push({ id: detail.id, name: detail.name });
      } else {
        queue.push(...rankCategories(children, family.id));
      }
    } catch {
      // Uma categoria indisponível não encerra as demais famílias.
    }
  }
  return leaves;
}

async function probeHighlightsWithFallback(
  client: MeliClient,
  family: (typeof ALTERNATIVE_CATEGORY_FAMILIES)[number],
  leaves: MeliCategorySummary[],
): Promise<DirectHighlightAttempt[]> {
  const attempts: DirectHighlightAttempt[] = [];
  for (const leaf of leaves.slice(0, MAX_LEAVES_PER_FAMILY)) {
    try {
      const response = await client.get<{ content?: Array<{ id?: string; type?: string; position?: number }> }>(
        `/highlights/MLB/category/${assertMlbId(leaf.id, "category")}`,
      );
      attempts.push({
        rootId: family.id,
        rootName: family.name,
        categoryId: leaf.id,
        categoryName: leaf.name,
        httpStatus: response.status,
        content: (response.data?.content ?? []).slice(0, 20).flatMap((row) =>
          typeof row.id === "string" && typeof row.type === "string"
            ? [{ id: row.id, type: row.type, position: typeof row.position === "number" ? row.position : null }]
            : [],
        ),
      });
      break;
    } catch (error) {
      const status = error instanceof MeliApiError ? error.status : 0;
      attempts.push({
        rootId: family.id,
        rootName: family.name,
        categoryId: leaf.id,
        categoryName: leaf.name,
        httpStatus: status,
        content: [],
      });
      if (!shouldTryNextLeaf(status)) break;
    }
  }
  return attempts;
}

function sanitizeDirectItem(item: DirectItemData): DirectItemData {
  const output: DirectItemData = { id: item.id };
  const keys = [
    "title",
    "seller_id",
    "category_id",
    "price",
    "base_price",
    "original_price",
    "currency_id",
    "condition",
    "status",
    "catalog_product_id",
    "permalink",
    "available_quantity",
    "sold_quantity",
  ] as const;
  for (const key of keys) {
    if (item[key] !== undefined) Object.assign(output, { [key]: item[key] });
  }
  return output;
}

async function probeDirectItemDetails(
  client: MeliClient,
  candidates: DirectItemCandidate[],
  authenticatedUserId: number,
): Promise<DirectItemDetailEvidence[]> {
  const output: DirectItemDetailEvidence[] = [];
  for (const candidate of candidates.slice(0, MAX_ITEM_DETAILS)) {
    try {
      const response = await client.get<DirectItemData>(`/items/${assertMlbId(candidate.itemId, "item")}`);
      const data = response.data ? sanitizeDirectItem(response.data) : null;
      output.push({
        itemId: candidate.itemId,
        sourceCategoryIds: candidate.sourceCategoryIds,
        httpStatus: response.status,
        data,
        thirdParty: isDirectThirdParty(data?.seller_id, authenticatedUserId),
      });
    } catch (error) {
      output.push({
        itemId: candidate.itemId,
        sourceCategoryIds: candidate.sourceCategoryIds,
        httpStatus: error instanceof MeliApiError ? error.status : 0,
        data: null,
        thirdParty: false,
      });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}

interface DirectUserDetail extends UserDetail {
  status?: { site_status?: string };
}

async function probeDirectSellers(client: MeliClient, items: DirectItemDetailEvidence[]): Promise<DirectSellerEvidence[]> {
  const sellerIds = [...new Set(items.flatMap((item) => (item.thirdParty && item.data?.seller_id ? [item.data.seller_id] : [])))].slice(
    0,
    MAX_SELLERS,
  );
  const output: DirectSellerEvidence[] = [];
  for (const sellerId of sellerIds) {
    try {
      const response = await client.get<DirectUserDetail>(`/users/${assertSellerId(sellerId)}`);
      const data = response.data;
      output.push({
        sellerId,
        httpStatus: response.status,
        nickname: typeof data?.nickname === "string" ? data.nickname : null,
        levelId: typeof data?.seller_reputation?.level_id === "string" ? data.seller_reputation.level_id : null,
        powerSellerStatus:
          typeof data?.seller_reputation?.power_seller_status === "string" ? data.seller_reputation.power_seller_status : null,
        transactionsCompleted:
          typeof data?.seller_reputation?.transactions?.completed === "number"
            ? data.seller_reputation.transactions.completed
            : null,
        ratings: data?.seller_reputation?.transactions?.ratings ?? null,
        siteStatus: typeof data?.status?.site_status === "string" ? data.status.site_status : null,
      });
    } catch (error) {
      output.push({
        sellerId,
        httpStatus: error instanceof MeliApiError ? error.status : 0,
        nickname: null,
        levelId: null,
        powerSellerStatus: null,
        transactionsCompleted: null,
        ratings: null,
        siteStatus: null,
      });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}

function countHighlightTypes(attempts: DirectHighlightAttempt[]): DirectItemDiscoveryResult["highlightTypeCounts"] {
  const counts = { ITEM: 0, PRODUCT: 0, USER_PRODUCT: 0, OTHER: 0 };
  for (const row of attempts.flatMap((attempt) => attempt.content)) {
    if (row.type === "ITEM" || row.type === "PRODUCT" || row.type === "USER_PRODUCT") counts[row.type] += 1;
    else counts.OTHER += 1;
  }
  return counts;
}

export async function runDirectItemDiscoveryProbe(
  accessToken: string,
  authenticatedUserId: number,
): Promise<{ result: DirectItemDiscoveryResult; markdown: string }> {
  const client = new MeliClient({ accessToken, timeoutMs: 12_000 });
  const highlightAttempts: DirectHighlightAttempt[] = [];
  const errors: string[] = [];
  for (const family of ALTERNATIVE_CATEGORY_FAMILIES) {
    const leaves = await discoverLeafCandidates(client, family);
    highlightAttempts.push(...(await probeHighlightsWithFallback(client, family, leaves)));
    if (client.encounteredRateLimit) break;
  }
  await sleep(100);
  const candidates = deduplicateDirectItems(highlightAttempts);
  const itemDetails = await probeDirectItemDetails(client, candidates, authenticatedUserId);
  await sleep(100);
  const thirdPartyItems = itemDetails.filter((row) => isItemDetailPass(row) && row.thirdParty && row.data);
  const priceInput = thirdPartyItems.flatMap((row) => (row.data ? [row.data] : []));
  const prices = client.encounteredRateLimit ? [] : await probePrices(client, priceInput);
  await sleep(100);
  const sellers = client.encounteredRateLimit ? [] : await probeDirectSellers(client, thirdPartyItems);
  const counts = {
    highlights200Categories: new Set(
      highlightAttempts.filter((attempt) => attempt.httpStatus === 200).map((attempt) => attempt.categoryId),
    ).size,
    directItemCandidates: candidates.length,
    itemDetailsPass: itemDetails.filter(isItemDetailPass).length,
    thirdPartyItems: thirdPartyItems.length,
    currentPrices: prices.filter(isCurrentPricePass).length,
    sellersWithReputation: sellers.filter(hasDirectSellerReputation).length,
  };
  if (client.encounteredRateLimit) errors.push("HTTP 429 observado; expansão da amostra interrompida.");
  const highlightTypeCounts = countHighlightTypes(highlightAttempts);
  const result: DirectItemDiscoveryResult = {
    generatedAt: new Date().toISOString(),
    formalStatus: classifyDirectItemStatus(counts),
    oauth: "PASS",
    authenticatedUserId,
    highlightAttempts,
    highlightTypeCounts,
    candidates,
    itemDetails,
    prices,
    sellers,
    repeatability: counts,
    productObservations: {
      count: highlightTypeCounts.PRODUCT,
      action: "OBSERVED_ONLY",
      note: "PRODUCT é catálogo oficial e não foi tratado como ITEM. Uma eventual resolução oficial fica adiada para 0A-LIVE-D.",
    },
    requestCount: client.requestCount,
    rateLimitHeaders: client.observedHeaders.filter((headers) =>
      Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after"),
    ),
    stoppedOnRateLimit: client.encounteredRateLimit,
    errors,
  };
  const safe = sanitizeForReport(result) as DirectItemDiscoveryResult;
  const markdown = renderDirectItemReport(safe);
  if (reportContainsSecret(markdown, [accessToken])) throw new Error("Relatório 0A-LIVE-C rejeitado pelo secret scan");
  return { result: safe, markdown };
}
