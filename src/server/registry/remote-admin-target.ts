import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import {
  AUTOACHADO_REMOTE_PROJECT_REF,
  type RemoteRegistrySyncTarget,
} from "./admin-target.js";
import {
  registryReadClientFromSupabase,
  type RegistryReadClient,
} from "./current-state.js";
import { registrySyncDryRunError } from "./sync-orchestrator.js";
import { createSupabaseServerClient } from "../supabase/client.js";

export { AUTOACHADO_REMOTE_PROJECT_REF };
export const AUTOACHADO_REMOTE_SUPABASE_URL =
  `https://${AUTOACHADO_REMOTE_PROJECT_REF}.supabase.co` as const;
export const REMOTE_ADMIN_CREDENTIAL_TIMEOUT_MS = 30_000;
export const REMOTE_ADMIN_CREDENTIAL_MAX_BUFFER_BYTES = 1024 * 1024;

const MODERN_SECRET_PATTERN = /^sb_secret_[A-Za-z0-9_-]+$/;

export interface RemoteApiKeysCommandResult {
  readonly status: number | null;
  readonly stdout: string;
}

export interface ResolvedRemoteRegistryAdminTarget {
  readonly target: Readonly<RemoteRegistrySyncTarget>;
  readonly readClient: RegistryReadClient;
  readonly credentialResolveMs: number;
}

export interface ResolveRemoteRegistryAdminTargetDependencies {
  readonly runApiKeys?: () => RemoteApiKeysCommandResult;
  readonly createReadClient?: (url: string, secret: string) => RegistryReadClient;
  readonly nowMs?: () => number;
}

function credentialUnavailable(): never {
  throw registrySyncDryRunError(
    "REGISTRY_SYNC_ADMIN_CREDENTIAL_UNAVAILABLE",
    "Credencial administrativa remota indisponível",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRemoteAdminSecret(rawJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return credentialUnavailable();
  }
  if (!Array.isArray(parsed)) return credentialUnavailable();
  const matches = parsed.flatMap((value) => {
    if (!isRecord(value) || value.type !== "secret") return [];
    const apiKey = value.api_key;
    return typeof apiKey === "string" && MODERN_SECRET_PATTERN.test(apiKey) ? [apiKey] : [];
  });
  if (matches.length !== 1) return credentialUnavailable();
  return matches[0]!;
}

export function validateRemoteRegistryUrl(rawUrl: string): typeof AUTOACHADO_REMOTE_SUPABASE_URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target remoto inválido");
  }
  if (url.protocol !== "https:"
    || url.hostname !== `${AUTOACHADO_REMOTE_PROJECT_REF}.supabase.co`
    || url.port !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== "") {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target remoto inválido");
  }
  return AUTOACHADO_REMOTE_SUPABASE_URL;
}

function runRemoteApiKeys(): RemoteApiKeysCommandResult {
  const command = resolve(process.cwd(), "node_modules/supabase/dist/supabase.js");
  const result = spawnSync(process.execPath, [
    command,
    "projects",
    "api-keys",
    "--project-ref",
    AUTOACHADO_REMOTE_PROJECT_REF,
    "--reveal",
    "--output",
    "json",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: REMOTE_ADMIN_CREDENTIAL_TIMEOUT_MS,
    maxBuffer: REMOTE_ADMIN_CREDENTIAL_MAX_BUFFER_BYTES,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

export function resolveRemoteRegistryAdminTarget(
  dependencies: ResolveRemoteRegistryAdminTargetDependencies = {},
): Readonly<ResolvedRemoteRegistryAdminTarget> {
  const nowMs = dependencies.nowMs ?? (() => performance.now());
  const started = nowMs();
  const result = (dependencies.runApiKeys ?? runRemoteApiKeys)();
  if (result.status !== 0) {
    throw registrySyncDryRunError(
      "REGISTRY_SYNC_ADMIN_AUTH_UNAVAILABLE",
      "Autenticação administrativa remota indisponível",
    );
  }
  const secret = parseRemoteAdminSecret(result.stdout);
  const baseUrl = validateRemoteRegistryUrl(AUTOACHADO_REMOTE_SUPABASE_URL);
  const readClient = dependencies.createReadClient?.(baseUrl, secret)
    ?? registryReadClientFromSupabase(createSupabaseServerClient({ url: baseUrl, secretKey: secret }));
  return Object.freeze({
    target: Object.freeze({
      kind: "REMOTE",
      label: "REMOTE",
      projectRef: AUTOACHADO_REMOTE_PROJECT_REF,
      baseUrl,
    }),
    readClient,
    credentialResolveMs: nowMs() - started,
  });
}
