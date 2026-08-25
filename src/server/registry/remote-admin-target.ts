import type { RemoteRegistrySyncTarget } from "./admin-target.js";
import {
  AUTOACHADO_REMOTE_PROJECT_REF,
  AUTOACHADO_REMOTE_SUPABASE_URL,
  REMOTE_ADMIN_CREDENTIAL_MAX_BUFFER_BYTES,
  REMOTE_ADMIN_CREDENTIAL_TIMEOUT_MS,
  parseRemoteAdminSecret,
  resolveRemoteAdminCredential,
  validateRemoteRegistryUrl,
  type RemoteApiKeysCommandResult,
  type ResolveRemoteAdminCredentialDependencies,
} from "./remote-admin-credential.js";
import {
  registryReadClientFromSupabase,
  type RegistryReadClient,
} from "./current-state.js";
import { createSupabaseServerClient } from "../supabase/client.js";

export {
  AUTOACHADO_REMOTE_PROJECT_REF,
  AUTOACHADO_REMOTE_SUPABASE_URL,
  REMOTE_ADMIN_CREDENTIAL_MAX_BUFFER_BYTES,
  REMOTE_ADMIN_CREDENTIAL_TIMEOUT_MS,
  parseRemoteAdminSecret,
  validateRemoteRegistryUrl,
};
export type { RemoteApiKeysCommandResult };

export interface ResolvedRemoteRegistryAdminTarget {
  readonly target: Readonly<RemoteRegistrySyncTarget>;
  readonly readClient: RegistryReadClient;
  readonly credentialResolveMs: number;
}

export interface ResolveRemoteRegistryAdminTargetDependencies
  extends ResolveRemoteAdminCredentialDependencies {
  readonly createReadClient?: (url: string, secret: string) => RegistryReadClient;
}

export function resolveRemoteRegistryAdminTarget(
  dependencies: ResolveRemoteRegistryAdminTargetDependencies = {},
): Readonly<ResolvedRemoteRegistryAdminTarget> {
  const credential = resolveRemoteAdminCredential(dependencies);
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
    credentialResolveMs: credential.credentialResolveMs,
  });
}
