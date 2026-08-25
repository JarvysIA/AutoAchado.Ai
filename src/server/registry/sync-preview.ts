import { createHash } from "node:crypto";
import { COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION } from "../../commerce/registry/apply-payload.js";
import type {
  CategoryDiffKind,
  CommerceRegistryStateDiff,
  CommerceRegistrySyncPlan,
  CurrentCommerceRegistryState,
  MappingDiffKind,
} from "../../commerce/registry/types.js";
import type { AutomotiveTaxonomySnapshot } from "../../taxonomy/automotive-snapshot.js";
import type { RegistrySyncTarget } from "./admin-target.js";
import { COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION } from "./validation.js";

export const COMMERCE_REGISTRY_SYNC_PREVIEW_CONTRACT_VERSION =
  "commerce-registry-sync-preview/v1" as const;
export const REGISTRY_SYNC_SAMPLE_LIMIT = 10;

export type RegistrySyncMode = "DRY_RUN";

export interface RegistrySyncPerformance {
  readonly sourceLoadMs: number;
  readonly plannerMs: number;
  readonly payloadBuildMs: number;
  readonly payloadSerializationMs: number;
  readonly currentReadMs: number;
  readonly diffMs: number;
  readonly previewMs: number;
  readonly totalMs: number;
}

export interface RegistrySyncFingerprint {
  readonly algorithm: "sha256";
  readonly value: string;
  readonly token: string;
}

export interface RegistrySyncChangeSample {
  readonly kind: CategoryDiffKind | MappingDiffKind;
  readonly externalCategoryId: string;
}

export interface BuildRegistrySyncPreviewInput {
  readonly target: RegistrySyncTarget;
  readonly presetId: string;
  readonly firstSync: boolean;
  readonly snapshot: AutomotiveTaxonomySnapshot;
  readonly snapshotChecksum: string;
  readonly plan: CommerceRegistrySyncPlan;
  readonly current: CurrentCommerceRegistryState;
  readonly diff: CommerceRegistryStateDiff;
  readonly payloadBytes: number;
  readonly payloadKibibytes: number;
  readonly payloadMebibytes: number;
  readonly payloadSha256: string;
  readonly rpcWrapperBytesEstimate: number;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly performance: RegistrySyncPerformance;
}

export interface RegistrySyncPreview {
  readonly contractVersion: typeof COMMERCE_REGISTRY_SYNC_PREVIEW_CONTRACT_VERSION;
  readonly mode: RegistrySyncMode;
  readonly target: Readonly<RegistrySyncTarget>;
  readonly presetId: string;
  readonly firstSync: boolean;
  readonly context: Readonly<CommerceRegistrySyncPlan["context"]>;
  readonly source: Readonly<{
    schemaVersion: string;
    checksum: string;
    sourceVersion: string;
    sourceContentCreated: string;
    checkedAt: string;
    nodeCount: number;
  }>;
  readonly current: Readonly<{ categories: number; mappings: number; controlledMappings: number; digest: string }>;
  readonly desired: Readonly<CommerceRegistrySyncPlan["summary"]>;
  readonly changes: Readonly<CommerceRegistryStateDiff["summary"]>;
  readonly payload: Readonly<{
    bytes: number;
    kibibytes: number;
    mebibytes: number;
    sha256: string;
    rpcWrapperBytesEstimate: number;
  }>;
  readonly samples: Readonly<{
    categories: Readonly<Record<Lowercase<CategoryDiffKind>, readonly RegistrySyncChangeSample[]>>;
    mappings: Readonly<Record<Lowercase<MappingDiffKind>, readonly RegistrySyncChangeSample[]>>;
  }>;
  readonly safety: Readonly<{
    previewStatus: "READY" | "BLOCKED";
    writeCapability: "DISABLED_IN_THIS_BUILD";
    rpcApplyCalls: 0;
    warnings: readonly string[];
    blockers: readonly string[];
  }>;
  readonly fingerprint: Readonly<RegistrySyncFingerprint>;
  readonly performance: Readonly<RegistrySyncPerformance>;
}

