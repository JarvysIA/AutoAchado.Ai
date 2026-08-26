import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMMERCE_DISCOVERY_RUN_CONTRACT,
  MELI_HIGHLIGHTS_CATEGORY_V1,
  type DiscoveryOccurrence,
  type DiscoveryRunMode,
  type DiscoveryRunPlan,
  type DiscoveryRunResult,
} from "../../commerce/discovery/types.js";

export const DISCOVERY_PERSISTENCE_JOB_TYPE = "COMMERCE_DISCOVERY" as const;
export const DISCOVERY_OCCURRENCE_BATCH_SIZE = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export type DiscoveryPersistenceErrorCode =
  | "DISCOVERY_PERSISTENCE_INVALID_RUN"
  | "DISCOVERY_PERSISTENCE_INVALID_CATEGORY"
  | "DISCOVERY_PERSISTENCE_INVALID_OCCURRENCE"
  | "DISCOVERY_PERSISTENCE_RUN_NOT_FOUND"
  | "DISCOVERY_PERSISTENCE_WRITE_FAILED"
  | "DISCOVERY_PERSISTENCE_READ_FAILED";

export class DiscoveryPersistenceError extends Error {
  constructor(readonly code: DiscoveryPersistenceErrorCode, message: string) {
    super(message);
    this.name = "DiscoveryPersistenceError";
  }
}

interface PersistenceResult<T> {
  readonly data: T;
  readonly error: unknown;
}

interface DiscoveryCategoryReference {
  readonly marketplace_category_id: string;
  readonly marketplace_key: string;
  readonly site_id: string;
  readonly external_category_id: string;
}

interface DiscoveryOccurrenceRow {
  readonly run_id: string;
  readonly marketplace_category_id: string | null;
  readonly product_id: string;
  readonly observed_at: string;
  readonly observed_bucket: string;
  readonly position: number | null;
  readonly type: string;
  readonly source_contract: string | null;
  readonly priority_tier: string | null;
}

export interface DiscoveryPersistenceClient {
  createRun(row: Readonly<Record<string, unknown>>): Promise<PersistenceResult<unknown>>;
  findRunByIdentity(jobType: string, scheduledBucket: string, shardKey: string): Promise<PersistenceResult<unknown>>;
  findCategories(ids: readonly string[]): Promise<PersistenceResult<unknown>>;
  upsertOccurrences(rows: readonly Readonly<Record<string, unknown>>[]): Promise<PersistenceResult<unknown>>;
  updateRun(runId: string, values: Readonly<Record<string, unknown>>): Promise<PersistenceResult<unknown>>;
  findRun(runId: string): Promise<PersistenceResult<unknown>>;
  findOccurrences(runId: string): Promise<PersistenceResult<unknown>>;
}

export interface BeginDiscoveryRunInput {
  readonly plan: DiscoveryRunPlan;
  readonly scheduledBucket: string;
  readonly shardKey: string;
  readonly startedAt: string;
}

export interface CompleteDiscoveryRunInput {
  readonly runId: string;
  readonly result: DiscoveryRunResult;
  readonly status: "COMPLETED" | "PARTIAL" | "FAILED";
  readonly finishedAt: string;
}

export interface PersistedDiscoveryRun {
  readonly runId: string;
  readonly scheduledBucket: string;
  readonly shardKey: string;
  readonly status: "PENDING" | "RUNNING" | "PARTIAL" | "COMPLETED" | "FAILED";
  readonly mode: DiscoveryRunMode;
  readonly registryDigest: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly requestCount: number;
  readonly rateLimited: boolean;
}

export interface DiscoveryRunVerification {
  readonly run: PersistedDiscoveryRun;
  readonly occurrences: readonly DiscoveryOccurrenceRow[];
}

export interface DiscoveryPersistenceRepository {
  beginDiscoveryRun(input: BeginDiscoveryRunInput): Promise<PersistedDiscoveryRun>;
  persistDiscoveryOccurrences(runId: string, occurrences: readonly DiscoveryOccurrence[]): Promise<number>;
  completeDiscoveryRun(input: CompleteDiscoveryRunInput): Promise<PersistedDiscoveryRun>;
  readDiscoveryRunForVerification(runId: string): Promise<DiscoveryRunVerification>;
}

function fail(code: DiscoveryPersistenceErrorCode, message: string): never {
  throw new DiscoveryPersistenceError(code, message);
}

function record(value: unknown, code: DiscoveryPersistenceErrorCode): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(code, "Resposta de persistence inválida");
  return value as Record<string, unknown>;
}

function text(row: Record<string, unknown>, key: string, code: DiscoveryPersistenceErrorCode): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) fail(code, "Campo de persistence inválido");
  return value;
}

