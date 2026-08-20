import { MeliApiError, MeliClient } from "../meli/client.js";
import { assertCatalogProductId, assertMlbId } from "../meli/endpoints.js";
import type {
  CatalogOffer,
  CatalogProductDetail,
  CatalogProductOffersResponse,
  ItemDetail,
  MeliCategory,
  MeliCategorySummary,
  SalePriceResponse,
} from "../meli/types.js";
import { sleep } from "../meli/resilience.js";
import { reportContainsSecret, sanitizeForReport } from "../report/redaction.js";
import { renderCatalogProductReport } from "../report/catalog-product-renderer.js";
import { ALTERNATIVE_CATEGORY_FAMILIES, isRelevantCategoryName } from "./alternative.js";
import { normalizeSalePrice, type NormalizedSalePrice } from "./prices.js";
import { probeSellers, type SellerProbeRow } from "./sellers.js";

const MAX_CATEGORIES = 5;
const MAX_CATEGORY_NODES_PER_FAMILY = 14;
const MAX_LEAVES_PER_FAMILY = 3;
const MAX_PRODUCT_CANDIDATES = 20;
const MAX_PRODUCT_DETAILS = 10;
const MAX_OFFER_RESOLUTIONS = 5;
const MAX_ITEM_DETAILS = 5;

export const CATALOG_PRODUCT_DETAIL_DOCUMENTATION =
  "https://developers.mercadolivre.com.br/pt_br/buscador-de-produtos";
export const CATALOG_COMPETITION_DOCUMENTATION =
  "https://developers.mercadolivre.com.br/pt_br/concorrencia-em-catalogo";

export type CatalogProductFormalStatus =
  | "PASS_0A_LIVE_CATALOG_PRODUCT_DISCOVERY"
  | "PARTIAL_0A_LIVE_CATALOG_PRODUCT_DISCOVERY"
  | "BLOCKED_0A_LIVE_PRODUCT_DETAIL"
  | "BLOCKED_0A_LIVE_PRODUCT_TO_OFFER"
  | "BLOCKED_0A_LIVE_CATALOG_OFFER_PRICE";

export type CatalogProductClassification =
  | "PRODUCT_WITH_OFFERS"
  | "PRODUCT_DETAIL_ONLY"
  | "PRODUCT_OFFER_PATH_FORBIDDEN"
  | "PRODUCT_OFFER_PATH_NOT_DOCUMENTED"
  | "PRODUCT_FETCH_FAILED";

export interface CatalogHighlightAttempt {
  rootId: string;
  rootName: string;
  categoryId: string;
  categoryName: string;
  httpStatus: number;
  content: Array<{ id: string; type: string; position: number | null }>;
}

export interface CatalogProductCandidate {
  productId: string;
  sourceCategoryIds: string[];
  positions: number[];
}

export interface CatalogProductEvidence {
  productId: string;
  sourceCategoryIds: string[];
  httpStatus: number;
  status: string | null;
  name: string | null;
  domainId: string | null;
  familyName: string | null;
  attributeCount: number;
  soldQuantity: number | null;
  parentId: string | null;
  childrenIds: string[];
  permalink: string | null;
  buyBoxWinner: CatalogOffer | null;
  offerPathHttpStatus: number;
  offerPagingTotal: number | null;
  offers: CatalogOfferEvidence[];
  classification: CatalogProductClassification;
}

export interface CatalogOfferEvidence {
  productId: string;
  itemId: string;
  sellerId: number | null;
  categoryId: string | null;
  price: number | null;
  originalPrice: number | null;
  currencyId: string | null;
  condition: string | null;
  source: "PRODUCT_ITEMS" | "BUY_BOX_WINNER";
  thirdParty: boolean;
  embeddedReputationLevel: string | null;
}

export interface CatalogItemEvidence {
  productId: string;
  itemId: string;
  httpStatus: number;
  sellerId: number | null;
  catalogProductId: string | null;
  catalogProductMatch: boolean | null;
  title: string | null;
  status: string | null;
  price: number | null;
  currencyId: string | null;
  permalink: string | null;
}

export interface CatalogSalePriceEvidence {
  itemId: string;
  httpStatus: number;
  data: NormalizedSalePrice | null;
}

