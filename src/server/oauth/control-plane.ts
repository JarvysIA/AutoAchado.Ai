import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTROL_PLANE_RESPONSE_INVALID = "CONTROL_PLANE_RESPONSE_INVALID";
export const CONTROL_PLANE_REQUEST_FAILED = "CONTROL_PLANE_REQUEST_FAILED";

export type ClaimOutcome =
  | "CLAIMED"
  | "LOCK_BUSY"
  | "NOT_FOUND"
  | "REAUTH_REQUIRED"
  | "OUTCOME_UNKNOWN"
  | "DISABLED"
  | "SECRET_MISSING";
export type CompleteOutcome =
  | "COMPLETED"
  | "NOT_FOUND"
  | "NOT_REFRESHING"
  | "STALE_VERSION"
  | "LEASE_MISMATCH"
  | "SECRET_MISSING";
export type FailOutcome =
  | "FAILURE_RECORDED"
  | "NOT_FOUND"
  | "NOT_REFRESHING"
  | "STALE_VERSION"
  | "LEASE_MISMATCH";
export type FailureOutcomeClass =
  | "SAFE_RETRY"
  | "REAUTH_REQUIRED"
  | "OUTCOME_UNKNOWN"
  | "CONFIG_ERROR";

export type InitializeOutcome =
  | "INITIALIZED"
  | "REAUTHORIZED"
  | "ALREADY_INITIALIZED"
  | "LOCK_BUSY"
  | "STATE_NOT_ALLOWED";

export interface InitializeResult {
  outcome: InitializeOutcome;
  externalUserId: number;
  tokenVersion: number;
  status: string;
  reauthRequired: boolean;
}

export type ClaimResult =
  | {
      outcome: "CLAIMED";
      externalUserId: number;
      leaseId: string;
      expectedVersion: number;
      refreshToken: string;
      leaseExpiresAt: string;
    }
  | {
      outcome: Exclude<ClaimOutcome, "CLAIMED">;
      externalUserId: number;
      expectedVersion: number | null;
      leaseExpiresAt: string | null;
    };

export interface CompleteResult {
  outcome: CompleteOutcome;
  externalUserId: number;
  tokenVersion: number | null;
  status: string | null;
}

export interface FailResult {
  outcome: FailOutcome;
  externalUserId: number;
  tokenVersion: number | null;
  status: string | null;
}

export interface MeliOAuthControlPlane {
  initializeConnection(externalUserId: number, refreshToken: string): Promise<InitializeResult>;
  claimRefresh(externalUserId: number): Promise<ClaimResult>;
  completeRefresh(input: {
    externalUserId: number;
    leaseId: string;
    expectedVersion: number;
    newRefreshToken: string;
  }): Promise<CompleteResult>;
  failRefresh(input: {
    externalUserId: number;
    leaseId: string;
    expectedVersion: number;
    errorCode: string;
    outcomeClass: FailureOutcomeClass;
  }): Promise<FailResult>;
}

interface RpcResult {
  data: unknown;
  error: unknown;
}

export type RpcInvoker = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<RpcResult>;

export class ControlPlaneError extends Error {
  constructor(
    code: typeof CONTROL_PLANE_RESPONSE_INVALID | typeof CONTROL_PLANE_REQUEST_FAILED,
    readonly transportAmbiguous: boolean,
  ) {
    super(code);
    this.name = "ControlPlaneError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function singleRow(data: unknown): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
  }
  return data[0];
}

function stringValue(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
  }
  return value;
}

function integerValue(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
  }
  return value;
}

function nullableInteger(row: Record<string, unknown>, key: string): number | null {
  return row[key] === null ? null : integerValue(row, key);
}

function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
  return value;
}

function booleanValue(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
  return value;
}

