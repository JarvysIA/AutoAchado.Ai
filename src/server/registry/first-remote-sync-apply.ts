import type {
  CurrentCommerceRegistryState,
} from "../../commerce/registry/types.js";
import type { RemoteRegistrySyncTarget } from "./admin-target.js";
import {
  AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION,
  AUTOMOTIVE_REGISTRY_PRESET_ID,
  AUTOMOTIVE_REGISTRY_SNAPSHOT_CHECKSUM,
  automotiveRegistryDryRunPreset,
} from "./automotive-registry-preset.js";
import type { RegistryReadClient } from "./current-state.js";
import type { ApplyCommerceRegistrySyncInput } from "./executor.js";
import {
  resolveFirstRemoteRegistryApplyTarget,
  type ResolvedFirstRemoteRegistryApplyTarget,
} from "./remote-live-target.js";
import {
  runRegistrySyncApplyEngine,
  type RegistrySyncApplyRunResult,
  type RegistrySyncConfirmationMode,
} from "./sync-apply-engine.js";
import {
  prepareRegistrySyncRun,
  registrySyncDryRunError,
  type PreparedRegistrySyncRun,
} from "./sync-orchestrator.js";
import type { RegistrySyncPreview } from "./sync-preview.js";
import type { CommerceRegistryApplyResult } from "./validation.js";

export const COMMERCE_REGISTRY_FIRST_REMOTE_APPLY_CONTRACT_VERSION =
  "commerce-registry-first-remote-apply/v1" as const;
export const FIRST_REMOTE_REGISTRY_PAYLOAD_SHA256 =
  "f6f728ca67bc55680398d23d6d2a972527b4481a4743ef384095e3624a071678" as const;

export interface FirstRemoteRegistryLiveConfirmation {
  readonly fingerprint: string;
  readonly token: string;
  readonly verified: boolean;
  readonly mode: RegistrySyncConfirmationMode | null;
}

export interface FirstRemoteRegistryPreviewEnvelope {
  readonly contractVersion: typeof COMMERCE_REGISTRY_FIRST_REMOTE_APPLY_CONTRACT_VERSION;
  readonly phase: "PREVIEW";
  readonly projectRef: RemoteRegistrySyncTarget["projectRef"];
  readonly preview: Readonly<RegistrySyncPreview>;
  readonly liveConfirmation: Readonly<FirstRemoteRegistryLiveConfirmation>;
  readonly performance: Readonly<RegistrySyncPreview["performance"]>;
}

export interface FirstRemoteRegistryApplyResultEnvelope {
  readonly contractVersion: typeof COMMERCE_REGISTRY_FIRST_REMOTE_APPLY_CONTRACT_VERSION;
  readonly phase: "RESULT";
  readonly projectRef: RemoteRegistrySyncTarget["projectRef"];
  readonly preview: Readonly<RegistrySyncPreview>;
  readonly liveConfirmation: Readonly<FirstRemoteRegistryLiveConfirmation>;
  readonly confirmation: Readonly<RegistrySyncApplyRunResult["confirmation"]>;
  readonly applyResult: Readonly<RegistrySyncApplyRunResult>;
  readonly performance: Readonly<RegistrySyncApplyRunResult["performance"]>;
}

export interface PrepareFirstRemoteRegistryPreviewInput {
  readonly target: Readonly<RemoteRegistrySyncTarget>;
  readonly readClient: RegistryReadClient;
  readonly nowMs?: () => number;
}

export interface RunFirstRemoteRegistryApplyInput extends PrepareFirstRemoteRegistryPreviewInput {
  readonly confirmationMode: RegistrySyncConfirmationMode;
  readonly readConfirmationToken: (
    preview: Readonly<RegistrySyncPreview>,
    expectedLiveToken: string,
  ) => Promise<string>;
  readonly resolveApplyTarget?: (
    expectedTarget: Readonly<RemoteRegistrySyncTarget>,
  ) => ResolvedFirstRemoteRegistryApplyTarget
    | PromiseLike<ResolvedFirstRemoteRegistryApplyTarget>;
  readonly applyRegistrySync?: (
    input: ApplyCommerceRegistrySyncInput,
  ) => Promise<Readonly<CommerceRegistryApplyResult>>;
  readonly validateStructuralState?: (
    current: Readonly<CurrentCommerceRegistryState>,
    prepared: Readonly<PreparedRegistrySyncRun>,
  ) => boolean;
}