function timestamp(value: string, code: DiscoveryPersistenceErrorCode): void {
  if (!ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail(code, "Timestamp de persistence inválido");
}

function validatePlan(plan: DiscoveryRunPlan): void {
  if (plan.contractVersion !== COMMERCE_DISCOVERY_RUN_CONTRACT
    || plan.config.configVersion !== "automotive-mlb-discovery/v1"
    || plan.config.adapterVersion !== "meli-highlights-discovery/v1"
    || plan.config.marketplaceKey !== "MERCADO_LIVRE"
    || plan.config.siteId !== "MLB"
    || plan.config.verticalKey !== "AUTOMOTIVE"
    || (plan.mode !== "SMOKE" && plan.mode !== "FULL_SWEEP")
    || !SHA256.test(plan.registryDigest)) {
    fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Contrato de discovery run inválido");
  }
}

function parseRun(value: unknown): PersistedDiscoveryRun {
  const row = record(value, "DISCOVERY_PERSISTENCE_READ_FAILED");
  const runId = text(row, "run_id", "DISCOVERY_PERSISTENCE_READ_FAILED");
  const mode = text(row, "run_mode", "DISCOVERY_PERSISTENCE_READ_FAILED");
  const status = text(row, "status", "DISCOVERY_PERSISTENCE_READ_FAILED");
  const digest = text(row, "registry_digest", "DISCOVERY_PERSISTENCE_READ_FAILED");
  if (!UUID.test(runId) || (mode !== "SMOKE" && mode !== "FULL_SWEEP")
    || !["PENDING", "RUNNING", "PARTIAL", "COMPLETED", "FAILED"].includes(status)
    || !SHA256.test(digest) || typeof row.request_count !== "number" || typeof row.rate_limited !== "boolean") {
    fail("DISCOVERY_PERSISTENCE_READ_FAILED", "Discovery run persistido inválido");
  }
  return Object.freeze({
    runId,
    scheduledBucket: text(row, "scheduled_bucket", "DISCOVERY_PERSISTENCE_READ_FAILED"),
    shardKey: text(row, "shard_key", "DISCOVERY_PERSISTENCE_READ_FAILED"),
    status: status as PersistedDiscoveryRun["status"],
    mode,
    registryDigest: digest,
    startedAt: row.started_at === null ? null : text(row, "started_at", "DISCOVERY_PERSISTENCE_READ_FAILED"),
    finishedAt: row.finished_at === null ? null : text(row, "finished_at", "DISCOVERY_PERSISTENCE_READ_FAILED"),
    requestCount: row.request_count,
    rateLimited: row.rate_limited,
  });
}

function validateOccurrence(value: DiscoveryOccurrence): void {
  const validId = value.highlightType === "USER_PRODUCT" ? /^MLBU[0-9]+$/.test(value.externalId) : /^MLB[0-9]+$/.test(value.externalId);
  if (!UUID.test(value.marketplaceCategoryId) || value.marketplaceKey !== "MERCADO_LIVRE" || value.siteId !== "MLB"
    || value.verticalKey !== "AUTOMOTIVE" || !/^MLB[0-9]+$/.test(value.externalCategoryId)
    || !["PRODUCT", "ITEM", "USER_PRODUCT"].includes(value.highlightType) || !validId
    || (value.position !== null && (!Number.isInteger(value.position) || value.position < 1 || value.position > 20))
    || value.sourceContract !== MELI_HIGHLIGHTS_CATEGORY_V1) {
    fail("DISCOVERY_PERSISTENCE_INVALID_OCCURRENCE", "Occurrence de discovery inválida");
  }
  timestamp(value.observedAt, "DISCOVERY_PERSISTENCE_INVALID_OCCURRENCE");
}

function occurrenceKey(value: DiscoveryOccurrence): string {
  return `${value.marketplaceCategoryId}:${value.highlightType}:${value.externalId}`;
}

export function discoveryPersistenceClientFromSupabase(client: SupabaseClient): DiscoveryPersistenceClient {
  const runColumns = "run_id,scheduled_bucket,job_type,shard_key,status,config_version,contract_version,adapter_version,marketplace_key,site_id,vertical_key,run_mode,registry_digest,started_at,finished_at,request_count,error_counts,rate_limited";
  const occurrenceColumns = "run_id,marketplace_category_id,product_id,observed_at,observed_bucket,position,type,source_contract,priority_tier";
  const persistenceClient: DiscoveryPersistenceClient = {
    async createRun(row) {
      const result = await client.from("scan_runs").upsert(row, {
        onConflict: "job_type,scheduled_bucket,shard_key",
        ignoreDuplicates: true,
      });
      return { data: result.data, error: result.error };
    },
    async findRunByIdentity(jobType, scheduledBucket, shardKey) {
      const result = await client.from("scan_runs").select(runColumns).eq("job_type", jobType)
        .eq("scheduled_bucket", scheduledBucket).eq("shard_key", shardKey).maybeSingle();
      return { data: result.data, error: result.error };
    },
    async findCategories(ids) {
      const result = await client.from("marketplace_categories")
        .select("marketplace_category_id,marketplace_key,site_id,external_category_id")
        .in("marketplace_category_id", [...ids]);
      return { data: result.data, error: result.error };
    },
    async upsertOccurrences(rows) {
      const result = await client.from("highlight_snapshots").upsert([...rows], {
        onConflict: "run_id,marketplace_category_id,type,product_id",
        ignoreDuplicates: true,
      });
      return { data: result.data, error: result.error };
    },
    async updateRun(runId, values) {
      const result = await client.from("scan_runs").update(values).eq("run_id", runId).select(runColumns).maybeSingle();
      return { data: result.data, error: result.error };
    },
    async findRun(runId) {
      const result = await client.from("scan_runs").select(runColumns).eq("run_id", runId).maybeSingle();
      return { data: result.data, error: result.error };
    },
    async findOccurrences(runId) {
      const result = await client.from("highlight_snapshots").select(occurrenceColumns).eq("run_id", runId)
        .order("marketplace_category_id", { ascending: true }).order("type", { ascending: true })
        .order("product_id", { ascending: true });
      return { data: result.data, error: result.error };
    },
  };
  return Object.freeze(persistenceClient);
}

export function createDiscoveryPersistenceRepository(client: DiscoveryPersistenceClient): DiscoveryPersistenceRepository {
  const repository: DiscoveryPersistenceRepository = {
    async beginDiscoveryRun(input) {
      validatePlan(input.plan);
      timestamp(input.scheduledBucket, "DISCOVERY_PERSISTENCE_INVALID_RUN");
      timestamp(input.startedAt, "DISCOVERY_PERSISTENCE_INVALID_RUN");
      if (input.shardKey.trim().length === 0) fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Shard de discovery inválido");
      const created = await client.createRun({
        scheduled_bucket: input.scheduledBucket,
        job_type: DISCOVERY_PERSISTENCE_JOB_TYPE,
        shard_key: input.shardKey,
        status: "RUNNING",
        config_version: input.plan.config.configVersion,
        contract_version: input.plan.contractVersion,
        adapter_version: input.plan.config.adapterVersion,
        marketplace_key: input.plan.config.marketplaceKey,
        site_id: input.plan.config.siteId,
        vertical_key: input.plan.config.verticalKey,
        run_mode: input.plan.mode,
        registry_digest: input.plan.registryDigest,
        started_at: input.startedAt,
      });
      if (created.error !== null) fail("DISCOVERY_PERSISTENCE_WRITE_FAILED", "Falha sanitizada ao iniciar discovery run");
      const found = await client.findRunByIdentity(DISCOVERY_PERSISTENCE_JOB_TYPE, input.scheduledBucket, input.shardKey);
      if (found.error !== null) fail("DISCOVERY_PERSISTENCE_READ_FAILED", "Falha sanitizada ao verificar discovery run");
      if (found.data === null) fail("DISCOVERY_PERSISTENCE_RUN_NOT_FOUND", "Discovery run não encontrado");
      const run = parseRun(found.data);
      if (run.mode !== input.plan.mode || run.registryDigest !== input.plan.registryDigest) {
        fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Replay conflita com a identidade do discovery run");
      }
      return run;
    },

    async persistDiscoveryOccurrences(runId, occurrences) {
      if (!UUID.test(runId)) fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Run ID inválido");
      const unique = new Map<string, DiscoveryOccurrence>();
      for (const occurrence of occurrences) {
        validateOccurrence(occurrence);
        const key = occurrenceKey(occurrence);
        if (!unique.has(key)) unique.set(key, occurrence);
      }
      if (unique.size === 0) return 0;
      const values = [...unique.values()];
      const categoryIds = [...new Set(values.map((value) => value.marketplaceCategoryId))];
      const categoriesResult = await client.findCategories(categoryIds);
      if (categoriesResult.error !== null || !Array.isArray(categoriesResult.data)) {
        fail("DISCOVERY_PERSISTENCE_READ_FAILED", "Falha sanitizada ao validar categorias canônicas");
      }
      const categories = new Map<string, DiscoveryCategoryReference>();
      for (const value of categoriesResult.data) {
        const row = record(value, "DISCOVERY_PERSISTENCE_READ_FAILED");
        const id = text(row, "marketplace_category_id", "DISCOVERY_PERSISTENCE_READ_FAILED");
        categories.set(id, row as unknown as DiscoveryCategoryReference);
      }
      for (const occurrence of values) {
        const category = categories.get(occurrence.marketplaceCategoryId);
        if (!category || category.marketplace_key !== occurrence.marketplaceKey || category.site_id !== occurrence.siteId
          || category.external_category_id !== occurrence.externalCategoryId) {
          fail("DISCOVERY_PERSISTENCE_INVALID_CATEGORY", "Categoria canônica da occurrence inválida");
        }
      }
      for (let offset = 0; offset < values.length; offset += DISCOVERY_OCCURRENCE_BATCH_SIZE) {
        const rows = values.slice(offset, offset + DISCOVERY_OCCURRENCE_BATCH_SIZE).map((occurrence) => ({
          run_id: runId,
          category_id: null,
          marketplace_category_id: occurrence.marketplaceCategoryId,
          product_id: occurrence.externalId,
          observed_at: occurrence.observedAt,
          observed_bucket: occurrence.observedAt,
          position: occurrence.position,
          type: occurrence.highlightType,
          source_contract: occurrence.sourceContract,
          priority_tier: occurrence.priorityTier,
        }));
        const result = await client.upsertOccurrences(rows);
        if (result.error !== null) fail("DISCOVERY_PERSISTENCE_WRITE_FAILED", "Falha sanitizada ao persistir occurrences");
      }
      return values.length;
    },

    async completeDiscoveryRun(input) {
      if (!UUID.test(input.runId) || !["COMPLETED", "PARTIAL", "FAILED"].includes(input.status)) {
        fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Finalização de discovery run inválida");
      }
      timestamp(input.finishedAt, "DISCOVERY_PERSISTENCE_INVALID_RUN");
      if (input.result.contractVersion !== COMMERCE_DISCOVERY_RUN_CONTRACT) {
        fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Resultado de discovery incompatível");
      }
      const current = await client.findRun(input.runId);
      if (current.error !== null) fail("DISCOVERY_PERSISTENCE_READ_FAILED", "Falha sanitizada ao validar discovery run");
      if (current.data === null) fail("DISCOVERY_PERSISTENCE_RUN_NOT_FOUND", "Discovery run não encontrado");
      const currentRun = parseRun(current.data);
      if (currentRun.registryDigest !== input.result.registryDigest || currentRun.mode !== input.result.mode) {
        fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Resultado diverge do discovery run persistido");
      }
      const result = await client.updateRun(input.runId, {
        status: input.status,
        finished_at: input.finishedAt,
        request_count: input.result.metrics.apiRequests,
        error_counts: {
          failedCategories: input.result.metrics.failedCategories,
          notAttemptedCategories: input.result.metrics.notAttemptedCategories,
          unsupportedHighlights: input.result.metrics.unsupportedHighlights,
          fatalErrorCode: input.result.fatalErrorCode,
        },
        rate_limited: input.result.metrics.rateLimited,
        cursor: {
          selectedCategories: input.result.metrics.selectedCategories,
          attemptedCategories: input.result.metrics.attemptedCategories,
          uniqueCandidates: input.result.metrics.uniqueCandidates,
        },
      });
      if (result.error !== null) fail("DISCOVERY_PERSISTENCE_WRITE_FAILED", "Falha sanitizada ao finalizar discovery run");
      if (result.data === null) fail("DISCOVERY_PERSISTENCE_RUN_NOT_FOUND", "Discovery run não encontrado");
      return parseRun(result.data);
    },

    async readDiscoveryRunForVerification(runId) {
      if (!UUID.test(runId)) fail("DISCOVERY_PERSISTENCE_INVALID_RUN", "Run ID inválido");
      const [runResult, occurrenceResult] = await Promise.all([client.findRun(runId), client.findOccurrences(runId)]);
      if (runResult.error !== null || occurrenceResult.error !== null) {
        fail("DISCOVERY_PERSISTENCE_READ_FAILED", "Falha sanitizada ao verificar discovery persistence");
      }
      if (runResult.data === null) fail("DISCOVERY_PERSISTENCE_RUN_NOT_FOUND", "Discovery run não encontrado");
      if (!Array.isArray(occurrenceResult.data)) fail("DISCOVERY_PERSISTENCE_READ_FAILED", "Occurrences persistidas inválidas");
      return Object.freeze({
        run: parseRun(runResult.data),
        occurrences: Object.freeze(occurrenceResult.data.map((value) => Object.freeze(
          record(value, "DISCOVERY_PERSISTENCE_READ_FAILED") as unknown as DiscoveryOccurrenceRow,
        ))),
      });
    },
  };
  return Object.freeze(repository);
}