export interface CatalogProductDiscoveryResult {
  generatedAt: string;
  formalStatus: CatalogProductFormalStatus;
  oauth: "PASS";
  authenticatedUserId: number;
  highlightAttempts: CatalogHighlightAttempt[];
  productCandidates: CatalogProductCandidate[];
  products: CatalogProductEvidence[];
  offers: CatalogOfferEvidence[];
  items: CatalogItemEvidence[];
  prices: CatalogSalePriceEvidence[];
  sellers: SellerProbeRow[];
  officialOfferPath: {
    documented: true;
    endpoint: "GET /products/{PRODUCT_ID}/items";
    documentation: string;
    buyBoxEndpoint: "GET /products/{PRODUCT_ID}";
    buyBoxDocumentation: string;
  };
  buyBox: "BUY_BOX_AVAILABLE" | "BUY_BOX_RESTRICTED" | "BUY_BOX_NOT_APPLICABLE";
  repeatability: {
    categoriesWithProducts: number;
    productDetailsPass: number;
    associatedOffers: number;
    thirdPartyOffers: number;
    currentPrices: number;
    sellersWithReputation: number;
  };
  requestCount: number;
  rateLimitHeaders: Array<Record<string, string>>;
  stoppedOnRateLimit: boolean;
  errors: string[];
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isValidCatalogProductId(value: string): boolean {
  return /^MLB\d+$/.test(value);
}

export function isCatalogProductHighlight(row: { id: string; type: string }): boolean {
  return row.type === "PRODUCT" && isValidCatalogProductId(row.id);
}

export function deduplicateCatalogProducts(attempts: CatalogHighlightAttempt[]): CatalogProductCandidate[] {
  const byId = new Map<string, { categories: Set<string>; positions: Set<number> }>();
  for (const attempt of attempts) {
    for (const row of attempt.content) {
      if (!isCatalogProductHighlight(row)) continue;
      const evidence = byId.get(row.id) ?? { categories: new Set<string>(), positions: new Set<number>() };
      evidence.categories.add(attempt.categoryId);
      if (row.position !== null) evidence.positions.add(row.position);
      byId.set(row.id, evidence);
    }
  }
  return [...byId].slice(0, MAX_PRODUCT_CANDIDATES).map(([productId, evidence]) => ({
    productId,
    sourceCategoryIds: [...evidence.categories],
    positions: [...evidence.positions],
  }));
}

export function isCatalogThirdParty(sellerId: number | null, authenticatedUserId: number): boolean {
  return typeof sellerId === "number" && sellerId !== authenticatedUserId;
}

export function catalogProductMatchesItem(productId: string, catalogProductId: string | null | undefined): boolean | null {
  return typeof catalogProductId === "string" ? catalogProductId === productId : null;
}

export function classifyCatalogProduct(
  detailStatus: number,
  offerStatus: number,
  offerCount: number,
  offerPathDocumented = true,
): CatalogProductClassification {
  if (detailStatus !== 200) return "PRODUCT_FETCH_FAILED";
  if (!offerPathDocumented) return "PRODUCT_OFFER_PATH_NOT_DOCUMENTED";
  if (offerCount > 0) return "PRODUCT_WITH_OFFERS";
  if (offerStatus === 401 || offerStatus === 403) return "PRODUCT_OFFER_PATH_FORBIDDEN";
  return "PRODUCT_DETAIL_ONLY";
}

export function hasCatalogSellerReputation(row: SellerProbeRow): boolean {
  return (
    typeof row.level_id === "string" ||
    typeof row.power_seller_status === "string" ||
    typeof row.transactions_completed === "number" ||
    row.ratings !== undefined
  );
}

export function classifyCatalogProductStatus(input: {
  productCandidates: number;
  productDetailsPass: number;
  associatedOffers: number;
  thirdPartyOffers: number;
  currentPrices: number;
  sellersWithReputation: number;
}): CatalogProductFormalStatus {
  if (input.productCandidates > 0 && input.productDetailsPass === 0) return "BLOCKED_0A_LIVE_PRODUCT_DETAIL";
  if (input.productDetailsPass > 0 && input.associatedOffers === 0) return "BLOCKED_0A_LIVE_PRODUCT_TO_OFFER";
  if (input.thirdPartyOffers > 0 && input.currentPrices === 0) return "BLOCKED_0A_LIVE_CATALOG_OFFER_PRICE";
  if (
    input.productDetailsPass >= 3 &&
    input.associatedOffers >= 3 &&
    input.thirdPartyOffers >= 3 &&
    input.currentPrices >= 3 &&
    input.sellersWithReputation >= 1
  ) {
    return "PASS_0A_LIVE_CATALOG_PRODUCT_DISCOVERY";
  }
  return "PARTIAL_0A_LIVE_CATALOG_PRODUCT_DISCOVERY";
}

function rankCategories(categories: MeliCategorySummary[], keywords: readonly string[]): MeliCategorySummary[] {
  const score = (category: MeliCategorySummary): number => {
    const name = normalize(category.name);
    return keywords.reduce((sum, keyword, index) => sum + (name.includes(keyword) ? (keywords.length - index) * 10 : 0), 0);
  };
  return [...categories]
    .filter((category) => isRelevantCategoryName(category.name) && isValidCatalogProductId(category.id))
    .sort((left, right) => score(right) - score(left) || left.name.localeCompare(right.name));
}

async function discoverLeaves(client: MeliClient, family: (typeof ALTERNATIVE_CATEGORY_FAMILIES)[number]): Promise<MeliCategorySummary[]> {
  const queue: MeliCategorySummary[] = [{ id: family.id, name: family.name }];
  const visited = new Set<string>();
  const leaves: MeliCategorySummary[] = [];
  while (queue.length && leaves.length < MAX_LEAVES_PER_FAMILY && visited.size < MAX_CATEGORY_NODES_PER_FAMILY && !client.encounteredRateLimit) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    visited.add(next.id);
    try {
      const response = await client.get<MeliCategory>(`/categories/${assertMlbId(next.id, "category")}`);
      const detail = response.data;
      if (!detail) continue;
      const children = detail.children_categories ?? [];
      if (!children.length) leaves.push({ id: detail.id, name: detail.name });
      else queue.push(...rankCategories(children, family.keywords));
    } catch {
      // Uma categoria indisponível não invalida as demais famílias.
    }
  }
  return leaves;
}

