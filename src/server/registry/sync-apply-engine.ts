import { performance } from "node:perf_hooks";
import { diffCommerceRegistryState } from "../../commerce/registry/diff.js";
import { RegistrySyncError } from "../../commerce/registry/errors.js";
import type {
  CommerceRegistryStateDiff,
  CurrentCommerceRegistryState,
} from "../../commerce/registry/types.js";
import type { RegistrySyncTarget } from "./admin-target.js";
import {
  loadCurrentCommerceRegistryState,
  type RegistryReadClient,
} from "./current-state.js";
import {
  applyCommerceRegistrySync,
  type ApplyCommerceRegistrySyncInput,
  type RegistryApplyRpcClient,
} from "./executor.js";
import {
  prepareRegistrySyncRun,
  registrySyncDryRunError,
  type PreparedRegistrySyncRun,
  type RegistrySyncDryRunPreset,
} from "./sync-orchestrator.js";
import {
  digestCurrentCommerceRegistryState,
  type RegistrySyncPreview,
} from "./sync-preview.js";
import type { CommerceRegistryApplyResult } from "./validation.js";

export const COMMERCE_REGISTRY_SYNC_APPLY_RUN_CONTRACT_VERSION =
  "commerce-registry-sync-apply-run/v1" as const;

export type RegistrySyncApplyOutcome =
  | "APPLIED_AND_VERIFIED"
  | "APPLY_FAILED_STATE_UNCHANGED"
  | "APPLY_OUTCOME_UNCERTAIN"
  | "POST_VERIFY_FAILED"
  | "LOCKED";

export type RegistrySyncConfirmationMode =
  | "INTERACTIVE_EXACT_TOKEN"
  | "PROVIDED_EXACT_TOKEN";

export interface RegistrySyncCurrentSummary {
  readonly categories: number;
  readonly mappings: number;
  readonly activeMappings: number;
  readonly allowed: number;
  readonly review: number;
  readonly excluded: number;
  readonly unknown: number;
  readonly tierA: number;
  readonly tierB: number;
  readonly tierC: number;
  readonly automaticEligible: number;
}

export interface RegistrySyncApplyPerformance {
  readonly initialPrepareMs: number;
  readonly confirmationWaitMs: number;
  readonly refreshedPrepareMs: number;
  readonly rpcMs: number;
  readonly postReadMs: number;
  readonly postDiffMs: number;
  readonly executionMs: number;
}

export interface RegistrySyncApplyRunResult {
  readonly contractVersion: typeof COMMERCE_REGISTRY_SYNC_APPLY_RUN_CONTRACT_VERSION;
  readonly outcome: RegistrySyncApplyOutcome;
  readonly preview: Readonly<RegistrySyncPreview>;
  readonly confirmation: Readonly<{
    mode: RegistrySyncConfirmationMode;
    verified: true;
  }>;
  readonly rpc: Readonly<{
    result: Readonly<CommerceRegistryApplyResult> | null;
    errorCode: string | null;
    callCount: number;
    retryCount: 0;
  }>;
  readonly post: Readonly<{
    readAttempted: boolean;
    readSucceeded: boolean;
    currentSummary: Readonly<RegistrySyncCurrentSummary> | null;
    currentDigest: string | null;
    diffSummary: Readonly<CommerceRegistryStateDiff["summary"]> | null;
    converged: boolean;
    rpcPreConsistent: boolean;
    effectiveConsistent: boolean;
  }>;
  readonly performance: Readonly<RegistrySyncApplyPerformance>;
}

export interface ResolvedRegistryApplyTarget<TTarget extends RegistrySyncTarget> {
  readonly target: TTarget;
  readonly readClient: RegistryReadClient;
  readonly createApplyClient: () => Promise<RegistryApplyRpcClient>;
}