export function buildLiveRemoteConfirmationToken(preview: Readonly<RegistrySyncPreview>): string {
  return [
    "AUTOACHADO",
    "LIVE",
    "REMOTE",
    preview.context.rootExternalCategoryId,
    preview.desired.categoryCount,
    preview.fingerprint.value.slice(0, 12).toUpperCase(),
  ].join(":");
}

function liveBaselineMatches(prepared: Readonly<PreparedRegistrySyncRun>): boolean {
  const expected = AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION;
  const preview = prepared.preview;
  return preview.target.kind === "REMOTE"
    && preview.firstSync
    && preview.presetId === AUTOMOTIVE_REGISTRY_PRESET_ID
    && preview.source.checksum === AUTOMOTIVE_REGISTRY_SNAPSHOT_CHECKSUM
    && preview.source.sourceContentCreated === expected.sourceContentCreated
    && preview.desired.categoryCount === expected.categoryCount
    && preview.desired.mappingCount === expected.mappingCount
    && JSON.stringify(preview.desired.scope) === JSON.stringify(expected.scopeCounts)
    && JSON.stringify(preview.desired.tiers) === JSON.stringify(expected.tierCounts)
    && preview.desired.automaticEligibleCount === expected.automaticEligibleCount
    && preview.changes.categories.insert === expected.expectedCategoryDiff.insert
    && preview.changes.categories.update === 0
    && preview.changes.categories.reactivate === 0
    && preview.changes.categories.unchanged === 0
    && preview.changes.mappings.insert === expected.expectedMappingDiff.insert
    && preview.changes.mappings.update === 0
    && preview.changes.mappings.reactivate === 0
    && preview.changes.mappings.inactivate === 0
    && preview.changes.mappings.manual_override_skipped === 0
    && preview.changes.mappings.unchanged === 0
    && preview.payload.bytes === expected.payloadBytes
    && preview.payload.sha256 === FIRST_REMOTE_REGISTRY_PAYLOAD_SHA256;
}

export function validateFirstRemoteRegistryPreparedRun(
  prepared: Readonly<PreparedRegistrySyncRun>,
): void {
  if (prepared.preview.current.categories !== 0 || prepared.preview.current.mappings !== 0) {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_LIVE_REMOTE_STATE_CHANGED",
      "Estado remoto não está vazio para o primeiro apply",
    );
  }
  if (prepared.preview.safety.previewStatus !== "READY" || !liveBaselineMatches(prepared)) {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_EXPECTATION_MISMATCH",
      "Baseline LIVE remoto divergente",
    );
  }
}