function enumValue<T extends string>(row: Record<string, unknown>, key: string, allowed: readonly T[]): T {
  const value = row[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
  }
  return value as T;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export class SupabaseMeliOAuthControlPlane implements MeliOAuthControlPlane {
  constructor(private readonly invoke: RpcInvoker) {}

  private async rpc(functionName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    let result: RpcResult;
    try {
      result = await this.invoke(functionName, args);
    } catch {
      throw new ControlPlaneError(CONTROL_PLANE_REQUEST_FAILED, true);
    }
    if (result.error) throw new ControlPlaneError(CONTROL_PLANE_REQUEST_FAILED, false);
    return singleRow(result.data);
  }

  async initializeConnection(externalUserId: number, refreshToken: string): Promise<InitializeResult> {
    const row = await this.rpc("initialize_meli_oauth_connection", {
      p_external_user_id: externalUserId,
      p_refresh_token: refreshToken,
    });
    const result: InitializeResult = {
      outcome: enumValue(row, "outcome", [
        "INITIALIZED", "REAUTHORIZED", "ALREADY_INITIALIZED", "LOCK_BUSY", "STATE_NOT_ALLOWED",
      ] as const),
      externalUserId: integerValue(row, "external_user_id"),
      tokenVersion: integerValue(row, "token_version"),
      status: stringValue(row, "status"),
      reauthRequired: booleanValue(row, "reauth_required"),
    };
    const activeOutcome = result.outcome === "INITIALIZED"
      || result.outcome === "REAUTHORIZED"
      || result.outcome === "ALREADY_INITIALIZED";
    const coherent = result.externalUserId === externalUserId
      && result.tokenVersion >= 1
      && (
        (activeOutcome && result.status === "ACTIVE" && !result.reauthRequired)
        || (result.outcome === "LOCK_BUSY" && result.status === "REFRESHING")
        || (result.outcome === "STATE_NOT_ALLOWED" && result.status === "DISABLED" && result.reauthRequired)
      );
    if (!coherent) throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
    return result;
  }

  async claimRefresh(externalUserId: number): Promise<ClaimResult> {
    const row = await this.rpc("claim_meli_refresh", { p_external_user_id: externalUserId });
    const outcome = enumValue(row, "outcome", [
      "CLAIMED", "LOCK_BUSY", "NOT_FOUND", "REAUTH_REQUIRED", "OUTCOME_UNKNOWN", "DISABLED", "SECRET_MISSING",
    ] as const);
    const returnedUserId = integerValue(row, "external_user_id");
    const refreshToken = nullableString(row, "refresh_token");
    const leaseId = nullableString(row, "lease_id");
    const leaseExpiresAt = nullableString(row, "lease_expires_at");
    const expectedVersion = nullableInteger(row, "expected_version");
    if (outcome === "CLAIMED") {
      if (!refreshToken || !leaseId || !validUuid(leaseId) || expectedVersion === null || !leaseExpiresAt || !validDate(leaseExpiresAt)) {
        throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
      }
      return { outcome, externalUserId: returnedUserId, leaseId, expectedVersion, refreshToken, leaseExpiresAt };
    }
    if (refreshToken !== null || leaseId !== null) {
      throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
    }
    if (leaseExpiresAt !== null && !validDate(leaseExpiresAt)) {
      throw new ControlPlaneError(CONTROL_PLANE_RESPONSE_INVALID, false);
    }
    return { outcome, externalUserId: returnedUserId, expectedVersion, leaseExpiresAt };
  }

  async completeRefresh(input: {
    externalUserId: number; leaseId: string; expectedVersion: number; newRefreshToken: string;
  }): Promise<CompleteResult> {
    const row = await this.rpc("complete_meli_refresh", {
      p_external_user_id: input.externalUserId,
      p_lease_id: input.leaseId,
      p_expected_version: input.expectedVersion,
      p_new_refresh_token: input.newRefreshToken,
    });
    return {
      outcome: enumValue(row, "outcome", ["COMPLETED", "NOT_FOUND", "NOT_REFRESHING", "STALE_VERSION", "LEASE_MISMATCH", "SECRET_MISSING"] as const),
      externalUserId: integerValue(row, "external_user_id"),
      tokenVersion: nullableInteger(row, "token_version"),
      status: nullableString(row, "status"),
    };
  }

  async failRefresh(input: {
    externalUserId: number; leaseId: string; expectedVersion: number; errorCode: string; outcomeClass: FailureOutcomeClass;
  }): Promise<FailResult> {
    const row = await this.rpc("fail_meli_refresh", {
      p_external_user_id: input.externalUserId,
      p_lease_id: input.leaseId,
      p_expected_version: input.expectedVersion,
      p_error_code: input.errorCode,
      p_outcome_class: input.outcomeClass,
    });
    return {
      outcome: enumValue(row, "outcome", ["FAILURE_RECORDED", "NOT_FOUND", "NOT_REFRESHING", "STALE_VERSION", "LEASE_MISMATCH"] as const),
      externalUserId: integerValue(row, "external_user_id"),
      tokenVersion: nullableInteger(row, "token_version"),
      status: nullableString(row, "status"),
    };
  }
}

export function createMeliOAuthControlPlane(client: SupabaseClient): MeliOAuthControlPlane {
  return new SupabaseMeliOAuthControlPlane(async (functionName, args) => {
    const { data, error } = await client.rpc(functionName, args);
    return { data, error };
  });
}