export function sha256Utf8(value: string): string {
  const hash = createHash("sha256");
  hash.write(value, "utf8");
  hash.end();
  return hash.digest("hex");
}

function categoryIdentity(value: CurrentCommerceRegistryState["categories"][number]): string {
  return JSON.stringify([value.marketplaceKey, value.siteId, value.externalCategoryId]);
}

function mappingIdentity(value: CurrentCommerceRegistryState["mappings"][number]): string {
  return JSON.stringify([value.verticalKey, value.marketplaceKey, value.siteId, value.externalCategoryId]);
}

export function digestCurrentCommerceRegistryState(current: CurrentCommerceRegistryState): string {
  const categories = [...current.categories]
    .sort((left, right) => categoryIdentity(left).localeCompare(categoryIdentity(right)))
    .map((value) => ({
      marketplaceKey: value.marketplaceKey,
      siteId: value.siteId,
      externalCategoryId: value.externalCategoryId,
      parentExternalCategoryId: value.parentExternalCategoryId,
      name: value.name,
      pathExternalIds: [...value.pathExternalIds],
      pathNames: [...value.pathNames],
      isLeaf: value.isLeaf,
      active: value.active,
      sourceVersion: value.sourceVersion,
      configVersion: value.configVersion,
    }));
  const mappings = [...current.mappings]
    .sort((left, right) => mappingIdentity(left).localeCompare(mappingIdentity(right)))
    .map((value) => ({
      verticalKey: value.verticalKey,
      marketplaceKey: value.marketplaceKey,
      siteId: value.siteId,
      externalCategoryId: value.externalCategoryId,
      scopeStatus: value.scopeStatus,
      priorityTier: value.priorityTier,
      familyKey: value.familyKey,
      commercialFamilyKeyDefault: value.commercialFamilyKeyDefault,
      classificationRule: value.classificationRule,
      classificationVersion: value.classificationVersion,
      manualOverride: value.manualOverride,
      decisionSource: value.decisionSource,
      decisionReason: value.decisionReason,
      active: value.active,
    }));
  return sha256Utf8(JSON.stringify({
    categories,
    mappings,
    controlledMappingExternalCategoryIds: [...current.controlledMappingExternalCategoryIds].sort(),
  }));
}

function categorySamples(diff: CommerceRegistryStateDiff) {
  const output: Record<Lowercase<CategoryDiffKind>, RegistrySyncChangeSample[]> = {
    insert: [], update: [], unchanged: [], reactivate: [],
  };
  const operations = [...diff.categories].sort((left, right) =>
    left.desired.externalCategoryId.localeCompare(right.desired.externalCategoryId));
  for (const operation of operations) {
    const key = operation.kind.toLowerCase() as Lowercase<CategoryDiffKind>;
    if (output[key].length < REGISTRY_SYNC_SAMPLE_LIMIT) {
      output[key].push(Object.freeze({ kind: operation.kind, externalCategoryId: operation.desired.externalCategoryId }));
    }
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(output).map(([key, values]) => [key, Object.freeze(values)]),
  )) as Readonly<Record<Lowercase<CategoryDiffKind>, readonly RegistrySyncChangeSample[]>>;
}

function mappingSamples(diff: CommerceRegistryStateDiff) {
  const output: Record<Lowercase<MappingDiffKind>, RegistrySyncChangeSample[]> = {
    insert: [], update: [], unchanged: [], reactivate: [], inactivate: [], manual_override_skipped: [],
  };
  const externalCategoryId = (operation: CommerceRegistryStateDiff["mappings"][number]) =>
    operation.desired?.externalCategoryId ?? operation.current!.externalCategoryId;
  const operations = [...diff.mappings].sort((left, right) =>
    externalCategoryId(left).localeCompare(externalCategoryId(right)));
  for (const operation of operations) {
    const key = operation.kind.toLowerCase() as Lowercase<MappingDiffKind>;
    if (output[key].length < REGISTRY_SYNC_SAMPLE_LIMIT) {
      output[key].push(Object.freeze({
        kind: operation.kind,
        externalCategoryId: externalCategoryId(operation),
      }));
    }
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(output).map(([key, values]) => [key, Object.freeze(values)]),
  )) as Readonly<Record<Lowercase<MappingDiffKind>, readonly RegistrySyncChangeSample[]>>;
}

