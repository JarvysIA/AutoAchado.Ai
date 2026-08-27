import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTOMOTIVE_MLB_DISCOVERY_V1, planDiscoveryRun } from "../../commerce/discovery/planner.js";
import type {
  DiscoveryErrorCode,
  DiscoveryEligibleCategory,
  DiscoveryRunPlan,
  DiscoveryRunMetrics,
  MarketplaceDiscoveryAdapter,
} from "../../commerce/discovery/types.js";
import { MeliClient } from "../../meli/client.js";
import { createMeliHighlightsDiscoveryAdapter } from "../../meli/highlights-discovery-adapter.js";
import { createMeliOAuthRuntimeOperationRotationService } from "../oauth/factory.js";
import type { RotationResult } from "../oauth/rotation-service.js";
import { createSupabaseServerClient } from "../supabase/client.js";
import { loadSupabaseServerConfig } from "../supabase/config.js";
import {
  discoveryRegistryReadClientFromSupabase,
  loadDiscoveryEligibleCategories,
} from "./registry-reader.js";
import { runDiscoveryOrchestrator } from "./orchestrator.js";

export const COMMERCE_DISCOVERY_LIVE_SMOKE_CONTRACT = "commerce-discovery-live-smoke/v1" as const;
export const DISCOVERY_LIVE_SMOKE_OPERATION_ID = "0b3d-b-runtime-smoke-v1" as const;
const EXPECTED_ELIGIBLE = 144;
const EXPECTED_A = 28;
const EXPECTED_B = 116;
const SAMPLE_LIMIT = 10;
const SUPABASE_RUNTIME_TIMEOUT_MS = 10_000;

export type DiscoveryLiveSmokeErrorCode =
  | "DISCOVERY_LIVE_REGISTRY_MISMATCH"
  | "DISCOVERY_LIVE_PLAN_MISMATCH"
  | "DISCOVERY_LIVE_OPERATION_ALREADY_USED"
  | "DISCOVERY_LIVE_OAUTH_UNAVAILABLE"
  | "DISCOVERY_LIVE_PERSISTENCE_VIOLATION"
  | "DISCOVERY_LIVE_DEPENDENCY_FAILED";

export class DiscoveryLiveSmokeError extends Error {
  constructor(
    readonly code: DiscoveryLiveSmokeErrorCode,
    readonly details: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(code);
    this.name = "DiscoveryLiveSmokeError";
  }
}

export type DiscoveryLiveSmokeCountTable = "scan_runs" | "highlight_snapshots";

export interface DiscoveryLiveSmokeVerificationReader {
  count(table: DiscoveryLiveSmokeCountTable): Promise<number>;
}

export interface DiscoveryLiveSmokeDependencies {
  readonly loadEligibleCategories: () => Promise<readonly DiscoveryEligibleCategory[]>;
  readonly rotateAccessToken: () => Promise<RotationResult>;
  readonly createMarketplaceAdapter: (accessToken: string) => MarketplaceDiscoveryAdapter;
  readonly verificationReader: DiscoveryLiveSmokeVerificationReader;
  readonly nowMs?: () => number;
}

export interface DiscoveryLiveSmokeResult {
  readonly contractVersion: typeof COMMERCE_DISCOVERY_LIVE_SMOKE_CONTRACT;
  readonly status: "COMPLETED" | "COMPLETED_WITH_ERRORS";
  readonly mode: "SMOKE";
  readonly persistenceMode: "DRY_RUN";
  readonly registry: {
    readonly eligible: number;
    readonly tierA: number;
    readonly tierB: number;
    readonly digest: string;
  };
  readonly selected: { readonly total: 4; readonly tierA: 2; readonly tierB: 2 };
  readonly oauth: { readonly outcome: "ROTATED" };
  readonly fatalErrorCode: DiscoveryErrorCode | null;
  readonly multiCategoryProvenance: number;
  readonly categoryOutcomes: readonly {
    readonly externalCategoryId: string;
    readonly priorityTier: "A" | "B";
    readonly status: string;
    readonly errorCode: string | null;
    readonly rawHighlights: number;
    readonly productHighlights: number;
    readonly itemHighlights: number;
    readonly userProductHighlights: number;
    readonly unsupportedHighlights: number;
    readonly requestCount: number;
    readonly retryCount: number;
    readonly durationMs: number;
  }[];
  readonly metrics: DiscoveryRunMetrics;
  readonly persistenceProof: {
    readonly before: Readonly<Record<DiscoveryLiveSmokeCountTable, number>>;
    readonly after: Readonly<Record<DiscoveryLiveSmokeCountTable, number>>;
    readonly unchanged: true;
  };
  readonly samples: {
    readonly productIds: readonly string[];
    readonly itemIds: readonly string[];
    readonly userProductIds: readonly string[];
  };
  readonly timings: {
    readonly registryReadMs: number;
    readonly planningMs: number;
    readonly oauthMs: number;
    readonly totalMs: number;
  };
}

