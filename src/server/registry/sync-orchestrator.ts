import { performance } from "node:perf_hooks";
import {
  buildAtomicRegistryApplyPayload,
  measureAtomicRegistryApplyPayload,
  validateAtomicRegistryApplyPayload,
} from "../../commerce/registry/apply-payload.js";
import { diffCommerceRegistryState } from "../../commerce/registry/diff.js";
import { buildCommerceRegistrySyncPlan } from "../../commerce/registry/planner.js";
import type {
  CategoryDiffKind,
  CommerceRegistryPlanSummary,
  MappingDiffKind,
  RegistryCategoryClassifier,
} from "../../commerce/registry/types.js";
import type { AutomotiveTaxonomySnapshot } from "../../taxonomy/automotive-snapshot.js";
import type { TaxonomyTree } from "../../taxonomy/tree.js";
import type { RegistrySyncTarget } from "./admin-target.js";
import {
  loadCurrentCommerceRegistryState,
  type RegistryReadClient,
} from "./current-state.js";
import {
  buildRegistrySyncPreview,
  sha256Utf8,
  type RegistrySyncPerformance,
  type RegistrySyncPreview,
} from "./sync-preview.js";

export type RegistrySyncDryRunErrorCode =
  | "REGISTRY_SYNC_INVALID_ARGUMENTS"
  | "REGISTRY_SYNC_LOCAL_ENV_UNAVAILABLE"
  | "REGISTRY_SYNC_TARGET_MISMATCH"
  | "REGISTRY_SYNC_REMOTE_NOT_ENABLED"
  | "REGISTRY_SYNC_APPLY_NOT_ENABLED"
  | "REGISTRY_SYNC_EXPECTATION_MISMATCH"
  | "REGISTRY_SYNC_DRY_RUN_FAILED";

export class RegistrySyncDryRunError extends Error {
  constructor(readonly code: RegistrySyncDryRunErrorCode, message: string) {
    super(message);
    this.name = "RegistrySyncDryRunError";
  }
}

export function registrySyncDryRunError(code: RegistrySyncDryRunErrorCode, message: string): RegistrySyncDryRunError {
  return new RegistrySyncDryRunError(code, message);
}

export interface RegistrySnapshotSource {
  readonly snapshot: AutomotiveTaxonomySnapshot;
  readonly taxonomyTree: TaxonomyTree;
  readonly checksum: string;
  readonly checkedAt: string;
}

export interface RegistryFirstSyncExpectation {
  readonly snapshotChecksum: string;
  readonly sourceVersion: string;
  readonly sourceContentCreated: string;
  readonly classificationVersion: string;
  readonly configVersion: string;
  readonly payloadBytes: number;
  readonly categoryCount: number;
  readonly mappingCount: number;
  readonly scopeCounts: CommerceRegistryPlanSummary["scope"];
  readonly tierCounts: CommerceRegistryPlanSummary["tiers"];
  readonly automaticEligibleCount: number;
  readonly expectedCurrentCategoryCount: number;
  readonly expectedCurrentMappingCount: number;
  readonly expectedCategoryDiff: Readonly<Record<Lowercase<CategoryDiffKind>, number>>;
  readonly expectedMappingDiff: Readonly<Record<Lowercase<MappingDiffKind>, number>>;
}

export interface RegistrySyncDryRunPreset {
  readonly presetId: string;
  readonly marketplaceKey: string;
  readonly siteId: string;
  readonly verticalKey: string;
  readonly rootExternalCategoryId: string;
  readonly configVersion: string;
  readonly expectedClassificationVersion: string;
  readonly loadSource: () => Promise<Readonly<RegistrySnapshotSource>>;
  readonly classifyCategory: RegistryCategoryClassifier;
  readonly firstSyncExpectation: Readonly<RegistryFirstSyncExpectation>;
}