export function buildRegistrySyncPreview(
  input: BuildRegistrySyncPreviewInput,
): Readonly<RegistrySyncPreview> {
  const currentDigest = digestCurrentCommerceRegistryState(input.current);
  const fingerprintValue = sha256Utf8(JSON.stringify({
    previewContractVersion: COMMERCE_REGISTRY_SYNC_PREVIEW_CONTRACT_VERSION,
    mode: "DRY_RUN",
    targetKind: input.target.kind,
    projectRef: input.target.projectRef,
    presetId: input.presetId,
    marketplaceKey: input.plan.context.marketplaceKey,
    siteId: input.plan.context.siteId,
    verticalKey: input.plan.context.verticalKey,
    rootExternalCategoryId: input.plan.context.rootExternalCategoryId,
    inputContractVersion: COMMERCE_REGISTRY_APPLY_CONTRACT_VERSION,
    outputContractVersion: COMMERCE_REGISTRY_APPLY_RESULT_CONTRACT_VERSION,
    sourceVersion: input.plan.context.sourceVersion,
    classificationVersion: input.plan.context.expectedClassificationVersion,
    configVersion: input.plan.context.configVersion,
    snapshotChecksum: input.snapshotChecksum,
    payloadSha256: input.payloadSha256,
    payloadBytes: input.payloadBytes,
    desiredSummary: input.plan.summary,
    diffSummary: input.diff.summary,
    currentStateDigest: currentDigest,
    firstSync: input.firstSync,
  }));
  const token = [
    "AUTOACHADO",
    input.target.kind,
    input.plan.context.rootExternalCategoryId,
    input.plan.summary.categoryCount,
    fingerprintValue.slice(0, 12).toUpperCase(),
  ].join(":");
  return Object.freeze({
    contractVersion: COMMERCE_REGISTRY_SYNC_PREVIEW_CONTRACT_VERSION,
    mode: "DRY_RUN",
    target: Object.freeze({ ...input.target }),
    presetId: input.presetId,
    firstSync: input.firstSync,
    context: Object.freeze({ ...input.plan.context }),
    source: Object.freeze({
      schemaVersion: input.snapshot.schemaVersion,
      checksum: input.snapshotChecksum,
      sourceVersion: input.snapshot.sourceVersion,
      sourceContentCreated: input.snapshot.sourceContentCreated!,
      checkedAt: input.plan.context.checkedAt,
      nodeCount: input.snapshot.nodeCount,
    }),
    current: Object.freeze({
      categories: input.current.categories.length,
      mappings: input.current.mappings.length,
      controlledMappings: input.current.controlledMappingExternalCategoryIds.length,
      digest: currentDigest,
    }),
    desired: input.plan.summary,
    changes: input.diff.summary,
    payload: Object.freeze({
      bytes: input.payloadBytes,
      kibibytes: input.payloadKibibytes,
      mebibytes: input.payloadMebibytes,
      sha256: input.payloadSha256,
      rpcWrapperBytesEstimate: input.rpcWrapperBytesEstimate,
    }),
    samples: Object.freeze({ categories: categorySamples(input.diff), mappings: mappingSamples(input.diff) }),
    safety: Object.freeze({
      previewStatus: input.blockers.length === 0 ? "READY" : "BLOCKED",
      writeCapability: "DISABLED_IN_THIS_BUILD",
      rpcApplyCalls: 0,
      warnings: Object.freeze([...input.warnings]),
      blockers: Object.freeze([...input.blockers]),
    }),
    fingerprint: Object.freeze({ algorithm: "sha256", value: fingerprintValue, token }),
    performance: Object.freeze({ ...input.performance }),
  });
}