function elapsed(nowMs: () => number, startedAt: number): number {
  return Math.max(0, Math.round(nowMs() - startedAt));
}

async function counts(reader: DiscoveryLiveSmokeVerificationReader): Promise<Readonly<Record<DiscoveryLiveSmokeCountTable, number>>> {
  const [scanRuns, highlightSnapshots] = await Promise.all([
    reader.count("scan_runs"),
    reader.count("highlight_snapshots"),
  ]);
  if (!Number.isSafeInteger(scanRuns) || scanRuns < 0 || !Number.isSafeInteger(highlightSnapshots) || highlightSnapshots < 0) {
    throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_DEPENDENCY_FAILED");
  }
  return Object.freeze({ scan_runs: scanRuns, highlight_snapshots: highlightSnapshots });
}

function sanitizedDependencyError(error: unknown): DiscoveryLiveSmokeError {
  return error instanceof DiscoveryLiveSmokeError
    ? error
    : new DiscoveryLiveSmokeError("DISCOVERY_LIVE_DEPENDENCY_FAILED");
}

export async function runDiscoveryLiveSmoke(
  dependencies: DiscoveryLiveSmokeDependencies,
): Promise<DiscoveryLiveSmokeResult> {
  const nowMs = dependencies.nowMs ?? (() => performance.now());
  const startedAt = nowMs();
  try {
    const before = await counts(dependencies.verificationReader);
    const registryStartedAt = nowMs();
    const eligibleCategories = await dependencies.loadEligibleCategories();
    const registryReadMs = elapsed(nowMs, registryStartedAt);
    const tierA = eligibleCategories.filter((category) => category.priorityTier === "A").length;
    const tierB = eligibleCategories.filter((category) => category.priorityTier === "B").length;
    if (eligibleCategories.length !== EXPECTED_ELIGIBLE || tierA !== EXPECTED_A || tierB !== EXPECTED_B) {
      throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_REGISTRY_MISMATCH", {
        eligible: eligibleCategories.length,
        tierA,
        tierB,
      });
    }

    const planningStartedAt = nowMs();
    let plan: DiscoveryRunPlan;
    try {
      plan = planDiscoveryRun(eligibleCategories, "SMOKE", AUTOMOTIVE_MLB_DISCOVERY_V1);
    } catch {
      throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_PLAN_MISMATCH");
    }
    const planningMs = elapsed(nowMs, planningStartedAt);
    const selectedA = plan.selectedCategories.filter((category) => category.priorityTier === "A").length;
    const selectedB = plan.selectedCategories.filter((category) => category.priorityTier === "B").length;
    if (plan.mode !== "SMOKE" || plan.selectedCategories.length !== 4 || selectedA !== 2 || selectedB !== 2) {
      throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_PLAN_MISMATCH");
    }

    const oauthStartedAt = nowMs();
    const rotation = await dependencies.rotateAccessToken();
    const oauthMs = elapsed(nowMs, oauthStartedAt);
    if (rotation.outcome === "OPERATION_ALREADY_USED") {
      throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_OPERATION_ALREADY_USED");
    }
    if (rotation.outcome !== "ROTATED") {
      throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_OAUTH_UNAVAILABLE", { outcome: rotation.outcome });
    }

    const discovery = await runDiscoveryOrchestrator({
      plan,
      adapter: dependencies.createMarketplaceAdapter(rotation.accessToken),
      nowMs,
      registryReadMs,
      planningMs,
    });
    const after = await counts(dependencies.verificationReader);
    if (before.scan_runs !== after.scan_runs || before.highlight_snapshots !== after.highlight_snapshots) {
      throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_PERSISTENCE_VIOLATION", {
        scanRunsDelta: after.scan_runs - before.scan_runs,
        highlightSnapshotsDelta: after.highlight_snapshots - before.highlight_snapshots,
      });
    }

    const strictCompletion = discovery.metrics.failedCategories === 0
      && discovery.metrics.notAttemptedCategories === 0
      && discovery.fatalErrorCode === null;
    const multiCategoryProvenance = discovery.candidates.filter((candidate) => (
      new Set(candidate.occurrences.map((occurrence) => occurrence.marketplaceCategoryId)).size > 1
    )).length;

    return Object.freeze({
      contractVersion: COMMERCE_DISCOVERY_LIVE_SMOKE_CONTRACT,
      status: strictCompletion ? "COMPLETED" : "COMPLETED_WITH_ERRORS",
      mode: "SMOKE",
      persistenceMode: "DRY_RUN",
      registry: Object.freeze({ eligible: eligibleCategories.length, tierA, tierB, digest: plan.registryDigest }),
      selected: Object.freeze({ total: 4, tierA: 2, tierB: 2 }),
      oauth: Object.freeze({ outcome: "ROTATED" }),
      fatalErrorCode: discovery.fatalErrorCode,
      multiCategoryProvenance,
      categoryOutcomes: Object.freeze(discovery.outcomes.map((outcome) => Object.freeze({
        externalCategoryId: outcome.category.externalCategoryId,
        priorityTier: outcome.category.priorityTier,
        status: outcome.status,
        errorCode: outcome.errorCode,
        rawHighlights: outcome.rawHighlights,
        productHighlights: outcome.occurrences.filter((entry) => entry.highlightType === "PRODUCT").length,
        itemHighlights: outcome.occurrences.filter((entry) => entry.highlightType === "ITEM").length,
        userProductHighlights: outcome.occurrences.filter((entry) => entry.highlightType === "USER_PRODUCT").length,
        unsupportedHighlights: Math.max(0, outcome.rawHighlights - outcome.occurrences.length),
        requestCount: outcome.requestCount,
        retryCount: outcome.retryCount,
        durationMs: outcome.durationMs,
      }))),
      metrics: discovery.metrics,
      persistenceProof: Object.freeze({ before, after, unchanged: true as const }),
      samples: Object.freeze({
        productIds: Object.freeze(discovery.candidates.slice(0, SAMPLE_LIMIT).map((candidate) => candidate.externalId)),
        itemIds: Object.freeze(discovery.occurrences.filter((entry) => entry.highlightType === "ITEM").slice(0, SAMPLE_LIMIT).map((entry) => entry.externalId)),
        userProductIds: Object.freeze(discovery.occurrences.filter((entry) => entry.highlightType === "USER_PRODUCT").slice(0, SAMPLE_LIMIT).map((entry) => entry.externalId)),
      }),
      timings: Object.freeze({ registryReadMs, planningMs, oauthMs, totalMs: elapsed(nowMs, startedAt) }),
    });
  } catch (error) {
    throw sanitizedDependencyError(error);
  }
}

