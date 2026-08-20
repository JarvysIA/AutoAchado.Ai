import { DEFAULT_CLIENT_ID, DEFAULT_REDIRECT_URI } from "../config.js";
import { MeliClient, MeliApiError } from "../meli/client.js";
import type { UserDetail } from "../meli/types.js";
import { reportContainsSecret, sanitizeForReport } from "../report/redaction.js";
import { renderReport } from "../report/renderer.js";
import { probeCategories, type CategoriesProbeResult } from "./categories.js";
import { probeHighlights, type HighlightCategoryResult } from "./highlights.js";
import { probeItems, probeMultiget, type ItemProbeResult, type MultigetProbeResult } from "./items.js";
import { probePagination, type PaginationPage } from "./pagination.js";
import { probePrices, type PerItemPriceProbe } from "./prices.js";
import { probeSearch, type SearchProbeResult } from "./search.js";
import { probeSellers, type SellerProbeRow } from "./sellers.js";

export interface ProbeResult {
  generatedAt: string;
  environment: string;
  clientId: string;
  redirectUri: string;
  oauth: { status: "PASS" | "FAIL"; refreshTokenReceived: boolean };
  usersMe: { status: "PASS" | "FAIL"; httpStatus: number; user: UserDetail | null };
  categories: CategoriesProbeResult | null;
  search: SearchProbeResult | null;
  items: ItemProbeResult | null;
  multiget: MultigetProbeResult | null;
  prices: PerItemPriceProbe[];
  sellers: SellerProbeRow[];
  highlights: HighlightCategoryResult[];
  pagination: PaginationPage[];
  rateLimitHeaders: Array<Record<string, string>>;
  errors: string[];
  formalStatus: string;
}

function formalStatus(result: Omit<ProbeResult, "formalStatus">): string {
  if (result.oauth.status !== "PASS" || result.usersMe.status !== "PASS") return "BLOCKED_0A_LIVE_OAUTH";
  if (!result.categories || result.categories.status === "FAIL") return "BLOCKED_0A_LIVE_CATEGORIES";
  if (!result.search || result.search.thirdParty.length < 5) return "BLOCKED_0A_LIVE_MARKETPLACE_SEARCH";
  if (!result.items || result.items.details.length < 5) return "BLOCKED_0A_LIVE_THIRD_PARTY_ITEMS";
  if (!result.prices.some((row) => typeof row.salePrice.data?.amount === "number")) return "BLOCKED_0A_LIVE_THIRD_PARTY_PRICE";
  if (!result.sellers.some((row) => typeof row.level_id === "string")) return "BLOCKED_0A_LIVE_SELLER_REPUTATION";
  return "PASS_0A_LIVE";
}

export async function runProbe(
  accessToken: string,
  expectedUserId: number,
  refreshTokenReceived: boolean,
): Promise<{ result: ProbeResult; markdown: string }> {
  const client = new MeliClient({ accessToken, timeoutMs: 12_000 });
  const errors: string[] = [];
  let user: UserDetail | null = null;
  let userStatus = 0;
  try {
    const response = await client.get<UserDetail>("/users/me");
    userStatus = response.status;
    user = response.data;
    if (user?.id !== expectedUserId) throw new Error("Identidade OAuth inconsistente");
  } catch (error) {
    userStatus = error instanceof MeliApiError ? error.status : 0;
    errors.push(error instanceof Error ? error.message : "Falha em /users/me");
  }

  let categories: CategoriesProbeResult | null = null;
  let search: SearchProbeResult | null = null;
  let items: ItemProbeResult | null = null;
  let multiget: MultigetProbeResult | null = null;
  let prices: PerItemPriceProbe[] = [];
  let sellers: SellerProbeRow[] = [];
  let highlights: HighlightCategoryResult[] = [];
  let pagination: PaginationPage[] = [];

  if (user) {
    try {
      categories = await probeCategories(client);
      if (categories.root && categories.leaves.length > 0) {
        search = await probeSearch(client, categories.leaves, user.id);
        items = await probeItems(client, search.thirdParty);
        multiget = await probeMultiget(client, items.details);
        prices = await probePrices(client, items.details);
        sellers = await probeSellers(client, items.details);
        highlights = await probeHighlights(client, categories.leaves);
        pagination = await probePagination(client, categories.leaves[0]);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Falha durante probe");
    }
  }

  const partial: Omit<ProbeResult, "formalStatus"> = {
    generatedAt: new Date().toISOString(),
    environment: process.env.VERCEL ? "Vercel" : "Node.js local",
    clientId: DEFAULT_CLIENT_ID,
    redirectUri: DEFAULT_REDIRECT_URI,
    oauth: { status: user ? "PASS" : "FAIL", refreshTokenReceived },
    usersMe: { status: userStatus === 200 && user ? "PASS" : "FAIL", httpStatus: userStatus, user },
    categories,
    search,
    items,
    multiget,
    prices,
    sellers,
    highlights,
    pagination,
    rateLimitHeaders: client.observedHeaders.filter((headers) => Object.keys(headers).some((key) => key.includes("ratelimit") || key === "retry-after")),
    errors,
  };
  const result: ProbeResult = { ...partial, formalStatus: formalStatus(partial) };
  const safeResult = sanitizeForReport(result) as ProbeResult;
  const markdown = renderReport(safeResult);
  if (reportContainsSecret(markdown, [accessToken])) {
    throw new Error("Relatório rejeitado pelo secret scan em memória");
  }
  return { result: safeResult, markdown };
}
