import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  registryReadClientFromSupabase,
  type RegistryReadClient,
} from "./current-state.js";
import type { RegistryApplyRpcClient } from "./executor.js";
import { registrySyncDryRunError } from "./sync-orchestrator.js";

export const AUTOACHADO_REMOTE_PROJECT_REF = "nrwhzfahjypybjyajmrj" as const;

export interface LocalRegistrySyncTarget {
  readonly kind: "LOCAL";
  readonly label: "LOCAL";
  readonly projectRef: null;
  readonly baseUrl: string;
}

export interface RemoteRegistrySyncTarget {
  readonly kind: "REMOTE";
  readonly label: "REMOTE";
  readonly projectRef: typeof AUTOACHADO_REMOTE_PROJECT_REF;
  readonly baseUrl: string;
}

export type RegistrySyncTarget = LocalRegistrySyncTarget | RemoteRegistrySyncTarget;

export interface ResolvedLocalRegistryAdminTarget {
  readonly target: Readonly<LocalRegistrySyncTarget>;
  readonly readClient: RegistryReadClient;
}

export interface ResolvedLocalRegistryApplyTarget extends ResolvedLocalRegistryAdminTarget {
  readonly createApplyClient: () => Promise<RegistryApplyRpcClient>;
}

export interface LocalSupabaseStatusResult {
  readonly status: number | null;
  readonly stdout: string;
}

export interface ResolveLocalRegistryAdminTargetDependencies {
  readonly runStatus?: () => LocalSupabaseStatusResult;
  readonly createReadClient?: (url: string, secret: string) => RegistryReadClient;
}

export interface ResolveLocalRegistryApplyTargetDependencies
  extends ResolveLocalRegistryAdminTargetDependencies {
  readonly createApplyClient?: (
    url: string,
    secret: string,
  ) => RegistryApplyRpcClient | PromiseLike<RegistryApplyRpcClient>;
}

function runLocalStatus(): LocalSupabaseStatusResult {
  const command = resolve(process.cwd(), "node_modules/supabase/dist/supabase.js");
  const result = spawnSync(process.execPath, [command, "status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

function parseStatus(stdout: string): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^"|"$/g, "");
  }
  return values;
}

export function validateLocalRegistryUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target local inválido");
  }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target local inválido");
  }
  return url.toString().replace(/\/$/, "");
}

function localCredentials(
  dependencies: Pick<ResolveLocalRegistryAdminTargetDependencies, "runStatus">,
): Readonly<{ baseUrl: string; secret: string }> {
  const result = (dependencies.runStatus ?? runLocalStatus)();
  if (result.status !== 0) {
    throw registrySyncDryRunError("REGISTRY_SYNC_LOCAL_ENV_UNAVAILABLE", "Supabase local indisponível");
  }
  const values = parseStatus(result.stdout);
  const rawUrl = values.API_URL;
  const secret = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;
  if (!rawUrl || !secret) {
    throw registrySyncDryRunError("REGISTRY_SYNC_LOCAL_ENV_UNAVAILABLE", "Supabase local indisponível");
  }
  return Object.freeze({ baseUrl: validateLocalRegistryUrl(rawUrl), secret });
}

function supabaseClient(baseUrl: string, secret: string) {
  return createClient(baseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function resolveLocalRegistryAdminTarget(
  dependencies: ResolveLocalRegistryAdminTargetDependencies = {},
): Readonly<ResolvedLocalRegistryAdminTarget> {
  const { baseUrl, secret } = localCredentials(dependencies);
  const readClient = dependencies.createReadClient?.(baseUrl, secret)
    ?? registryReadClientFromSupabase(supabaseClient(baseUrl, secret));
  return Object.freeze({
    target: Object.freeze({ kind: "LOCAL", label: "LOCAL", projectRef: null, baseUrl }),
    readClient,
  });
}

export function resolveLocalRegistryApplyTarget(
  expectedBaseUrl: string,
  dependencies: ResolveLocalRegistryApplyTargetDependencies = {},
): Readonly<ResolvedLocalRegistryApplyTarget> {
  const { baseUrl, secret } = localCredentials(dependencies);
  if (baseUrl !== validateLocalRegistryUrl(expectedBaseUrl)) {
    throw registrySyncDryRunError("REGISTRY_SYNC_TARGET_MISMATCH", "Target local mudou após confirmação");
  }
  const readClient = dependencies.createReadClient?.(baseUrl, secret)
    ?? registryReadClientFromSupabase(supabaseClient(baseUrl, secret));
  return Object.freeze({
    target: Object.freeze({ kind: "LOCAL", label: "LOCAL", projectRef: null, baseUrl }),
    readClient,
    createApplyClient: async () => {
      if (dependencies.createApplyClient) {
        return dependencies.createApplyClient(baseUrl, secret);
      }
      const { registryApplyClientFromSupabase } = await import("./executor.js");
      return registryApplyClientFromSupabase(supabaseClient(baseUrl, secret));
    },
  });
}
