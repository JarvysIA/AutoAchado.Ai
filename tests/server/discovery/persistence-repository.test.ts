import { describe, expect, it } from "vitest";
import { AUTOMOTIVE_MLB_DISCOVERY_V1 } from "../../../src/commerce/discovery/planner.js";
import {
  COMMERCE_DISCOVERY_RUN_CONTRACT,
  MELI_HIGHLIGHTS_CATEGORY_V1,
  type DiscoveryOccurrence,
  type DiscoveryRunPlan,
  type DiscoveryRunResult,
} from "../../../src/commerce/discovery/types.js";
import {
  createDiscoveryPersistenceRepository,
  DISCOVERY_OCCURRENCE_BATCH_SIZE,
  DiscoveryPersistenceError,
  type DiscoveryPersistenceClient,
} from "../../../src/server/discovery/persistence-repository.js";

const RUN_1 = "10000000-0000-4000-8000-000000000001";
const RUN_2 = "10000000-0000-4000-8000-000000000002";
const CAT_A = "20000000-0000-4000-8000-000000000001";
const CAT_B = "20000000-0000-4000-8000-000000000002";
const DIGEST = "a".repeat(64);

const plan: DiscoveryRunPlan = {
  contractVersion: COMMERCE_DISCOVERY_RUN_CONTRACT,
  mode: "SMOKE",
  config: AUTOMOTIVE_MLB_DISCOVERY_V1,
  eligibleCategories: [],
  selectedCategories: [],
  registryDigest: DIGEST,
};

function occurrence(overrides: Partial<DiscoveryOccurrence> = {}): DiscoveryOccurrence {
  return {
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    verticalKey: "AUTOMOTIVE",
    marketplaceCategoryId: CAT_A,
    externalCategoryId: "MLB100",
    priorityTier: "A",
    highlightType: "PRODUCT",
    externalId: "MLB123",
    position: 1,
    observedAt: "2026-08-25T12:00:00.000Z",
    sourceContract: MELI_HIGHLIGHTS_CATEGORY_V1,
    ...overrides,
  };
}

function completedResult(): DiscoveryRunResult {
  return {
    contractVersion: COMMERCE_DISCOVERY_RUN_CONTRACT,
    mode: "SMOKE",
    persistenceMode: "DRY_RUN",
    registryDigest: DIGEST,
    outcomes: [], occurrences: [], candidates: [], fatalErrorCode: null,
    metrics: {
      eligibleCategories: 144, selectedCategories: 4, attemptedCategories: 4,
      successfulCategories: 4, failedCategories: 0, emptyCategories: 0, notAttemptedCategories: 0,
      apiRequests: 4, retryCount: 0, rawHighlights: 3, productHighlights: 1,
      itemHighlights: 1, userProductHighlights: 1, unsupportedHighlights: 0,
      acceptedCandidates: 1, uniqueCandidates: 1, duplicateOccurrences: 0, rateLimited: false,
      registryReadMs: 1, planningMs: 1, apiMs: 1, dedupMs: 1, persistenceMs: 0, totalMs: 4,
    },
  };
}

class FakeClient implements DiscoveryPersistenceClient {
  readonly runs = new Map<string, Record<string, unknown>>();
  readonly occurrences = new Map<string, Record<string, unknown>>();
  readonly batches: number[] = [];
  readonly categories = new Map([
    [CAT_A, { marketplace_category_id: CAT_A, marketplace_key: "MERCADO_LIVRE", site_id: "MLB", external_category_id: "MLB100" }],
    [CAT_B, { marketplace_category_id: CAT_B, marketplace_key: "MERCADO_LIVRE", site_id: "MLB", external_category_id: "MLB200" }],
  ]);
  nextRunId = RUN_1;

  createRun: DiscoveryPersistenceClient["createRun"] = async (row) => {
    const identity = `${row.job_type}:${row.scheduled_bucket}:${row.shard_key}`;
    if (![...this.runs.values()].some((run) => `${run.job_type}:${run.scheduled_bucket}:${run.shard_key}` === identity)) {
      this.runs.set(this.nextRunId, {
        run_id: this.nextRunId, finished_at: null, request_count: 0, error_counts: {}, rate_limited: false,
        ...row,
      });
    }
    return { data: null, error: null };
  };
  async findRunByIdentity(jobType: string, bucket: string, shard: string) {
    return { data: [...this.runs.values()].find((row) => row.job_type === jobType && row.scheduled_bucket === bucket && row.shard_key === shard) ?? null, error: null };
  }
  async findCategories(ids: readonly string[]) {
    return { data: ids.flatMap((id) => this.categories.has(id) ? [this.categories.get(id)!] : []), error: null };
  }
  async upsertOccurrences(rows: readonly Readonly<Record<string, unknown>>[]) {
    this.batches.push(rows.length);
    for (const row of rows) {
      const key = `${row.run_id}:${row.marketplace_category_id}:${row.type}:${row.product_id}`;
      if (!this.occurrences.has(key)) this.occurrences.set(key, { ...row });
    }
    return { data: null, error: null };
  }
  async updateRun(runId: string, values: Readonly<Record<string, unknown>>) {
    const run = this.runs.get(runId);
    if (!run) return { data: null, error: null };
    const updated = { ...run, ...values };
    this.runs.set(runId, updated);
    return { data: updated, error: null };
  }
  async findRun(runId: string) { return { data: this.runs.get(runId) ?? null, error: null }; }
  async findOccurrences(runId: string) {
    return { data: [...this.occurrences.values()].filter((row) => row.run_id === runId), error: null };
  }
}