async function probeProductHighlights(client: MeliClient): Promise<CatalogHighlightAttempt[]> {
  const attempts: CatalogHighlightAttempt[] = [];
  for (const family of ALTERNATIVE_CATEGORY_FAMILIES.slice(0, MAX_CATEGORIES)) {
    const leaves = await discoverLeaves(client, family);
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
        attempts.push({ rootId: family.id, rootName: family.name, categoryId: leaf.id, categoryName: leaf.name, httpStatus: status, content: [] });
        if (status === 429) break;
      }
    }
    if (client.encounteredRateLimit) break;
  }
  return attempts;
}

function sanitizeOffer(productId: string, offer: CatalogOffer, source: CatalogOfferEvidence["source"], authenticatedUserId: number): CatalogOfferEvidence | null {
  if (typeof offer.item_id !== "string" || !/^MLB\d+$/.test(offer.item_id)) return null;
  const sellerId = typeof offer.seller_id === "number" ? offer.seller_id : null;
  return {
    productId,
    itemId: offer.item_id,
    sellerId,
    categoryId: typeof offer.category_id === "string" ? offer.category_id : null,
    price: typeof offer.price === "number" ? offer.price : null,
    originalPrice: typeof offer.original_price === "number" ? offer.original_price : null,
    currencyId: typeof offer.currency_id === "string" ? offer.currency_id : null,
    condition: typeof offer.condition === "string" ? offer.condition : null,
    source,
    thirdParty: isCatalogThirdParty(sellerId, authenticatedUserId),
    embeddedReputationLevel: typeof offer.seller?.reputation_level_id === "string" ? offer.seller.reputation_level_id : null,
  };
}

function sanitizeBuyBoxWinner(offer: CatalogOffer | null | undefined): CatalogOffer | null {
  if (!offer) return null;
  const safe: CatalogOffer = {};
  if (typeof offer.item_id === "string") safe.item_id = offer.item_id;
  if (typeof offer.seller_id === "number") safe.seller_id = offer.seller_id;
  if (typeof offer.category_id === "string") safe.category_id = offer.category_id;
  if (typeof offer.price === "number") safe.price = offer.price;
  if (typeof offer.original_price === "number" || offer.original_price === null) safe.original_price = offer.original_price;
  if (typeof offer.currency_id === "string") safe.currency_id = offer.currency_id;
  if (typeof offer.condition === "string") safe.condition = offer.condition;
  if (typeof offer.available_quantity === "number") safe.available_quantity = offer.available_quantity;
  if (typeof offer.sold_quantity === "number") safe.sold_quantity = offer.sold_quantity;
  if (typeof offer.product_id === "string") safe.product_id = offer.product_id;
  if (typeof offer.site_id === "string") safe.site_id = offer.site_id;
  if (typeof offer.shipping?.free_shipping === "boolean") safe.shipping = { free_shipping: offer.shipping.free_shipping };
  if (typeof offer.seller?.reputation_level_id === "string") safe.seller = { reputation_level_id: offer.seller.reputation_level_id };
  return safe;
}