export interface RunRegistrySyncDryRunInput {
  readonly target: RegistrySyncTarget;
  readonly readClient: RegistryReadClient;
  readonly preset: RegistrySyncDryRunPreset;
  readonly firstSync: boolean;
  readonly nowMs?: () => number;
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function firstSyncMatches(
  expectation: RegistryFirstSyncExpectation,
  source: RegistrySnapshotSource,
  planSummary: CommerceRegistryPlanSummary,
  currentCounts: Readonly<{ categories: number; mappings: number }>,
  diffSummary: Readonly<{
    categories: Readonly<Record<Lowercase<CategoryDiffKind>, number>>;
    mappings: Readonly<Record<Lowercase<MappingDiffKind>, number>>;
  }>,
  payloadBytes: number,
): boolean {
  return source.checksum === expectation.snapshotChecksum
    && source.snapshot.sourceVersion === expectation.sourceVersion
    && source.snapshot.sourceContentCreated === expectation.sourceContentCreated
    && planSummary.classificationVersion === expectation.classificationVersion
    && planSummary.configVersion === expectation.configVersion
    && payloadBytes === expectation.payloadBytes
    && planSummary.categoryCount === expectation.categoryCount
    && planSummary.mappingCount === expectation.mappingCount
    && same(planSummary.scope, expectation.scopeCounts)
    && same(planSummary.tiers, expectation.tierCounts)
    && planSummary.automaticEligibleCount === expectation.automaticEligibleCount
    && currentCounts.categories === expectation.expectedCurrentCategoryCount
    && currentCounts.mappings === expectation.expectedCurrentMappingCount
    && same(diffSummary.categories, expectation.expectedCategoryDiff)
    && same(diffSummary.mappings, expectation.expectedMappingDiff);
}

export async function runRegistrySyncDryRun(
  input: RunRegistrySyncDryRunInput,
): Promise<Readonly<RegistrySyncPreview>> {
  const nowMs = input.nowMs ?? (() => performance.now());
  const totalStarted = nowMs();

  let started = nowMs();
  const source = await input.preset.loadSource();
  const sourceLoadMs = nowMs() - started;

  started = nowMs();
  const plan = buildCommerceRegistrySyncPlan({
    context: {
      marketplaceKey: input.preset.marketplaceKey,
      siteId: input.preset.siteId,
      verticalKey: input.preset.verticalKey,
      rootExternalCategoryId: input.preset.rootExternalCategoryId,
      sourceVersion: source.snapshot.sourceVersion,
      expectedClassificationVersion: input.preset.expectedClassificationVersion,
      configVersion: input.preset.configVersion,
      checkedAt: source.checkedAt,
    },
    taxonomyTree: source.taxonomyTree,
    classifyCategory: input.preset.classifyCategory,
  });
  const plannerMs = nowMs() - started;

  started = nowMs();
  const payload = buildAtomicRegistryApplyPayload(plan);
  validateAtomicRegistryApplyPayload(payload);
  const payloadBuildMs = nowMs() - started;

  started = nowMs();
  const serializedPayload = JSON.stringify(payload);
  const measurement = measureAtomicRegistryApplyPayload(payload);
  const payloadSha256 = sha256Utf8(serializedPayload);
  const rpcWrapperBytesEstimate = Buffer.byteLength(JSON.stringify({ p_payload: payload }), "utf8");
  const payloadSerializationMs = nowMs() - started;

  started = nowMs();
  const current = await loadCurrentCommerceRegistryState({
    client: input.readClient,
    marketplaceKey: input.preset.marketplaceKey,
    siteId: input.preset.siteId,
    verticalKey: input.preset.verticalKey,
    rootExternalCategoryId: input.preset.rootExternalCategoryId,
    desiredExternalCategoryIds: plan.categories.map((category) => category.externalCategoryId),
  });
  const currentReadMs = nowMs() - started;

  started = nowMs();
  const diff = diffCommerceRegistryState(plan, current);
  const diffMs = nowMs() - started;
  const blockers: string[] = [];
  if (input.firstSync && !firstSyncMatches(
    input.preset.firstSyncExpectation,
    source,
    plan.summary,
    { categories: current.categories.length, mappings: current.mappings.length },
    diff.summary,
    measurement.bytes,
  )) blockers.push("REGISTRY_SYNC_EXPECTATION_MISMATCH");

  const zeroPerformance: RegistrySyncPerformance = {
    sourceLoadMs, plannerMs, payloadBuildMs, payloadSerializationMs, currentReadMs, diffMs,
    previewMs: 0, totalMs: 0,
  };
  started = nowMs();
  const draft = buildRegistrySyncPreview({
    target: input.target,
    presetId: input.preset.presetId,
    firstSync: input.firstSync,
    snapshot: source.snapshot,
    snapshotChecksum: source.checksum,
    plan,
    current,
    diff,
    payloadBytes: measurement.bytes,
    payloadKibibytes: measurement.kibibytes,
    payloadMebibytes: measurement.mebibytes,
    payloadSha256,
    rpcWrapperBytesEstimate,
    blockers,
    warnings: [],
    performance: zeroPerformance,
  });
  const previewMs = nowMs() - started;
  const totalMs = nowMs() - totalStarted;
  return Object.freeze({
    ...draft,
    performance: Object.freeze({ ...zeroPerformance, previewMs, totalMs }),
  });
}