export function validateFirstRemoteRegistryStructuralState(
  current: Readonly<CurrentCommerceRegistryState>,
): boolean {
  const expected = AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION;
  if (current.categories.length !== expected.categoryCount
    || current.mappings.length !== expected.mappingCount) return false;
  const categoryIds = new Set<string>();
  const categoryIdentities = new Set<string>();
  for (const category of current.categories) {
    const identity = JSON.stringify([
      category.marketplaceKey,
      category.siteId,
      category.externalCategoryId,
    ]);
    if (categoryIdentities.has(identity) || categoryIds.has(category.externalCategoryId)) return false;
    categoryIdentities.add(identity);
    categoryIds.add(category.externalCategoryId);
  }
  for (const category of current.categories) {
    if (category.externalCategoryId === automotiveRegistryDryRunPreset.rootExternalCategoryId) {
      if (category.parentExternalCategoryId !== null) return false;
    } else if (category.parentExternalCategoryId === null
      || !categoryIds.has(category.parentExternalCategoryId)) return false;
  }
  const mappingIdentities = new Set<string>();
  let activeMappings = 0;
  const scope = { allowed: 0, review: 0, excluded: 0, unknown: 0 };
  const tiers = { A: 0, B: 0, C: 0 };
  for (const mapping of current.mappings) {
    const identity = JSON.stringify([
      mapping.verticalKey,
      mapping.marketplaceKey,
      mapping.siteId,
      mapping.externalCategoryId,
    ]);
    if (mappingIdentities.has(identity) || !categoryIds.has(mapping.externalCategoryId)) return false;
    mappingIdentities.add(identity);
    if (!mapping.active) continue;
    activeMappings += 1;
    scope[mapping.scopeStatus.toLowerCase() as keyof typeof scope] += 1;
    if (mapping.priorityTier !== null) tiers[mapping.priorityTier] += 1;
  }
  return activeMappings === expected.mappingCount
    && current.controlledMappingExternalCategoryIds.length === expected.mappingCount
    && new Set(current.controlledMappingExternalCategoryIds).size === expected.mappingCount
    && JSON.stringify(scope) === JSON.stringify(expected.scopeCounts)
    && JSON.stringify(tiers) === JSON.stringify(expected.tierCounts)
    && tiers.A + tiers.B === expected.automaticEligibleCount;
}

export async function prepareFirstRemoteRegistryApplyPreview(
  input: PrepareFirstRemoteRegistryPreviewInput,
): Promise<Readonly<FirstRemoteRegistryPreviewEnvelope>> {
  if (input.target.kind !== "REMOTE") {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target LIVE deve ser remoto");
  }
  const prepared = await prepareRegistrySyncRun({
    target: input.target,
    readClient: input.readClient,
    preset: automotiveRegistryDryRunPreset,
    firstSync: true,
    ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }),
  });
  validateFirstRemoteRegistryPreparedRun(prepared);
  const token = buildLiveRemoteConfirmationToken(prepared.preview);
  return Object.freeze({
    contractVersion: COMMERCE_REGISTRY_FIRST_REMOTE_APPLY_CONTRACT_VERSION,
    phase: "PREVIEW",
    projectRef: input.target.projectRef,
    preview: prepared.preview,
    liveConfirmation: Object.freeze({
      fingerprint: prepared.preview.fingerprint.value,
      token,
      verified: false,
      mode: null,
    }),
    performance: prepared.preview.performance,
  });
}

export async function runFirstRemoteRegistryApply(
  input: RunFirstRemoteRegistryApplyInput,
): Promise<Readonly<FirstRemoteRegistryApplyResultEnvelope>> {
  if (input.target.kind !== "REMOTE") {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target LIVE deve ser remoto");
  }
  const result = await runRegistrySyncApplyEngine({
    target: input.target,
    readClient: input.readClient,
    preset: automotiveRegistryDryRunPreset,
    firstSync: true,
    confirmationMode: input.confirmationMode,
    confirmationTokenForPreview: buildLiveRemoteConfirmationToken,
    readConfirmationToken: input.readConfirmationToken,
    resolveApplyTarget: input.resolveApplyTarget ?? resolveFirstRemoteRegistryApplyTarget,
    validatePreparedRun: validateFirstRemoteRegistryPreparedRun,
    validatePostState: input.validateStructuralState
      ?? ((current) => validateFirstRemoteRegistryStructuralState(current)),
    ...(input.applyRegistrySync === undefined ? {} : { applyRegistrySync: input.applyRegistrySync }),
    ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }),
  });
  return Object.freeze({
    contractVersion: COMMERCE_REGISTRY_FIRST_REMOTE_APPLY_CONTRACT_VERSION,
    phase: "RESULT",
    projectRef: input.target.projectRef,
    preview: result.preview,
    liveConfirmation: Object.freeze({
      fingerprint: result.preview.fingerprint.value,
      token: buildLiveRemoteConfirmationToken(result.preview),
      verified: true,
      mode: input.confirmationMode,
    }),
    confirmation: result.confirmation,
    applyResult: result,
    performance: result.performance,
  });
}