async function probeProducts(client: MeliClient, candidates: CatalogProductCandidate[], authenticatedUserId: number): Promise<CatalogProductEvidence[]> {
  const output: CatalogProductEvidence[] = [];
  for (const candidate of candidates.slice(0, MAX_PRODUCT_DETAILS)) {
    const base: CatalogProductEvidence = {
      productId: candidate.productId, sourceCategoryIds: candidate.sourceCategoryIds, httpStatus: 0, status: null, name: null,
      domainId: null, familyName: null, attributeCount: 0, soldQuantity: null, parentId: null, childrenIds: [], permalink: null,
      buyBoxWinner: null, offerPathHttpStatus: 0, offerPagingTotal: null, offers: [], classification: "PRODUCT_FETCH_FAILED",
    };
    try {
      const id = assertCatalogProductId(candidate.productId);
      const detailResponse = await client.get<CatalogProductDetail>(`/products/${id}`);
      const detail = detailResponse.data;
      base.httpStatus = detailResponse.status;
      if (!detail || detail.id !== id) throw new Error("Produto de catálogo sem payload válido");
      base.status = typeof detail.status === "string" ? detail.status : null;
      base.name = typeof detail.name === "string" ? detail.name : null;
      base.domainId = typeof detail.domain_id === "string" ? detail.domain_id : null;
      base.familyName = typeof detail.family_name === "string" ? detail.family_name : null;
      base.attributeCount = Array.isArray(detail.attributes) ? detail.attributes.length : 0;
      base.soldQuantity = typeof detail.sold_quantity === "number" ? detail.sold_quantity : null;
      base.parentId = typeof detail.parent_id === "string" ? detail.parent_id : null;
      base.childrenIds = (detail.children_ids ?? []).filter(isValidCatalogProductId).slice(0, 20);
      base.permalink = typeof detail.permalink === "string" ? detail.permalink : null;
      base.buyBoxWinner = sanitizeBuyBoxWinner(detail.buy_box_winner);
      if (output.length < MAX_OFFER_RESOLUTIONS) {
        try {
          const offerResponse = await client.get<CatalogProductOffersResponse>(`/products/${id}/items`);
          base.offerPathHttpStatus = offerResponse.status;
          base.offerPagingTotal = typeof offerResponse.data?.paging?.total === "number" ? offerResponse.data.paging.total : null;
          base.offers = (offerResponse.data?.results ?? []).slice(0, 5).flatMap((offer) => {
            const sanitized = sanitizeOffer(id, offer, "PRODUCT_ITEMS", authenticatedUserId);
            return sanitized ? [sanitized] : [];
          });
        } catch (error) {
          base.offerPathHttpStatus = error instanceof MeliApiError ? error.status : 0;
        }
      }
      if (!base.offers.length && base.buyBoxWinner) {
        const winner = sanitizeOffer(id, base.buyBoxWinner, "BUY_BOX_WINNER", authenticatedUserId);
        if (winner) base.offers = [winner];
      }
      base.classification = classifyCatalogProduct(base.httpStatus, base.offerPathHttpStatus, base.offers.length);
    } catch (error) {
      base.httpStatus = error instanceof MeliApiError ? error.status : base.httpStatus;
      base.classification = "PRODUCT_FETCH_FAILED";
    }
    output.push(base);
    if (client.encounteredRateLimit) break;
  }
  return output;
}

function uniqueOffers(products: CatalogProductEvidence[]): CatalogOfferEvidence[] {
  const seen = new Set<string>();
  return products.flatMap((product) => product.offers).filter((offer) => {
    if (seen.has(offer.itemId)) return false;
    seen.add(offer.itemId);
    return true;
  });
}