export function discoveryLiveSmokeVerificationReaderFromSupabase(
  client: SupabaseClient,
): DiscoveryLiveSmokeVerificationReader {
  return Object.freeze({
    async count(table: DiscoveryLiveSmokeCountTable): Promise<number> {
      const { count: rowCount, error } = await client.from(table).select("*", { count: "exact", head: true });
      if (error || rowCount === null) throw new DiscoveryLiveSmokeError("DISCOVERY_LIVE_DEPENDENCY_FAILED");
      return rowCount;
    },
  });
}

export async function runConfiguredDiscoveryLiveSmoke(): Promise<DiscoveryLiveSmokeResult> {
  const client = createSupabaseServerClient(loadSupabaseServerConfig(), { timeoutMs: SUPABASE_RUNTIME_TIMEOUT_MS });
  const rotationService = createMeliOAuthRuntimeOperationRotationService(client);
  return runDiscoveryLiveSmoke({
    loadEligibleCategories: () => loadDiscoveryEligibleCategories({
      client: discoveryRegistryReadClientFromSupabase(client),
      marketplaceKey: AUTOMOTIVE_MLB_DISCOVERY_V1.marketplaceKey,
      siteId: AUTOMOTIVE_MLB_DISCOVERY_V1.siteId,
      verticalKey: AUTOMOTIVE_MLB_DISCOVERY_V1.verticalKey,
    }),
    rotateAccessToken: () => rotationService.rotateMeliAccessTokenForRuntimeOperation(DISCOVERY_LIVE_SMOKE_OPERATION_ID),
    createMarketplaceAdapter: (accessToken) => createMeliHighlightsDiscoveryAdapter({
      client: new MeliClient({ accessToken, timeoutMs: 10_000 }),
      nowIso: () => new Date().toISOString(),
    }),
    verificationReader: discoveryLiveSmokeVerificationReaderFromSupabase(client),
  });
}
