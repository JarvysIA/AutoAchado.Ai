import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAtomicRegistryApplyPayload,
  measureAtomicRegistryApplyPayload,
  validateAtomicRegistryApplyPayload,
  type AtomicRegistryApplyPayload,
} from "../../commerce/registry/apply-payload.js";
import { registrySyncError, type RegistrySyncErrorCode } from "../../commerce/registry/errors.js";
import type { CommerceRegistrySyncPlan } from "../../commerce/registry/types.js";
import {
  validateCommerceRegistryApplyResult,
  type CommerceRegistryApplyResult,
} from "./validation.js";

const APPLY_RPC = "apply_commerce_registry_sync" as const;
const KNOWN_MARKERS = new Set<RegistrySyncErrorCode>([
  "REGISTRY_SYNC_LOCKED",
  "REGISTRY_MARKETPLACE_NOT_FOUND",
  "REGISTRY_VERTICAL_NOT_FOUND",
  "REGISTRY_INVALID_PAYLOAD",
  "REGISTRY_COUNT_MISMATCH",
  "REGISTRY_DUPLICATE_CATEGORY",
  "REGISTRY_PARENT_MISSING",
  "REGISTRY_PATH_INVALID",
  "REGISTRY_CLASSIFICATION_INVALID",
]);

export interface RegistryApplyRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface RegistryApplyRpcClient {
  rpc(
    functionName: typeof APPLY_RPC,
    args: Readonly<{ p_payload: AtomicRegistryApplyPayload }>,
  ): PromiseLike<RegistryApplyRpcResult>;
}

export interface ApplyCommerceRegistrySyncInput {
  readonly client: RegistryApplyRpcClient;
  readonly plan: CommerceRegistrySyncPlan;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function knownMarker(error: unknown): RegistrySyncErrorCode | null {
  const value = record(error);
  if (!value) return null;
  for (const field of ["message", "code", "details", "hint"] as const) {
    const candidate = value[field];
    if (typeof candidate !== "string") continue;
    for (const marker of KNOWN_MARKERS) if (candidate.includes(marker)) return marker;
  }
  return null;
}

function failRpc(error: unknown): never {
  const marker = knownMarker(error);
  if (marker) throw registrySyncError(marker, marker);
  throw registrySyncError("REGISTRY_ATOMIC_APPLY_FAILED", "Falha sanitizada no apply atômico do registry");
}

export function registryApplyClientFromSupabase(client: SupabaseClient): RegistryApplyRpcClient {
  return {
    rpc: (functionName, args) => client.rpc(functionName, args as never) as unknown as Promise<RegistryApplyRpcResult>,
  };
}

export async function callAtomicRegistryApplyRpc(
  client: RegistryApplyRpcClient,
  payload: AtomicRegistryApplyPayload,
): Promise<Readonly<CommerceRegistryApplyResult>> {
  validateAtomicRegistryApplyPayload(payload);
  void measureAtomicRegistryApplyPayload(payload);
  let response: RegistryApplyRpcResult;
  try {
    response = await client.rpc(APPLY_RPC, { p_payload: payload });
  } catch {
    return failRpc(null);
  }
  if (response.error !== null) return failRpc(response.error);
  return validateCommerceRegistryApplyResult(response.data, payload);
}

export async function applyCommerceRegistrySync(
  input: ApplyCommerceRegistrySyncInput,
): Promise<Readonly<CommerceRegistryApplyResult>> {
  const payload = buildAtomicRegistryApplyPayload(input.plan);
  return callAtomicRegistryApplyRpc(input.client, payload);
}