async function probeCatalogItems(client: MeliClient, offers: CatalogOfferEvidence[]): Promise<CatalogItemEvidence[]> {
  const output: CatalogItemEvidence[] = [];
  for (const offer of offers.slice(0, MAX_ITEM_DETAILS)) {
    try {
      const response = await client.get<ItemDetail>(`/items/${assertMlbId(offer.itemId, "item")}`);
      const item = response.data;
      output.push({
        productId: offer.productId, itemId: offer.itemId, httpStatus: response.status,
        sellerId: typeof item?.seller_id === "number" ? item.seller_id : null,
        catalogProductId: typeof item?.catalog_product_id === "string" ? item.catalog_product_id : null,
        catalogProductMatch: catalogProductMatchesItem(offer.productId, item?.catalog_product_id),
        title: typeof item?.title === "string" ? item.title : null, status: typeof item?.status === "string" ? item.status : null,
        price: typeof item?.price === "number" ? item.price : null, currencyId: typeof item?.currency_id === "string" ? item.currency_id : null,
        permalink: typeof item?.permalink === "string" ? item.permalink : null,
      });
    } catch (error) {
      output.push({ productId: offer.productId, itemId: offer.itemId, httpStatus: error instanceof MeliApiError ? error.status : 0,
        sellerId: null, catalogProductId: null, catalogProductMatch: null, title: null, status: null, price: null, currencyId: null, permalink: null });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}

async function probeCatalogPrices(client: MeliClient, offers: CatalogOfferEvidence[]): Promise<CatalogSalePriceEvidence[]> {
  const output: CatalogSalePriceEvidence[] = [];
  for (const offer of offers.filter((row) => row.thirdParty).slice(0, 5)) {
    try {
      const response = await client.get<SalePriceResponse>(`/items/${assertMlbId(offer.itemId, "item")}/sale_price`);
      output.push({ itemId: offer.itemId, httpStatus: response.status, data: response.data ? normalizeSalePrice(response.data) : null });
    } catch (error) {
      output.push({ itemId: offer.itemId, httpStatus: error instanceof MeliApiError ? error.status : 0, data: null });
    }
    if (client.encounteredRateLimit) break;
  }
  return output;
}

export async function runCatalogProductDiscoveryProbe(accessToken: string, authenticatedUserId: number): Promise<{ result: CatalogProductDiscoveryResult; markdown: string }> {
  const client = new MeliClient({ accessToken, timeoutMs: 12_000 });
  const errors: string[] = [];
  const highlightAttempts = await probeProductHighlights(client);
  await sleep(100);
  const productCandidates = deduplicateCatalogProducts(highlightAttempts);
  const products = await probeProducts(client, productCandidates, authenticatedUserId);
  await sleep(100);
  const offers = uniqueOffers(products);
  const thirdPartyOffers = offers.filter((offer) => offer.thirdParty);
  const items = client.encounteredRateLimit ? [] : await probeCatalogItems(client, offers);
  await sleep(100);
  const prices = client.encounteredRateLimit ? [] : await probeCatalogPrices(client, thirdPartyOffers);
  await sleep(100);
  const sellerInput: ItemDetail[] = thirdPartyOffers.slice(0, 5).flatMap((offer) =>
    offer.sellerId === null ? [] : [{ id: offer.itemId, seller_id: offer.sellerId, catalog_product_id: offer.productId }],
  );
  const sellers = client.encounteredRateLimit ? [] : await probeSellers(client, sellerInput);
  const currentPrices = prices.filter((row) => typeof row.data?.amount === "number" && row.data.amount > 0).length;
  const repeatability = {
    categoriesWithProducts: new Set(productCandidates.flatMap((candidate) => candidate.sourceCategoryIds)).size,
    productDetailsPass: products.filter((product) => product.httpStatus === 200).length,
    associatedOffers: offers.length,
    thirdPartyOffers: thirdPartyOffers.length,
    currentPrices,
    sellersWithReputation: sellers.filter(hasCatalogSellerReputation).length,
  };
  if (client.encounteredRateLimit) errors.push("HTTP 429 observado; expansão da amostra interrompida.");
  const result: CatalogProductDiscoveryResult = {
    generatedAt: new Date().toISOString(),
    formalStatus: classifyCatalogProductStatus({ productCandidates: productCandidates.length, ...repeatability }),
    oauth: "PASS", authenticatedUserId, highlightAttempts, productCandidates, products, offers, items, prices, sellers,
    officialOfferPath: {
      documented: true, endpoint: "GET /products/{PRODUCT_ID}/items", documentation: CATALOG_COMPETITION_DOCUMENTATION,
      buyBoxEndpoint: "GET /products/{PRODUCT_ID}", buyBoxDocumentation: CATALOG_PRODUCT_DETAIL_DOCUMENTATION,
    },
    buyBox: products.some((product) => product.buyBoxWinner) ? "BUY_BOX_AVAILABLE" : products.some((product) => product.httpStatus === 200) ? "BUY_BOX_NOT_APPLICABLE" : "BUY_BOX_RESTRICTED",
    repeatability, requestCount: client.requestCount,
    rateLimitHeaders: client.observedHeaders.filter((headers) => Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after")),
    stoppedOnRateLimit: client.encounteredRateLimit, errors,
  };
  const safe = sanitizeForReport(result) as CatalogProductDiscoveryResult;
  const markdown = renderCatalogProductReport(safe);
  if (reportContainsSecret(markdown, [accessToken])) throw new Error("Relatório 0A-LIVE-D rejeitado pelo secret scan");
  return { result: safe, markdown };
}
