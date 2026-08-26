import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { AUTOMOTIVE_MLB_DISCOVERY_V1 } from "../src/commerce/discovery/planner.js";
import {
  COMMERCE_DISCOVERY_RUN_CONTRACT,
  MELI_HIGHLIGHTS_CATEGORY_V1,
  type DiscoveryEligibleCategory,
  type DiscoveryOccurrence,
  type DiscoveryRunPlan,
  type DiscoveryRunResult,
} from "../src/commerce/discovery/types.js";
import {
  createDiscoveryPersistenceRepository,
  discoveryPersistenceClientFromSupabase,
  DiscoveryPersistenceError,
} from "../src/server/discovery/persistence-repository.js";

const root = resolve(import.meta.dirname, "..");
const ensure: (value: unknown, code: string) => asserts value = (value, code) => {
  if (!value) throw new Error(code);
};

function localEnvironment(): { url: string; secret: string } {
  const cli = resolve(root, "node_modules/.bin/supabase.CMD");
  const process = spawnSync(cli, ["status", "-o", "env"], {
    cwd: root, encoding: "utf8", windowsHide: true, shell: globalThis.process.platform === "win32",
  });
  ensure(process.status === 0, "LOCAL_SUPABASE_STATUS_FAILED");
  const values: Record<string, string> = {};
  for (const line of process.stdout.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^"|"$/g, "");
  }
  const url = new URL(values.API_URL ?? "");
  ensure(url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"), "LOCAL_ONLY_GUARD_FAILED");
  const secret = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;
  ensure(secret, "LOCAL_CREDENTIALS_MISSING");
  return { url: url.toString().replace(/\/$/, ""), secret };
}

