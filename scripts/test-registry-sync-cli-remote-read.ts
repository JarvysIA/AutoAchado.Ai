import {
  AUTOACHADO_REMOTE_PROJECT_REF,
  resolveRemoteRegistryAdminTarget,
} from "../src/server/registry/remote-admin-target.js";
import { automotiveRegistryDryRunPreset } from "../src/server/registry/automotive-registry-preset.js";
import { loadCurrentCommerceRegistryState } from "../src/server/registry/current-state.js";
import {
  RegistrySyncDryRunError,
  runRegistrySyncDryRun,
} from "../src/server/registry/sync-orchestrator.js";
import { digestCurrentCommerceRegistryState } from "../src/server/registry/sync-preview.js";

const EXPECTED_SNAPSHOT_CHECKSUM = "c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2";
const EXPECTED_PAYLOAD_SHA256 = "f6f728ca67bc55680398d23d6d2a972527b4481a4743ef384095e3624a071678";

const ensure: (condition: unknown, marker: string) => asserts condition = (condition, marker) => {
  if (!condition) throw new Error(marker);
};

async function main(): Promise<void> {
  const resolved = resolveRemoteRegistryAdminTarget();
  ensure(resolved.target.projectRef === AUTOACHADO_REMOTE_PROJECT_REF, "REMOTE_PROJECT_REF_MISMATCH");
  const source = await automotiveRegistryDryRunPreset.loadSource();
  const desiredExternalCategoryIds = source.snapshot.nodes.map((node) => node.externalCategoryId);
  const readInput = {
    client: resolved.readClient,
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    verticalKey: "AUTOMOTIVE",
    rootExternalCategoryId: "MLB5672",
    desiredExternalCategoryIds,
  } as const;

  const before = await loadCurrentCommerceRegistryState(readInput);
  const beforeDigest = digestCurrentCommerceRegistryState(before);
  const preview = await runRegistrySyncDryRun({
    target: resolved.target,
    readClient: resolved.readClient,
    preset: automotiveRegistryDryRunPreset,
    firstSync: true,
  });
  const after = await loadCurrentCommerceRegistryState(readInput);
  const afterDigest = digestCurrentCommerceRegistryState(after);

  ensure(before.categories.length === 0 && before.mappings.length === 0,
    "BLOCKED_0B3C4C_REMOTE_FIRST_SYNC_STATE_MISMATCH");
  ensure(after.categories.length === before.categories.length && after.mappings.length === before.mappings.length,
    "BLOCKED_0B3C4C_REMOTE_DATA_MUTATION");
  ensure(afterDigest === beforeDigest, "BLOCKED_0B3C4C_REMOTE_DATA_MUTATION");
  ensure(preview.safety.previewStatus === "READY", "REGISTRY_SYNC_EXPECTATION_MISMATCH");
  ensure(preview.safety.rpcApplyCalls === 0, "BLOCKED_0B3C4C_REMOTE_RPC_VIOLATION");
  ensure(preview.desired.categoryCount === 3_269 && preview.desired.mappingCount === 3_269,
    "REMOTE_DESIRED_COUNTS_MISMATCH");
  ensure(preview.changes.categories.insert === 3_269 && preview.changes.mappings.insert === 3_269,
    "REMOTE_DIFF_COUNTS_MISMATCH");
  ensure(preview.desired.scope.allowed === 470 && preview.desired.scope.review === 1_950
    && preview.desired.scope.excluded === 849 && preview.desired.scope.unknown === 0,
  "REMOTE_SCOPE_COUNTS_MISMATCH");
  ensure(preview.desired.tiers.A === 28 && preview.desired.tiers.B === 116
    && preview.desired.tiers.C === 326 && preview.desired.automaticEligibleCount === 144,
  "REMOTE_TIER_COUNTS_MISMATCH");
  ensure(preview.payload.bytes === 1_603_538 && preview.payload.rpcWrapperBytesEstimate === 1_603_552,
    "REMOTE_PAYLOAD_SIZE_MISMATCH");
  ensure(preview.payload.sha256 === EXPECTED_PAYLOAD_SHA256, "REMOTE_PAYLOAD_HASH_MISMATCH");
  ensure(preview.source.checksum === EXPECTED_SNAPSHOT_CHECKSUM, "REMOTE_SNAPSHOT_HASH_MISMATCH");

  process.stdout.write(`${JSON.stringify({
    target: resolved.target,
    before: { categories: before.categories.length, mappings: before.mappings.length, digest: beforeDigest },
    preview: {
      status: preview.safety.previewStatus,
      desired: preview.desired,
      changes: preview.changes,
      snapshotChecksum: preview.source.checksum,
      payload: preview.payload,
      fingerprint: preview.fingerprint,
      performance: { credentialResolveMs: resolved.credentialResolveMs, ...preview.performance },
    },
    after: { categories: after.categories.length, mappings: after.mappings.length, digest: afterDigest },
    delta: { categories: 0, mappings: 0, digestChanged: false },
    rpcApplyCalls: 0,
    dmlCalls: 0,
  })}\n`);
}

try {
  await main();
} catch (error) {
  const marker = error instanceof RegistrySyncDryRunError ? error.code
    : error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message
      : "REGISTRY_SYNC_DRY_RUN_FAILED";
  process.stderr.write(`${marker}\n`);
  process.exitCode = 1;
}
