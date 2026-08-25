import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  registryReadClientFromSupabase,
  type RegistryReadClient,
} from "./current-state.js";
import { registrySyncDryRunError } from "./sync-orchestrator.js";

export interface RegistrySyncTarget {
  readonly kind: "LOCAL";
  readonly label: "LOCAL";
  readonly projectRef: null;
  readonly baseUrl: string;
}

export interface ResolvedLocalRegistryAdminTarget {
  readonly target: Readonly<RegistrySyncTarget>;
  readonly readClient: RegistryReadClient;
}

export interface LocalSupabaseStatusResult {
  readonly status: number | null;
  readonly stdout: string;
}

export interface ResolveLocalRegistryAdminTargetDependencies {
  readonly runStatus?: () => LocalSupabaseStatusResult;
  readonly createReadClient?: (url: string, secret: string) => RegistryReadClient;
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

export function resolveLocalRegistryAdminTarget(
  dependencies: ResolveLocalRegistryAdminTargetDependencies = {},
): Readonly<ResolvedLocalRegistryAdminTarget> {
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
  const baseUrl = validateLocalRegistryUrl(rawUrl);
  const readClient = dependencies.createReadClient?.(baseUrl, secret)
    ?? registryReadClientFromSupabase(createClient(baseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }));
  return Object.freeze({
    target: Object.freeze({ kind: "LOCAL", label: "LOCAL", projectRef: null, baseUrl }),
    readClient,
  });
}
