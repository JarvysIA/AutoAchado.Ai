import type { RemoteRegistrySyncTarget } from "./admin-target.js";
import {
  registryReadClientFromSupabase,
  type RegistryReadClient,
} from "./current-state.js";
import type { RegistryApplyRpcClient } from "./executor.js";
import {
  AUTOACHADO_REMOTE_PROJECT_REF,
  AUTOACHADO_REMOTE_SUPABASE_URL,
  resolveRemoteAdminCredential,
  type ResolvedRemoteAdminCredential,
} from "./remote-admin-credential.js";
import type { ResolvedRegistryApplyTarget } from "./sync-apply-engine.js";
import { registrySyncDryRunError } from "./sync-orchestrator.js";
import { createSupabaseServerClient } from "../supabase/client.js";

export interface ResolveFirstRemoteRegistryApplyTargetDependencies {
  readonly resolveCredential?: () => Readonly<ResolvedRemoteAdminCredential>;
  readonly createReadClient?: (url: string, secret: string) => RegistryReadClient;
  readonly createApplyClient?: (
    url: string,
    secret: string,
  ) => RegistryApplyRpcClient | PromiseLike<RegistryApplyRpcClient>;
}

export type ResolvedFirstRemoteRegistryApplyTarget =
  ResolvedRegistryApplyTarget<RemoteRegistrySyncTarget>;

function assertExpectedRemoteTarget(target: Readonly<RemoteRegistrySyncTarget>): void {
  if (target.kind !== "REMOTE"
    || target.projectRef !== AUTOACHADO_REMOTE_PROJECT_REF
    || target.baseUrl !== AUTOACHADO_REMOTE_SUPABASE_URL) {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target remoto mudou após confirmação");
  }
}

export function resolveFirstRemoteRegistryApplyTarget(
  expectedTarget: Readonly<RemoteRegistrySyncTarget>,
  dependencies: ResolveFirstRemoteRegistryApplyTargetDependencies = {},
): Readonly<ResolvedFirstRemoteRegistryApplyTarget> {
  assertExpectedRemoteTarget(expectedTarget);
  const credential = (dependencies.resolveCredential ?? resolveRemoteAdminCredential)();
  if (credential.baseUrl !== expectedTarget.baseUrl) {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target remoto mudou após confirmação");
  }
  const readClient = dependencies.createReadClient?.(credential.baseUrl, credential.secret)
    ?? registryReadClientFromSupabase(createSupabaseServerClient({
      url: credential.baseUrl,
      secretKey: credential.secret,
    }));
  return Object.freeze({
    target: Object.freeze({
      kind: "REMOTE",
      label: "REMOTE",
      projectRef: AUTOACHADO_REMOTE_PROJECT_REF,
      baseUrl: AUTOACHADO_REMOTE_SUPABASE_URL,
    }),
    readClient,
    createApplyClient: async () => {
      if (dependencies.createApplyClient) {
        return dependencies.createApplyClient(credential.baseUrl, credential.secret);
      }
      const { registryApplyClientFromSupabase } = await import("./executor.js");
      return registryApplyClientFromSupabase(createSupabaseServerClient({
        url: credential.baseUrl,
        secretKey: credential.secret,
      }));
    },
  });
}