export interface RunRegistrySyncApplyEngineInput<TTarget extends RegistrySyncTarget> {
  readonly target: TTarget;
  readonly readClient: RegistryReadClient;
  readonly preset: RegistrySyncDryRunPreset;
  readonly firstSync: boolean;
  readonly confirmationMode: RegistrySyncConfirmationMode;
  readonly confirmationTokenForPreview: (preview: Readonly<RegistrySyncPreview>) => string;
  readonly readConfirmationToken: (
    preview: Readonly<RegistrySyncPreview>,
    expectedToken: string,
  ) => Promise<string>;
  readonly resolveApplyTarget: (
    expectedTarget: TTarget,
  ) => ResolvedRegistryApplyTarget<TTarget> | PromiseLike<ResolvedRegistryApplyTarget<TTarget>>;
  readonly validatePreparedRun?: (
    prepared: Readonly<PreparedRegistrySyncRun>,
    phase: "INITIAL" | "REFRESHED",
  ) => void;
  readonly validatePostState?: (
    current: Readonly<CurrentCommerceRegistryState>,
    prepared: Readonly<PreparedRegistrySyncRun>,
  ) => boolean;
  readonly applyRegistrySync?: (
    input: ApplyCommerceRegistrySyncInput,
  ) => Promise<Readonly<CommerceRegistryApplyResult>>;
  readonly nowMs?: () => number;
}

export function summarizeCurrentRegistryState(
  current: CurrentCommerceRegistryState,
): Readonly<RegistrySyncCurrentSummary> {
  let activeMappings = 0;
  let allowed = 0;
  let review = 0;
  let excluded = 0;
  let unknown = 0;
  let tierA = 0;
  let tierB = 0;
  let tierC = 0;
  for (const mapping of current.mappings) {
    if (!mapping.active) continue;
    activeMappings += 1;
    if (mapping.scopeStatus === "ALLOWED") allowed += 1;
    if (mapping.scopeStatus === "REVIEW") review += 1;
    if (mapping.scopeStatus === "EXCLUDED") excluded += 1;
    if (mapping.scopeStatus === "UNKNOWN") unknown += 1;
    if (mapping.priorityTier === "A") tierA += 1;
    if (mapping.priorityTier === "B") tierB += 1;
    if (mapping.priorityTier === "C") tierC += 1;
  }
  return Object.freeze({
    categories: current.categories.length,
    mappings: current.mappings.length,
    activeMappings,
    allowed,
    review,
    excluded,
    unknown,
    tierA,
    tierB,
    tierC,
    automaticEligible: tierA + tierB,
  });
}

function rpcMatchesPrepared(
  result: CommerceRegistryApplyResult,
  diff: CommerceRegistryStateDiff,
): boolean {
  return result.categories.inserted === diff.summary.categories.insert
    && result.categories.updated === diff.summary.categories.update
    && result.categories.reactivated === diff.summary.categories.reactivate
    && result.categories.unchanged === diff.summary.categories.unchanged
    && result.mappings.inserted === diff.summary.mappings.insert
    && result.mappings.updated === diff.summary.mappings.update
    && result.mappings.reactivated === diff.summary.mappings.reactivate
    && result.mappings.inactivated === diff.summary.mappings.inactivate
    && result.mappings.manualOverrideSkipped === diff.summary.mappings.manual_override_skipped
    && result.mappings.unchanged === diff.summary.mappings.unchanged;
}

function effectiveMatchesPost(
  result: CommerceRegistryApplyResult,
  summary: RegistrySyncCurrentSummary,
): boolean {
  return result.effective.activeMappings === summary.activeMappings
    && result.effective.allowed === summary.allowed
    && result.effective.review === summary.review
    && result.effective.excluded === summary.excluded
    && result.effective.unknown === summary.unknown
    && result.effective.tierA === summary.tierA
    && result.effective.tierB === summary.tierB
    && result.effective.tierC === summary.tierC
    && result.effective.automaticEligible === summary.automaticEligible;
}

