import {
  DiscoveryError,
  MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT,
  MELI_HIGHLIGHTS_CATEGORY_V1,
  type DiscoveryEligibleCategory,
  type DiscoveryHighlightType,
  type DiscoveryOccurrence,
  type MarketplaceCategoryDiscoveryResult,
  type MarketplaceDiscoveryAdapter,
} from "../commerce/discovery/types.js";
import { MeliApiError, type ApiResponse } from "./client.js";

export const MELI_HIGHLIGHTS_DISCOVERY_ADAPTER_VERSION = "meli-highlights-discovery/v1" as const;
const MAX_HIGHLIGHTS = 20;

export interface MeliDiscoveryHttpClient {
  readonly requestCount: number;
  readonly encounteredRateLimit: boolean;
  get<T>(path: string): Promise<ApiResponse<T>>;
}

export interface MeliHighlightsDiscoveryAdapterOptions {
  readonly client: MeliDiscoveryHttpClient;
  readonly nowIso: () => string;
}

function schemaInvalid(categoryId: string): never {
  throw new DiscoveryError("DISCOVERY_ADAPTER_SCHEMA_INVALID", "Resposta de highlights inválida", { categoryId });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedId(type: DiscoveryHighlightType, id: string): boolean {
  return type === "USER_PRODUCT" ? /^MLBU[0-9]+$/.test(id) : /^MLB[0-9]+$/.test(id);
}

function classifiedError(error: unknown, categoryId: string): DiscoveryError {
  if (error instanceof DiscoveryError) return error;
  if (!(error instanceof MeliApiError)) {
    return new DiscoveryError("DISCOVERY_CATEGORY_TRANSPORT_FAILED", "Falha sanitizada no adapter", { categoryId, status: 0 });
  }
  if (error.status === 401 || error.status === 403) {
    return new DiscoveryError("DISCOVERY_AUTH_FATAL", "Autorização indisponível para highlights", { categoryId, status: error.status });
  }
  if (error.status === 429) {
    return new DiscoveryError("DISCOVERY_RATE_LIMIT_STOP", "Rate limit esgotado", { categoryId, status: 429 });
  }
  if (error.status === 0 || error.status >= 500) {
    return new DiscoveryError("DISCOVERY_CATEGORY_TRANSPORT_FAILED", "Falha transitória esgotada", {
      categoryId,
      status: error.status,
    });
  }
  return new DiscoveryError("DISCOVERY_CATEGORY_FAILED", "Categoria não disponível para discovery", {
    categoryId,
    status: error.status,
  });
}

export function createMeliHighlightsDiscoveryAdapter(
  options: MeliHighlightsDiscoveryAdapterOptions,
): MarketplaceDiscoveryAdapter {
  return Object.freeze({
    async discoverCategory(category: DiscoveryEligibleCategory): Promise<MarketplaceCategoryDiscoveryResult> {
      if (category.siteId !== "MLB" || !/^MLB[0-9]+$/.test(category.externalCategoryId)) {
        throw new DiscoveryError("DISCOVERY_PLAN_INVALID", "Categoria MLB inválida");
      }
      const before = options.client.requestCount;
      const started = performance.now();
      let response: ApiResponse<unknown>;
      try {
        response = await options.client.get<unknown>(`/highlights/MLB/category/${category.externalCategoryId}`);
      } catch (error) {
        const classified = classifiedError(error, category.externalCategoryId);
        const requestCount = Math.max(1, options.client.requestCount - before);
        throw new DiscoveryError(classified.code, classified.message, {
          ...classified.details,
          requestCount,
          retryCount: Math.max(0, requestCount - 1),
        });
      }
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      if (!isRecord(response.data)) schemaInvalid(category.externalCategoryId);
      const content = response.data.content === undefined ? [] : response.data.content;
      if (!Array.isArray(content) || content.length > MAX_HIGHLIGHTS) schemaInvalid(category.externalCategoryId);
      const occurrences: DiscoveryOccurrence[] = [];
      let productHighlights = 0;
      let itemHighlights = 0;
      let userProductHighlights = 0;
      let unsupportedHighlights = 0;
      const observedAt = options.nowIso();
      if (!Number.isFinite(Date.parse(observedAt))) schemaInvalid(category.externalCategoryId);
      for (const raw of content) {
        if (!isRecord(raw) || typeof raw.type !== "string") schemaInvalid(category.externalCategoryId);
        if (raw.type !== "PRODUCT" && raw.type !== "ITEM" && raw.type !== "USER_PRODUCT") {
          unsupportedHighlights += 1;
          continue;
        }
        if (typeof raw.id !== "string" || !expectedId(raw.type, raw.id)) schemaInvalid(category.externalCategoryId);
        const position = raw.position === undefined || raw.position === null ? null : raw.position;
        if (position !== null && (!Number.isInteger(position) || (position as number) < 1 || (position as number) > 20)) {
          schemaInvalid(category.externalCategoryId);
        }
        if (raw.type === "PRODUCT") productHighlights += 1;
        else if (raw.type === "ITEM") itemHighlights += 1;
        else userProductHighlights += 1;
        occurrences.push(Object.freeze({
          marketplaceKey: category.marketplaceKey,
          siteId: category.siteId,
          verticalKey: category.verticalKey,
          marketplaceCategoryId: category.marketplaceCategoryId,
          externalCategoryId: category.externalCategoryId,
          priorityTier: category.priorityTier,
          highlightType: raw.type,
          externalId: raw.id,
          position: position as number | null,
          observedAt,
          sourceContract: MELI_HIGHLIGHTS_CATEGORY_V1,
        }));
      }
      const requestCount = Math.max(1, options.client.requestCount - before);
      return Object.freeze({
        contractVersion: MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT,
        category,
        occurrences: Object.freeze(occurrences),
        rawHighlights: content.length,
        productHighlights,
        itemHighlights,
        userProductHighlights,
        unsupportedHighlights,
        requestCount,
        retryCount: Math.max(0, requestCount - 1),
        durationMs: response.durationMs >= 0 ? response.durationMs : elapsed,
      });
    },
  });
}
