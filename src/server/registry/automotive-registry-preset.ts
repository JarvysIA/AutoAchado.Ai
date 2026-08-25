import { readFile } from "node:fs/promises";
import {
  AUTOMOTIVE_CLASSIFICATION_VERSION,
  classifyAutomotiveCategory,
} from "../../commerce/classification/automotive/index.js";
import { COMMERCE_REGISTRY_SYNC_CONFIG_VERSION } from "../../commerce/registry/types.js";
import {
  checksumAutomotiveTaxonomySnapshot,
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../../taxonomy/automotive-snapshot.js";
import type { TaxonomyTree } from "../../taxonomy/tree.js";
import type {
  RegistryFirstSyncExpectation,
  RegistrySnapshotSource,
  RegistrySyncDryRunPreset,
} from "./sync-orchestrator.js";

export const AUTOMOTIVE_REGISTRY_PRESET_ID = "AUTOMOTIVE_MLB_FROZEN_V1" as const;
export const AUTOMOTIVE_REGISTRY_SNAPSHOT_CHECKSUM =
  "c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2" as const;

export const AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION: Readonly<RegistryFirstSyncExpectation> =
  Object.freeze({
    snapshotChecksum: AUTOMOTIVE_REGISTRY_SNAPSHOT_CHECKSUM,
    sourceVersion: "sha256:5c6729e182065083d87b922690c350e85f9d2ccaa773c23b76dea6b7cfd8b2dc",
    sourceContentCreated: "2026-08-21T17:03:43.000Z",
    classificationVersion: AUTOMOTIVE_CLASSIFICATION_VERSION,
    configVersion: COMMERCE_REGISTRY_SYNC_CONFIG_VERSION,
    payloadBytes: 1_603_538,
    categoryCount: 3_269,
    mappingCount: 3_269,
    scopeCounts: Object.freeze({ allowed: 470, review: 1_950, excluded: 849, unknown: 0 }),
    tierCounts: Object.freeze({ A: 28, B: 116, C: 326 }),
    automaticEligibleCount: 144,
    expectedCurrentCategoryCount: 0,
    expectedCurrentMappingCount: 0,
    expectedCategoryDiff: Object.freeze({ insert: 3_269, update: 0, unchanged: 0, reactivate: 0 }),
    expectedMappingDiff: Object.freeze({
      insert: 3_269,
      update: 0,
      unchanged: 0,
      reactivate: 0,
      inactivate: 0,
      manual_override_skipped: 0,
    }),
  });

const snapshotUrl = new URL("../../../tests/fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);

export async function loadFrozenAutomotiveRegistrySource(): Promise<Readonly<RegistrySnapshotSource>> {
  const serialized = await readFile(snapshotUrl, "utf8");
  const checksum = checksumAutomotiveTaxonomySnapshot(serialized);
  const { snapshot } = validateAutomotiveTaxonomySnapshot(JSON.parse(serialized) as unknown);
  if (snapshot.sourceContentCreated === null) {
    throw new Error("REGISTRY_SYNC_EXPECTATION_MISMATCH");
  }
  return Object.freeze({
    snapshot,
    taxonomyTree: snapshotToTaxonomyTree(snapshot),
    checksum,
    checkedAt: snapshot.sourceContentCreated,
  });
}

export const automotiveRegistryDryRunPreset: Readonly<RegistrySyncDryRunPreset> = Object.freeze({
  presetId: AUTOMOTIVE_REGISTRY_PRESET_ID,
  marketplaceKey: "MERCADO_LIVRE",
  siteId: "MLB",
  verticalKey: "AUTOMOTIVE",
  rootExternalCategoryId: "MLB5672",
  configVersion: COMMERCE_REGISTRY_SYNC_CONFIG_VERSION,
  expectedClassificationVersion: AUTOMOTIVE_CLASSIFICATION_VERSION,
  loadSource: loadFrozenAutomotiveRegistrySource,
  classifyCategory: (externalCategoryId: string, taxonomyTree: TaxonomyTree) => {
    const result = classifyAutomotiveCategory(externalCategoryId, taxonomyTree);
    return {
      externalCategoryId: result.categoryId,
      scopeStatus: result.scopeStatus,
      priorityTier: result.priorityTier,
      familyKey: result.familyKey,
      commercialFamilyKeyDefault: result.commercialFamilyKeyDefault,
      ruleId: result.ruleId,
      classificationVersion: result.classificationVersion,
      reason: result.reason,
    };
  },
  firstSyncExpectation: AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION,
});