function actionableChangesAreZero(diff: CommerceRegistryStateDiff): boolean {
  return diff.summary.categories.insert === 0
    && diff.summary.categories.update === 0
    && diff.summary.categories.reactivate === 0
    && diff.summary.mappings.insert === 0
    && diff.summary.mappings.update === 0
    && diff.summary.mappings.reactivate === 0
    && diff.summary.mappings.inactivate === 0;
}

function manualLineageIsValid(
  before: CommerceRegistryStateDiff,
  after: CommerceRegistryStateDiff,
): boolean {
  const allowed = new Set<string>();
  for (const operation of before.mappings) {
    if (operation.kind === "MANUAL_OVERRIDE_SKIPPED") allowed.add(operation.identityKey);
    if (operation.kind === "REACTIVATE" && operation.current?.manualOverride === true) {
      allowed.add(operation.identityKey);
    }
  }
  return after.mappings
    .filter((operation) => operation.kind === "MANUAL_OVERRIDE_SKIPPED")
    .every((operation) => operation.current?.manualOverride === true && allowed.has(operation.identityKey));
}

function targetsMatch(left: RegistrySyncTarget, right: RegistrySyncTarget): boolean {
  return left.kind === right.kind
    && left.projectRef === right.projectRef
    && left.baseUrl === right.baseUrl;
}

function errorCode(error: unknown): string {
  return error instanceof RegistrySyncError ? error.code : "REGISTRY_ATOMIC_APPLY_FAILED";
}

