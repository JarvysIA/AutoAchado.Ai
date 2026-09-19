import { DiscoveryError, type DiscoveryEligibleCategory } from "../../commerce/discovery/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DISCOVERY_REGISTRY_PAGE_SIZE = 1000;
const MAX_PAGES = 100_000;

// The Supabase edge has been refusing exactly one of several simultaneous registry reads with 401,
// a different table each time and with the same key. Reads are sequential and each one is retried
// a bounded number of times; only transient refusals qualify, so a real 400/404 still fails at once.
export const DISCOVERY_READ_RETRY_DELAYS_MS: readonly number[] = Object.freeze([500, 1500]);
const DISCOVERY_READ_MAX_ATTEMPTS = DISCOVERY_READ_RETRY_DELAYS_MS.length + 1;
const TRANSIENT_STATUS = Object.freeze([401, 408, 429]);

function transientStatus(status: number | undefined): boolean {
  return status !== undefined && (TRANSIENT_STATUS.includes(status) || (status >= 500 && status <= 599));
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export interface DiscoveryRegistryReadResult {
  readonly data: unknown;
  readonly error: unknown;
  readonly status?: number;
}

export interface DiscoveryRegistryReadQuery {
  select(columns: string): DiscoveryRegistryReadQuery;
  eq(column: string, value: string): DiscoveryRegistryReadQuery;
  order(column: string, options?: { ascending?: boolean }): DiscoveryRegistryReadQuery;
  range(from: number, to: number): PromiseLike<DiscoveryRegistryReadResult>;
}

export interface DiscoveryRegistryReadClient {
  from(table: string): DiscoveryRegistryReadQuery;
}

export function discoveryRegistryReadClientFromSupabase(client: SupabaseClient): DiscoveryRegistryReadClient {
  return Object.freeze({
    from(table: string): DiscoveryRegistryReadQuery {
      return client.from(table) as unknown as DiscoveryRegistryReadQuery;
    },
  });
}

export interface LoadDiscoveryEligibleCategoriesInput {
  readonly client: DiscoveryRegistryReadClient;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  /** Test seam for the retry backoff; production uses setTimeout. */
  readonly sleep?: (ms: number) => Promise<void>;
}

function fail(code: "DISCOVERY_REGISTRY_READ_FAILED" | "DISCOVERY_REGISTRY_RESPONSE_INVALID", message: string): never {
  throw new DiscoveryError(code, message);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Registro do Commerce Registry inválido");
  }
  return value as Record<string, unknown>;
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Campo textual do Commerce Registry inválido");
  }
  return value;
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  if (row[key] === null) return null;
  return text(row, key);
}

function bool(row: Record<string, unknown>, key: string): boolean {
  if (typeof row[key] !== "boolean") return fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Campo booleano inválido");
  return row[key] as boolean;
}

function uuid(row: Record<string, unknown>, key: string): string {
  const value = text(row, key);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "UUID do Commerce Registry inválido");
  }
  return value;
}

async function readPage(
  client: DiscoveryRegistryReadClient,
  table: string,
  columns: string,
  filters: readonly (readonly [string, string])[],
  orderBy: string,
  from: number,
  sleep: (ms: number) => Promise<void>,
): Promise<DiscoveryRegistryReadResult> {
  for (let attempt = 1; attempt <= DISCOVERY_READ_MAX_ATTEMPTS; attempt += 1) {
    let status: number | "NETWORK";
    try {
      let query = client.from(table).select(columns);
      for (const [column, value] of filters) query = query.eq(column, value);
      const result = await query.order(orderBy, { ascending: true }).range(from, from + DISCOVERY_REGISTRY_PAGE_SIZE - 1);
      if (result.error === null) return result;
      const httpStatus = typeof result.status === "number" ? result.status : undefined;
      if (!transientStatus(httpStatus)) return result;
      status = httpStatus as number;
    } catch {
      status = "NETWORK";
    }
    if (attempt === DISCOVERY_READ_MAX_ATTEMPTS) break;
    // Table name and status only: never the URL, headers or key.
    console.error(JSON.stringify({ event: "SUPABASE_READ_RETRY", table, status, attempt }));
    await sleep(DISCOVERY_READ_RETRY_DELAYS_MS[attempt - 1] as number);
  }
  return fail("DISCOVERY_REGISTRY_READ_FAILED", "Falha sanitizada ao ler o Commerce Registry");
}

async function pages(
  client: DiscoveryRegistryReadClient,
  table: string,
  columns: string,
  filters: readonly (readonly [string, string])[],
  orderBy: string,
  sleep: (ms: number) => Promise<void>,
): Promise<readonly unknown[]> {
  const output: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * DISCOVERY_REGISTRY_PAGE_SIZE;
    const result = await readPage(client, table, columns, filters, orderBy, from, sleep);
    if (result.error !== null || !Array.isArray(result.data)) {
      return fail(result.error === null ? "DISCOVERY_REGISTRY_RESPONSE_INVALID" : "DISCOVERY_REGISTRY_READ_FAILED",
        "Resposta sanitizada do Commerce Registry inválida");
    }
    output.push(...result.data);
    if (result.data.length < DISCOVERY_REGISTRY_PAGE_SIZE) return output;
  }
  return fail("DISCOVERY_REGISTRY_READ_FAILED", "Limite interno de paginação excedido");
}

