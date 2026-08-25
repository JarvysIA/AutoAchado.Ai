import type { RegistrySyncTarget } from "./admin-target.js";
import {
  resolveLocalRegistryApplyTarget,
  type LocalRegistrySyncTarget,
  type ResolvedLocalRegistryApplyTarget,
} from "./admin-target.js";
import type { RegistryReadClient } from "./current-state.js";
import type { ApplyCommerceRegistrySyncInput } from "./executor.js";
import {
  runRegistrySyncApplyEngine,
  type RegistrySyncApplyRunResult,
  type RegistrySyncConfirmationMode,
} from "./sync-apply-engine.js";
import {
  registrySyncDryRunError,
  type RegistrySyncDryRunPreset,
} from "./sync-orchestrator.js";
import type { RegistrySyncPreview } from "./sync-preview.js";
import type { CommerceRegistryApplyResult } from "./validation.js";

export {
  COMMERCE_REGISTRY_SYNC_APPLY_RUN_CONTRACT_VERSION,
  summarizeCurrentRegistryState,
} from "./sync-apply-engine.js";
export type {
  RegistrySyncApplyOutcome,
  RegistrySyncApplyPerformance,
  RegistrySyncApplyRunResult,
  RegistrySyncConfirmationMode,
  RegistrySyncCurrentSummary,
} from "./sync-apply-engine.js";

export interface RunRegistrySyncApplyInput {
  readonly target: LocalRegistrySyncTarget;
  readonly readClient: RegistryReadClient;
  readonly preset: RegistrySyncDryRunPreset;
  readonly firstSync: boolean;
  readonly confirmationMode: RegistrySyncConfirmationMode;
  readonly readConfirmationToken: (preview: Readonly<RegistrySyncPreview>) => Promise<string>;
  readonly resolveApplyTarget?: (
    expectedBaseUrl: string,
  ) => ResolvedLocalRegistryApplyTarget | PromiseLike<ResolvedLocalRegistryApplyTarget>;
  readonly applyRegistrySync?: (
    input: ApplyCommerceRegistrySyncInput,
  ) => Promise<Readonly<CommerceRegistryApplyResult>>;
  readonly nowMs?: () => number;
}

export async function runRegistrySyncApply(
  input: RunRegistrySyncApplyInput,
): Promise<Readonly<RegistrySyncApplyRunResult>> {
  if ((input.target as RegistrySyncTarget).kind !== "LOCAL") {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_REMOTE_APPLY_NOT_ENABLED",
      "Apply remoto indisponível neste build",
    );
  }
  return runRegistrySyncApplyEngine({
    target: input.target,
    readClient: input.readClient,
    preset: input.preset,
    firstSync: input.firstSync,
    confirmationMode: input.confirmationMode,
    confirmationTokenForPreview: (preview) => preview.fingerprint.token,
    readConfirmationToken: async (preview) => input.readConfirmationToken(preview),
    resolveApplyTarget: async (expectedTarget) => (
      input.resolveApplyTarget ?? resolveLocalRegistryApplyTarget
    )(expectedTarget.baseUrl),
    ...(input.applyRegistrySync === undefined ? {} : { applyRegistrySync: input.applyRegistrySync }),
    ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }),
  });
}