async function begin(client: FakeClient, bucket = "2026-08-25T12:00:00.000Z") {
  return createDiscoveryPersistenceRepository(client).beginDiscoveryRun({
    plan, scheduledBucket: bucket, shardKey: "AUTOMOTIVE:SMOKE", startedAt: bucket,
  });
}

describe("discovery persistence repository", () => {
  it("starts and safely replays the same discovery run identity", async () => {
    const client = new FakeClient();
    const first = await begin(client);
    const replay = await begin(client);
    expect(first.runId).toBe(RUN_1);
    expect(replay.runId).toBe(RUN_1);
    expect(client.runs.size).toBe(1);
  });

  it("persists typed identities, same-run idempotency, and multi-category provenance", async () => {
    const client = new FakeClient();
    const repository = createDiscoveryPersistenceRepository(client);
    await begin(client);
    const rows = [
      occurrence(), occurrence({ position: 2 }),
      occurrence({ highlightType: "ITEM" }),
      occurrence({ highlightType: "USER_PRODUCT", externalId: "MLBU123" }),
      occurrence({ marketplaceCategoryId: CAT_B, externalCategoryId: "MLB200", priorityTier: "B" }),
    ];
    expect(await repository.persistDiscoveryOccurrences(RUN_1, rows)).toBe(4);
    expect(await repository.persistDiscoveryOccurrences(RUN_1, rows)).toBe(4);
    expect(client.occurrences.size).toBe(4);
    expect([...client.occurrences.keys()].filter((key) => key.endsWith(":PRODUCT:MLB123"))).toHaveLength(2);
    expect([...client.occurrences.keys()].some((key) => key.endsWith(":ITEM:MLB123"))).toBe(true);
    expect([...client.occurrences.values()].find((row) => row.type === "PRODUCT" && row.marketplace_category_id === CAT_A)?.position).toBe(1);
  });

  it("preserves recurrence in another run", async () => {
    const client = new FakeClient();
    const repository = createDiscoveryPersistenceRepository(client);
    await begin(client);
    await repository.persistDiscoveryOccurrences(RUN_1, [occurrence()]);
    client.nextRunId = RUN_2;
    await begin(client, "2026-08-26T12:00:00.000Z");
    await repository.persistDiscoveryOccurrences(RUN_2, [occurrence({ observedAt: "2026-08-26T12:00:00.000Z" })]);
    expect(client.occurrences.size).toBe(2);
  });

  it("uses bounded bulk writes", async () => {
    const client = new FakeClient();
    const repository = createDiscoveryPersistenceRepository(client);
    await begin(client);
    const rows = Array.from({ length: DISCOVERY_OCCURRENCE_BATCH_SIZE + 1 }, (_, index) => occurrence({ externalId: `MLB${1000 + index}` }));
    expect(await repository.persistDiscoveryOccurrences(RUN_1, rows)).toBe(DISCOVERY_OCCURRENCE_BATCH_SIZE + 1);
    expect(client.batches).toEqual([DISCOVERY_OCCURRENCE_BATCH_SIZE, 1]);
  });

  it("rejects a category outside the canonical registry and unknown occurrence types", async () => {
    const client = new FakeClient();
    const repository = createDiscoveryPersistenceRepository(client);
    await begin(client);
    await expect(repository.persistDiscoveryOccurrences(RUN_1, [occurrence({ marketplaceCategoryId: "20000000-0000-4000-8000-000000000099" })]))
      .rejects.toMatchObject({ code: "DISCOVERY_PERSISTENCE_INVALID_CATEGORY" });
    await expect(repository.persistDiscoveryOccurrences(RUN_1, [occurrence({ highlightType: "UNKNOWN" as "PRODUCT" })]))
      .rejects.toMatchObject({ code: "DISCOVERY_PERSISTENCE_INVALID_OCCURRENCE" });
  });

  it("finalizes and reads a sanitized verification view", async () => {
    const client = new FakeClient();
    const repository = createDiscoveryPersistenceRepository(client);
    await begin(client);
    await repository.persistDiscoveryOccurrences(RUN_1, [occurrence()]);
    const completed = await repository.completeDiscoveryRun({
      runId: RUN_1, result: completedResult(), status: "COMPLETED", finishedAt: "2026-08-25T12:01:00.000Z",
    });
    const verification = await repository.readDiscoveryRunForVerification(RUN_1);
    expect(completed).toMatchObject({ status: "COMPLETED", requestCount: 4, rateLimited: false });
    expect(verification.occurrences).toHaveLength(1);
  });

  it("never exposes raw client errors", async () => {
    const canary = "Bearer secret-canary";
    const client = new FakeClient();
    client.createRun = async () => ({ data: null, error: new Error(canary) });
    await expect(begin(client)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(DiscoveryPersistenceError);
      expect(String(error)).not.toContain(canary);
      return true;
    });
  });
});