function activeMaster(rows: readonly unknown[], keyName: string, expectedKey: string): string {
  if (rows.length !== 1) return fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Master record ausente ou duplicado");
  const row = record(rows[0]);
  if (text(row, keyName) !== expectedKey || !bool(row, "active")) {
    return fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Master record inativo ou divergente");
  }
  return text(row, "config_version");
}

export async function loadDiscoveryEligibleCategories(
  input: LoadDiscoveryEligibleCategoriesInput,
): Promise<readonly DiscoveryEligibleCategory[]> {
  for (const value of [input.marketplaceKey, input.siteId, input.verticalKey]) {
    if (value.trim().length === 0) fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Contexto de eligibility inválido");
  }
  // Sequential on purpose: the simultaneous burst is what the edge has been refusing.
  const sleep = input.sleep ?? realSleep;
  const marketplaceRows = await pages(input.client, "marketplaces", "marketplace_key,active,config_version",
    [["marketplace_key", input.marketplaceKey]], "marketplace_key", sleep);
  const verticalRows = await pages(input.client, "commerce_verticals", "vertical_key,active,config_version",
    [["vertical_key", input.verticalKey]], "vertical_key", sleep);
  const categoryRows = await pages(input.client, "marketplace_categories",
    "marketplace_category_id,marketplace_key,site_id,external_category_id,active,source_version,config_version",
    [["marketplace_key", input.marketplaceKey], ["site_id", input.siteId]], "external_category_id", sleep);
  const mappingRows = await pages(input.client, "vertical_category_mappings",
    "vertical_key,marketplace_category_id,scope_status,priority_tier,classification_version,manual_override,decision_source,active",
    [["vertical_key", input.verticalKey]], "marketplace_category_id", sleep);
  const marketplaceConfigVersion = activeMaster(marketplaceRows, "marketplace_key", input.marketplaceKey);
  const verticalConfigVersion = activeMaster(verticalRows, "vertical_key", input.verticalKey);
  const categories = new Map<string, Record<string, unknown>>();
  for (const value of categoryRows) {
    const row = record(value);
    const id = uuid(row, "marketplace_category_id");
    if (categories.has(id) || text(row, "marketplace_key") !== input.marketplaceKey || text(row, "site_id") !== input.siteId) {
      fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Categoria duplicada ou fora do contexto");
    }
    categories.set(id, row);
  }
  const eligible: DiscoveryEligibleCategory[] = [];
  const mappingIdentities = new Set<string>();
  for (const value of mappingRows) {
    const row = record(value);
    const categoryId = uuid(row, "marketplace_category_id");
    const identity = `${text(row, "vertical_key")}:${categoryId}`;
    if (mappingIdentities.has(identity)) fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Mapping duplicado");
    mappingIdentities.add(identity);
    if (text(row, "vertical_key") !== input.verticalKey) fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Mapping fora do contexto");
    const category = categories.get(categoryId);
    // A vertical may contain mappings for other marketplace/site contexts; they are outside this scoped join.
    if (!category) continue;
    const scope = text(row, "scope_status");
    const tier = nullableText(row, "priority_tier");
    const manualOverride = bool(row, "manual_override");
    const decisionSource = text(row, "decision_source");
    const classificationVersion = text(row, "classification_version");
    if (decisionSource !== "AUTO" && decisionSource !== "MANUAL") {
      fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Origem de decisão inválida");
    }
    if (manualOverride !== (decisionSource === "MANUAL")) fail("DISCOVERY_REGISTRY_RESPONSE_INVALID", "Decisão manual inconsistente");
    if (!bool(category, "active") || !bool(row, "active") || scope !== "ALLOWED" || (tier !== "A" && tier !== "B")) continue;
    eligible.push(Object.freeze({
      marketplaceCategoryId: categoryId,
      marketplaceKey: input.marketplaceKey,
      siteId: input.siteId,
      verticalKey: input.verticalKey,
      externalCategoryId: text(category, "external_category_id"),
      priorityTier: tier,
      manualOverride,
      decisionSource: decisionSource as "AUTO" | "MANUAL",
      classificationVersion,
      sourceVersion: nullableText(category, "source_version"),
      categoryConfigVersion: text(category, "config_version"),
      marketplaceConfigVersion,
      verticalConfigVersion,
    }));
  }
  return Object.freeze(eligible.sort((left, right) => left.externalCategoryId.localeCompare(right.externalCategoryId)));
}