export async function runRegistrySyncApplyEngine<TTarget extends RegistrySyncTarget>(
  input: RunRegistrySyncApplyEngineInput<TTarget>,
): Promise<Readonly<RegistrySyncApplyRunResult>> {
  const nowMs = input.nowMs ?? (() => performance.now());
  let started = nowMs();
  const initial = await prepareRegistrySyncRun({
    target: input.target,
    readClient: input.readClient,
    preset: input.preset,
    firstSync: input.firstSync,
    nowMs,
  });
  const initialPrepareMs = nowMs() - started;
  input.validatePreparedRun?.(initial, "INITIAL");
  if (initial.preview.safety.previewStatus !== "READY") {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_EXPECTATION_MISMATCH",
      "Preview bloqueado para apply",
    );
  }

  const initialExpectedToken = input.confirmationTokenForPreview(initial.preview);
  started = nowMs();
  const confirmationToken = (await input.readConfirmationToken(initial.preview, initialExpectedToken)).trim();
  const confirmationWaitMs = nowMs() - started;
  if (confirmationToken !== initialExpectedToken) {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_CONFIRMATION_MISMATCH",
      "Token de confirmação divergente",
    );
  }

  const resolved = await input.resolveApplyTarget(input.target);
  if (!targetsMatch(resolved.target, input.target)) {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target mudou após confirmação");
  }

  started = nowMs();
  const refreshed = await prepareRegistrySyncRun({
    target: resolved.target,
    readClient: resolved.readClient,
    preset: input.preset,
    firstSync: input.firstSync,
    nowMs,
  });
  const refreshedPrepareMs = nowMs() - started;
  input.validatePreparedRun?.(refreshed, "REFRESHED");
  const refreshedExpectedToken = input.confirmationTokenForPreview(refreshed.preview);
  if (refreshed.preview.safety.previewStatus !== "READY"
    || confirmationToken !== refreshedExpectedToken
    || initialExpectedToken !== refreshedExpectedToken
    || initial.preview.fingerprint.value !== refreshed.preview.fingerprint.value) {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_CONFIRMATION_MISMATCH",
      "Preview mudou após confirmação",
    );
  }

  const rawApplyClient = await resolved.createApplyClient();
  let rpcCallCount = 0;
  const applyRegistrySync = input.applyRegistrySync ?? applyCommerceRegistrySync;
  let result: Readonly<CommerceRegistryApplyResult> | null = null;
  let applyError: unknown = null;
  started = nowMs();
  try {
    rpcCallCount += 1;
    result = await applyRegistrySync({ client: rawApplyClient, payload: refreshed.payload });
  } catch (error) {
    applyError = error;
  }
  const rpcMs = nowMs() - started;
  if (rpcCallCount !== 1) {
    throw registrySyncDryRunError("REGISTRY_SYNC_POST_VERIFY_FAILED", "Contagem RPC divergente");
  }

  let postState: Readonly<CurrentCommerceRegistryState> | null = null;
  let postDiff: Readonly<CommerceRegistryStateDiff> | null = null;
  let currentSummary: Readonly<RegistrySyncCurrentSummary> | null = null;
  let currentDigest: string | null = null;
  let postReadMs = 0;
  let postDiffMs = 0;
  let postReadSucceeded = false;
  started = nowMs();
  try {
    postState = await loadCurrentCommerceRegistryState({
      client: resolved.readClient,
      marketplaceKey: input.preset.marketplaceKey,
      siteId: input.preset.siteId,
      verticalKey: input.preset.verticalKey,
      rootExternalCategoryId: input.preset.rootExternalCategoryId,
      desiredExternalCategoryIds: refreshed.plan.categories.map((category) => category.externalCategoryId),
    });
    postReadSucceeded = true;
    currentSummary = summarizeCurrentRegistryState(postState);
    currentDigest = digestCurrentCommerceRegistryState(postState);
  } catch {
    postReadSucceeded = false;
  }
  postReadMs = nowMs() - started;

  if (postState !== null) {
    started = nowMs();
    postDiff = diffCommerceRegistryState(refreshed.plan, postState);
    postDiffMs = nowMs() - started;
  }

  const rpcPreConsistent = result !== null && rpcMatchesPrepared(result, refreshed.diff);
  const effectiveConsistent = result !== null && currentSummary !== null
    && effectiveMatchesPost(result, currentSummary);
  const structuralIntegrityValid = postState !== null
    && (input.validatePostState?.(postState, refreshed) ?? true);
  const converged = result !== null && postDiff !== null
    && actionableChangesAreZero(postDiff)
    && rpcPreConsistent
    && effectiveConsistent
    && manualLineageIsValid(refreshed.diff, postDiff)
    && structuralIntegrityValid;

  let outcome: RegistrySyncApplyOutcome;
  if (applyError instanceof RegistrySyncError && applyError.code === "REGISTRY_SYNC_LOCKED") {
    outcome = "LOCKED";
  } else if (applyError !== null) {
    outcome = postReadSucceeded && currentDigest === refreshed.preview.current.digest
      ? "APPLY_FAILED_STATE_UNCHANGED"
      : "APPLY_OUTCOME_UNCERTAIN";
  } else {
    outcome = converged ? "APPLIED_AND_VERIFIED" : "POST_VERIFY_FAILED";
  }

  const performanceMetrics: RegistrySyncApplyPerformance = Object.freeze({
    initialPrepareMs,
    confirmationWaitMs,
    refreshedPrepareMs,
    rpcMs,
    postReadMs,
    postDiffMs,
    executionMs: initialPrepareMs + refreshedPrepareMs + rpcMs + postReadMs + postDiffMs,
  });
  return Object.freeze({
    contractVersion: COMMERCE_REGISTRY_SYNC_APPLY_RUN_CONTRACT_VERSION,
    outcome,
    preview: refreshed.preview,
    confirmation: Object.freeze({ mode: input.confirmationMode, verified: true as const }),
    rpc: Object.freeze({
      result,
      errorCode: applyError === null ? null : errorCode(applyError),
      callCount: rpcCallCount,
      retryCount: 0 as const,
    }),
    post: Object.freeze({
      readAttempted: true,
      readSucceeded: postReadSucceeded,
      currentSummary,
      currentDigest,
      diffSummary: postDiff?.summary ?? null,
      converged,
      rpcPreConsistent,
      effectiveConsistent,
    }),
    performance: performanceMetrics,
  });
}
