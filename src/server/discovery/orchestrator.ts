import { deduplicateDiscoveryOccurrences } from "../../commerce/discovery/dedup.js";
import {
  COMMERCE_DISCOVERY_RUN_CONTRACT,
  DiscoveryError,
  type DiscoveryCategoryOutcome,
  type DiscoveryErrorCode,
  type DiscoveryOccurrence,
  type DiscoveryRunPlan,
  type DiscoveryRunResult,
  type MarketplaceCategoryDiscoveryResult,
  type MarketplaceDiscoveryAdapter,
} from "../../commerce/discovery/types.js";

export interface RunDiscoveryOrchestratorInput {
  readonly plan: DiscoveryRunPlan;
  readonly adapter: MarketplaceDiscoveryAdapter;
  readonly nowMs?: () => number;
  readonly registryReadMs?: number;
  readonly planningMs?: number;
}

interface Attempt {
  readonly result?: MarketplaceCategoryDiscoveryResult;
  readonly error?: DiscoveryError;
}

function safeError(error: unknown): DiscoveryError {
  return error instanceof DiscoveryError
    ? error
    : new DiscoveryError("DISCOVERY_CATEGORY_TRANSPORT_FAILED", "Falha sanitizada no discovery");
}

function numericDetail(error: DiscoveryError, key: string): number {
  const value = error.details[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function outcomeFromResult(result: MarketplaceCategoryDiscoveryResult): DiscoveryCategoryOutcome {
  return Object.freeze({
    category: result.category,
    status: result.rawHighlights === 0 ? "EMPTY" : "SUCCESS",
    errorCode: null,
    occurrences: result.occurrences,
    rawHighlights: result.rawHighlights,
    requestCount: result.requestCount,
    retryCount: result.retryCount,
    durationMs: result.durationMs,
  });
}

function outcomeFromError(category: DiscoveryRunPlan["selectedCategories"][number], error: DiscoveryError): DiscoveryCategoryOutcome {
  return Object.freeze({
    category,
    status: "FAILED",
    errorCode: error.code,
    occurrences: Object.freeze([]),
    rawHighlights: 0,
    requestCount: numericDetail(error, "requestCount"),
    retryCount: numericDetail(error, "retryCount"),
    durationMs: 0,
  });
}

function notAttempted(category: DiscoveryRunPlan["selectedCategories"][number], reason: DiscoveryErrorCode): DiscoveryCategoryOutcome {
  return Object.freeze({
    category,
    status: "NOT_ATTEMPTED",
    errorCode: reason,
    occurrences: Object.freeze([]),
    rawHighlights: 0,
    requestCount: 0,
    retryCount: 0,
    durationMs: 0,
  });
}

export async function runDiscoveryOrchestrator(input: RunDiscoveryOrchestratorInput): Promise<DiscoveryRunResult> {
  const clock = input.nowMs ?? (() => performance.now());
  const started = clock();
  const outcomes: DiscoveryCategoryOutcome[] = [];
  const successfulResults: MarketplaceCategoryDiscoveryResult[] = [];
  let fatalErrorCode: DiscoveryErrorCode | null = null;
  let schemaFailureStreak = 0;
  let transportFailureStreak = 0;
  const selected = input.plan.selectedCategories;

  for (let offset = 0; offset < selected.length && fatalErrorCode === null; offset += input.plan.config.concurrency) {
    const batch = selected.slice(offset, offset + input.plan.config.concurrency);
    const attempts: Attempt[] = await Promise.all(batch.map(async (category) => {
      try {
        return { result: await input.adapter.discoverCategory(category) };
      } catch (error) {
        return { error: safeError(error) };
      }
    }));
    for (let index = 0; index < attempts.length; index += 1) {
      const category = batch[index]!;
      const attempt = attempts[index]!;
      if (attempt.result) {
        outcomes.push(outcomeFromResult(attempt.result));
        successfulResults.push(attempt.result);
        schemaFailureStreak = 0;
        transportFailureStreak = 0;
        continue;
      }
      const error = attempt.error!;
      outcomes.push(outcomeFromError(category, error));
      if (error.code === "DISCOVERY_AUTH_FATAL" || error.code === "DISCOVERY_RATE_LIMIT_STOP") {
        fatalErrorCode = error.code;
      } else if (error.code === "DISCOVERY_ADAPTER_SCHEMA_INVALID") {
        schemaFailureStreak += 1;
        transportFailureStreak = 0;
        if (schemaFailureStreak >= 3) fatalErrorCode = "DISCOVERY_ADAPTER_CONTRACT_DRIFT";
      } else if (error.code === "DISCOVERY_CATEGORY_TRANSPORT_FAILED") {
        transportFailureStreak += 1;
        schemaFailureStreak = 0;
        if (transportFailureStreak >= 3) fatalErrorCode = "DISCOVERY_GLOBAL_TRANSPORT_STOP";
      } else {
        schemaFailureStreak = 0;
        transportFailureStreak = 0;
      }
    }
  }

  if (outcomes.length < selected.length) {
    const reason = fatalErrorCode ?? "DISCOVERY_GLOBAL_TRANSPORT_STOP";
    for (const category of selected.slice(outcomes.length)) outcomes.push(notAttempted(category, reason));
  }

  const apiMs = successfulResults.reduce((total, result) => total + result.durationMs, 0);
  const dedupStarted = clock();
  const allOccurrences: DiscoveryOccurrence[] = successfulResults.flatMap((result) => [...result.occurrences]);
  const deduplicated = deduplicateDiscoveryOccurrences(allOccurrences);
  const dedupMs = Math.max(0, Math.round(clock() - dedupStarted));
  const attempted = outcomes.filter((outcome) => outcome.status !== "NOT_ATTEMPTED");
  const productHighlights = successfulResults.reduce((total, result) => total + result.productHighlights, 0);
  const itemHighlights = successfulResults.reduce((total, result) => total + result.itemHighlights, 0);
  const userProductHighlights = successfulResults.reduce((total, result) => total + result.userProductHighlights, 0);
  const unsupportedHighlights = successfulResults.reduce((total, result) => total + result.unsupportedHighlights, 0);
  const totalMs = Math.max(0, Math.round(clock() - started)) + (input.registryReadMs ?? 0) + (input.planningMs ?? 0);
  const metrics = Object.freeze({
    eligibleCategories: input.plan.eligibleCategories.length,
    selectedCategories: selected.length,
    attemptedCategories: attempted.length,
    successfulCategories: outcomes.filter((outcome) => outcome.status === "SUCCESS").length,
    failedCategories: outcomes.filter((outcome) => outcome.status === "FAILED").length,
    emptyCategories: outcomes.filter((outcome) => outcome.status === "EMPTY").length,
    notAttemptedCategories: outcomes.filter((outcome) => outcome.status === "NOT_ATTEMPTED").length,
    apiRequests: outcomes.reduce((total, outcome) => total + outcome.requestCount, 0),
    retryCount: outcomes.reduce((total, outcome) => total + outcome.retryCount, 0),
    rawHighlights: successfulResults.reduce((total, result) => total + result.rawHighlights, 0),
    productHighlights,
    itemHighlights,
    userProductHighlights,
    unsupportedHighlights,
    acceptedCandidates: productHighlights,
    uniqueCandidates: deduplicated.candidates.length,
    duplicateOccurrences: deduplicated.duplicateOccurrences,
    rateLimited: outcomes.some((outcome) => outcome.errorCode === "DISCOVERY_RATE_LIMIT_STOP"),
    registryReadMs: input.registryReadMs ?? 0,
    planningMs: input.planningMs ?? 0,
    apiMs,
    dedupMs,
    persistenceMs: 0 as const,
    totalMs,
  });
  if (metrics.selectedCategories !== metrics.attemptedCategories + metrics.notAttemptedCategories
    || metrics.attemptedCategories !== metrics.successfulCategories + metrics.emptyCategories + metrics.failedCategories
    || metrics.rawHighlights !== productHighlights + itemHighlights + userProductHighlights + unsupportedHighlights) {
    throw new DiscoveryError("DISCOVERY_PLAN_INVALID", "Invariantes métricas violadas");
  }
  return Object.freeze({
    contractVersion: COMMERCE_DISCOVERY_RUN_CONTRACT,
    mode: input.plan.mode,
    persistenceMode: "DRY_RUN",
    registryDigest: input.plan.registryDigest,
    outcomes: Object.freeze(outcomes),
    occurrences: deduplicated.occurrences,
    candidates: deduplicated.candidates,
    metrics,
    fatalErrorCode,
  });
}