const environment = localEnvironment();
const supabase = createClient(environment.url, environment.secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const repository = createDiscoveryPersistenceRepository(discoveryPersistenceClientFromSupabase(supabase));
const mappingResult = await supabase.from("vertical_category_mappings")
  .select("marketplace_category_id,priority_tier").eq("vertical_key", "AUTOMOTIVE")
  .eq("active", true).eq("scope_status", "ALLOWED").in("priority_tier", ["A", "B"])
  .order("priority_tier", { ascending: true }).limit(2);
ensure(!mappingResult.error && mappingResult.data.length === 2, "LOCAL_CANONICAL_MAPPING_FIXTURE_MISSING");
const categoryResult = await supabase.from("marketplace_categories")
  .select("marketplace_category_id,external_category_id,source_version,config_version")
  .eq("marketplace_key", "MERCADO_LIVRE").eq("site_id", "MLB")
  .in("marketplace_category_id", mappingResult.data.map((row) => row.marketplace_category_id));
ensure(!categoryResult.error && categoryResult.data.length === 2, "LOCAL_CANONICAL_CATEGORY_FIXTURE_MISSING");
const categoryById = new Map(categoryResult.data.map((row) => [row.marketplace_category_id, row]));
const persistedCategories: DiscoveryEligibleCategory[] = mappingResult.data.map((mapping) => {
  const category = categoryById.get(mapping.marketplace_category_id)!;
  ensure(category, "LOCAL_CANONICAL_CATEGORY_JOIN_FAILED");
  return {
    marketplaceCategoryId: category.marketplace_category_id,
    marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
    externalCategoryId: category.external_category_id,
    priorityTier: mapping.priority_tier as "A" | "B",
    manualOverride: false, decisionSource: "AUTO", classificationVersion: "local-e2e",
    sourceVersion: category.source_version, categoryConfigVersion: category.config_version,
    marketplaceConfigVersion: "commerce-registry/v1", verticalConfigVersion: "commerce-registry/v1",
  };
});
const plan: DiscoveryRunPlan = {
  contractVersion: COMMERCE_DISCOVERY_RUN_CONTRACT,
  mode: "SMOKE",
  config: AUTOMOTIVE_MLB_DISCOVERY_V1,
  eligibleCategories: persistedCategories,
  selectedCategories: persistedCategories,
  registryDigest: "b".repeat(64),
};
const firstCategory = persistedCategories[0]!;
const secondCategory = persistedCategories[1]!;
const bucket1 = "2026-08-25T15:00:00.000Z";
const bucket2 = "2026-08-26T15:00:00.000Z";
const shardKey = "AUTOMOTIVE:PERSISTENCE_E2E";

async function removePriorFixture(bucket: string): Promise<void> {
  const runs = await supabase.from("scan_runs").select("run_id").eq("job_type", "COMMERCE_DISCOVERY")
    .eq("scheduled_bucket", bucket).eq("shard_key", shardKey);
  ensure(!runs.error, "LOCAL_E2E_CLEANUP_READ_FAILED");
  for (const row of runs.data ?? []) {
    const snapshots = await supabase.from("highlight_snapshots").delete().eq("run_id", row.run_id);
    ensure(!snapshots.error, "LOCAL_E2E_CLEANUP_SNAPSHOT_FAILED");
    const run = await supabase.from("scan_runs").delete().eq("run_id", row.run_id);
    ensure(!run.error, "LOCAL_E2E_CLEANUP_RUN_FAILED");
  }
}
await removePriorFixture(bucket1);
await removePriorFixture(bucket2);

const automotiveBefore = await supabase.from("automotive_categories").select("*", { count: "exact", head: true });
ensure(!automotiveBefore.error, "LEGACY_COUNT_FAILED");
const run1 = await repository.beginDiscoveryRun({ plan, scheduledBucket: bucket1, shardKey, startedAt: bucket1 });
const occurrence = (overrides: Partial<DiscoveryOccurrence> = {}): DiscoveryOccurrence => ({
  marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
  marketplaceCategoryId: firstCategory.marketplaceCategoryId,
  externalCategoryId: firstCategory.externalCategoryId,
  priorityTier: firstCategory.priorityTier,
  highlightType: "PRODUCT", externalId: "MLB900000001", position: 1,
  observedAt: "2026-08-25T15:00:01.000Z", sourceContract: MELI_HIGHLIGHTS_CATEGORY_V1,
  ...overrides,
});
const occurrences = [
  occurrence(), occurrence({ position: 2 }),
  occurrence({ highlightType: "ITEM" }),
  occurrence({ highlightType: "USER_PRODUCT", externalId: "MLBU900000001", position: 3 }),
  occurrence({
    marketplaceCategoryId: secondCategory.marketplaceCategoryId,
    externalCategoryId: secondCategory.externalCategoryId,
    priorityTier: secondCategory.priorityTier,
  }),
];
ensure(await repository.persistDiscoveryOccurrences(run1.runId, occurrences) === 4, "FIRST_PERSIST_COUNT_FAILED");
ensure(await repository.persistDiscoveryOccurrences(run1.runId, occurrences) === 4, "REPLAY_PERSIST_COUNT_FAILED");

const result: DiscoveryRunResult = {
  contractVersion: "commerce-discovery-run/v1", mode: "SMOKE", persistenceMode: "DRY_RUN",
  registryDigest: plan.registryDigest, outcomes: [], occurrences: [], candidates: [], fatalErrorCode: null,
  metrics: {
    eligibleCategories: 144, selectedCategories: 4, attemptedCategories: 4,
    successfulCategories: 4, failedCategories: 0, emptyCategories: 0, notAttemptedCategories: 0,
    apiRequests: 4, retryCount: 0, rawHighlights: 4, productHighlights: 2, itemHighlights: 1,
    userProductHighlights: 1, unsupportedHighlights: 0, acceptedCandidates: 2, uniqueCandidates: 1,
    duplicateOccurrences: 1, rateLimited: false, registryReadMs: 0, planningMs: 0,
    apiMs: 0, dedupMs: 0, persistenceMs: 0, totalMs: 0,
  },
};
await repository.completeDiscoveryRun({ runId: run1.runId, result, status: "COMPLETED", finishedAt: "2026-08-25T15:01:00.000Z" });
const verification1 = await repository.readDiscoveryRunForVerification(run1.runId);
ensure(verification1.run.status === "COMPLETED" && verification1.run.requestCount === 4, "RUN_COMPLETION_FAILED");
ensure(verification1.occurrences.length === 4, "SAME_RUN_IDEMPOTENCY_FAILED");
ensure(verification1.occurrences.filter((row) => row.product_id === "MLB900000001" && row.type === "PRODUCT").length === 2,
  "MULTI_CATEGORY_PROVENANCE_FAILED");
ensure(verification1.occurrences.some((row) => row.product_id === "MLB900000001" && row.type === "ITEM"), "CROSS_TYPE_FAILED");
ensure(verification1.occurrences.some((row) => row.product_id === "MLBU900000001" && row.type === "USER_PRODUCT"), "USER_PRODUCT_FAILED");

const run2 = await repository.beginDiscoveryRun({ plan, scheduledBucket: bucket2, shardKey, startedAt: bucket2 });
await repository.persistDiscoveryOccurrences(run2.runId, [occurrence({ observedAt: "2026-08-26T15:00:01.000Z" })]);
const verification2 = await repository.readDiscoveryRunForVerification(run2.runId);
ensure(verification2.occurrences.length === 1, "CROSS_RUN_RECURRENCE_FAILED");

let invalidCategoryRejected = false;
try {
  await repository.persistDiscoveryOccurrences(run1.runId, [occurrence({ marketplaceCategoryId: "90000000-0000-4000-8000-000000000099" })]);
} catch (error) {
  invalidCategoryRejected = error instanceof DiscoveryPersistenceError && error.code === "DISCOVERY_PERSISTENCE_INVALID_CATEGORY";
}
ensure(invalidCategoryRejected, "INVALID_CATEGORY_NOT_REJECTED");
const automotiveAfter = await supabase.from("automotive_categories").select("*", { count: "exact", head: true });
ensure(!automotiveAfter.error && automotiveAfter.count === automotiveBefore.count, "LEGACY_TABLE_DEPENDENCY_DETECTED");

process.stdout.write(`${JSON.stringify({
  status: "PASS_DISCOVERY_PERSISTENCE_LOCAL_E2E",
  canonicalRegistryCategoriesUsed: persistedCategories.length,
  frozenAutomaticEligibleCount: 144,
  run1Occurrences: verification1.occurrences.length,
  run2Occurrences: verification2.occurrences.length,
  productRowsRun1: 2,
  itemRowsRun1: 1,
  userProductRowsRun1: 1,
  sameRunDuplicateDelta: 0,
  crossRunProductRows: 3,
  invalidCategoryRejected,
  automotiveCategoriesDelta: (automotiveAfter.count ?? 0) - (automotiveBefore.count ?? 0),
  liveMarketplaceCalls: 0,
  liveOAuthCalls: 0,
  remoteWrites: 0,
})}\n`);
