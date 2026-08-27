import { randomUUID } from "node:crypto";
import type {
  ClaimResult,
  FailureOutcomeClass,
  MeliOAuthControlPlane,
} from "./control-plane.js";
import { emitRotationLog, type RotationLogger, type RotationOutcome } from "./logging.js";
import {
  MeliTokenProviderError,
  type MeliTokenProvider,
  type RefreshResult,
} from "./token-provider.js";

export type RotationResult =
  | {
      outcome: "ROTATED";
      accessToken: string;
      expiresIn: number;
      externalUserId: number;
      tokenVersion: number;
    }
  | {
      outcome: Exclude<RotationOutcome, "ROTATED">;
      externalUserId: number;
      errorCode?: string;
    }
  | {
      outcome: "OPERATION_ALREADY_USED";
      externalUserId: number;
    };

export interface MeliOAuthRotationServiceOptions {
  controlPlane: MeliOAuthControlPlane;
  tokenProvider: MeliTokenProvider;
  expectedUserId: number;
  logger?: RotationLogger;
  now?: () => number;
  operationId?: () => string;
}

interface ClaimedContext {
  externalUserId: number;
  leaseId: string;
  expectedVersion: number;
}

function claimTerminalResult(claim: Exclude<ClaimResult, { outcome: "CLAIMED" }>): RotationResult {
  switch (claim.outcome) {
    case "LOCK_BUSY": return { outcome: "LOCK_BUSY", externalUserId: claim.externalUserId };
    case "DISABLED": return { outcome: "DISABLED", externalUserId: claim.externalUserId };
    case "OUTCOME_UNKNOWN": return { outcome: "OUTCOME_UNKNOWN", externalUserId: claim.externalUserId };
    case "OPERATION_ALREADY_USED": return { outcome: "OPERATION_ALREADY_USED", externalUserId: claim.externalUserId };
    case "NOT_FOUND":
    case "SECRET_MISSING":
    case "REAUTH_REQUIRED":
      return { outcome: "REAUTH_REQUIRED", externalUserId: claim.externalUserId };
  }
}

function resultForFailure(disposition: FailureOutcomeClass, externalUserId: number, errorCode: string): RotationResult {
  switch (disposition) {
    case "REAUTH_REQUIRED": return { outcome: "REAUTH_REQUIRED", externalUserId, errorCode };
    case "CONFIG_ERROR": return { outcome: "CONFIG_ERROR", externalUserId, errorCode };
    case "OUTCOME_UNKNOWN": return { outcome: "OUTCOME_UNKNOWN", externalUserId, errorCode };
    case "SAFE_RETRY": return { outcome: "UPSTREAM_ERROR", externalUserId, errorCode };
  }
}

export class MeliOAuthRotationService {
  private readonly now: () => number;
  private readonly operationId: () => string;

  constructor(private readonly options: MeliOAuthRotationServiceOptions) {
    if (!Number.isSafeInteger(options.expectedUserId) || options.expectedUserId <= 0) {
      throw new Error("CONFIG_MELI_EXPECTED_USER_ID_INVALID");
    }
    this.now = options.now ?? Date.now;
    this.operationId = options.operationId ?? randomUUID;
  }

  private log(operationId: string, startedAt: number, result: RotationResult, details: {
    tokenVersion?: number;
    leaseState?: "NOT_CLAIMED" | "CLAIMED" | "RELEASED" | "UNKNOWN";
    httpStatus?: number;
  } = {}): void {
    const loggedOutcome: RotationOutcome = result.outcome === "OPERATION_ALREADY_USED"
      ? "CONFIG_ERROR"
      : result.outcome;
    const event = {
      operationId,
      externalUserId: result.externalUserId,
      outcome: loggedOutcome,
      durationMs: Math.max(0, this.now() - startedAt),
      ...details,
    };
    if (result.outcome === "OPERATION_ALREADY_USED") {
      emitRotationLog(this.options.logger, { ...event, sanitizedErrorCode: "OPERATION_ALREADY_USED" });
      return;
    }
    if ("errorCode" in result && result.errorCode) {
      emitRotationLog(this.options.logger, { ...event, sanitizedErrorCode: result.errorCode });
    } else {
      emitRotationLog(this.options.logger, event);
    }
  }

  private async recordFailure(context: ClaimedContext, errorCode: string, outcomeClass: FailureOutcomeClass): Promise<void> {
    try {
      await this.options.controlPlane.failRefresh({ ...context, errorCode, outcomeClass });
    } catch {
      // Fail closed. The caller receives no access token and no raw control-plane error.
    }
  }

  private async handleProviderFailure(context: ClaimedContext, error: unknown): Promise<RotationResult> {
    const providerError = error instanceof MeliTokenProviderError
      ? error
      : new MeliTokenProviderError("REFRESH_OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN", "AMBIGUOUS_TRANSPORT_FAILURE");
    await this.recordFailure(context, providerError.errorCode, providerError.disposition);
    return resultForFailure(providerError.disposition, context.externalUserId, providerError.errorCode);
  }

  private async validateIdentity(context: ClaimedContext, refreshed: RefreshResult): Promise<RotationResult | null> {
    if (refreshed.userId === this.options.expectedUserId) return null;
    await this.recordFailure(context, "USER_MISMATCH", "REAUTH_REQUIRED");
    return { outcome: "REAUTH_REQUIRED", externalUserId: context.externalUserId, errorCode: "USER_MISMATCH" };
  }

  private async rotateWithClaim(operationId: string, claimRefresh: () => Promise<ClaimResult>): Promise<RotationResult> {
    const startedAt = this.now();
    let claim: ClaimResult;
    try {
      claim = await claimRefresh();
    } catch {
      const result: RotationResult = {
        outcome: "UPSTREAM_ERROR",
        externalUserId: this.options.expectedUserId,
        errorCode: "CONTROL_PLANE_REQUEST_FAILED",
      };
      this.log(operationId, startedAt, result, { leaseState: "NOT_CLAIMED" });
      return result;
    }
    if (claim.externalUserId !== this.options.expectedUserId) {
      const result: RotationResult = { outcome: "CONFIG_ERROR", externalUserId: this.options.expectedUserId, errorCode: "CONTROL_PLANE_USER_MISMATCH" };
      this.log(operationId, startedAt, result, { leaseState: "NOT_CLAIMED" });
      return result;
    }
    if (claim.outcome !== "CLAIMED") {
      const result = claimTerminalResult(claim);
      const details = claim.expectedVersion === null
        ? { leaseState: "NOT_CLAIMED" as const }
        : { leaseState: "NOT_CLAIMED" as const, tokenVersion: claim.expectedVersion };
      this.log(operationId, startedAt, result, details);
      return result;
    }

    const context: ClaimedContext = {
      externalUserId: claim.externalUserId,
      leaseId: claim.leaseId,
      expectedVersion: claim.expectedVersion,
    };
    let refreshed: RefreshResult;
    try {
      refreshed = await this.options.tokenProvider.refresh(claim.refreshToken);
    } catch (error) {
      const result = await this.handleProviderFailure(context, error);
      const details = {
        leaseState: result.outcome === "OUTCOME_UNKNOWN" ? "UNKNOWN" : "RELEASED",
        tokenVersion: claim.expectedVersion,
      } as const;
      const httpStatus = error instanceof MeliTokenProviderError ? error.httpStatus : undefined;
      this.log(operationId, startedAt, result, httpStatus === undefined ? details : { ...details, httpStatus });
      return result;
    }

    const identityFailure = await this.validateIdentity(context, refreshed);
    if (identityFailure) {
      this.log(operationId, startedAt, identityFailure, { leaseState: "RELEASED", tokenVersion: claim.expectedVersion });
      return identityFailure;
    }

    try {
      const completion = await this.options.controlPlane.completeRefresh({
        ...context,
        newRefreshToken: refreshed.refreshToken,
      });
      if (
        completion.outcome === "COMPLETED"
        && completion.externalUserId === context.externalUserId
        && completion.status === "ACTIVE"
        && completion.tokenVersion !== null
        && completion.tokenVersion === context.expectedVersion + 1
      ) {
        const result: RotationResult = {
          outcome: "ROTATED",
          accessToken: refreshed.accessToken,
          expiresIn: refreshed.expiresIn,
          externalUserId: refreshed.userId,
          tokenVersion: completion.tokenVersion,
        };
        this.log(operationId, startedAt, result, { leaseState: "RELEASED", tokenVersion: completion.tokenVersion });
        return result;
      }
    } catch {
      // The RPC may have committed even if its response was lost. CAS makes the
      // best-effort fail call harmless when completion already succeeded.
    }

    await this.recordFailure(context, "COMPLETE_OUTCOME_UNKNOWN", "OUTCOME_UNKNOWN");
    const result: RotationResult = {
      outcome: "OUTCOME_UNKNOWN",
      externalUserId: context.externalUserId,
      errorCode: "COMPLETE_OUTCOME_UNKNOWN",
    };
    this.log(operationId, startedAt, result, { leaseState: "UNKNOWN", tokenVersion: claim.expectedVersion });
    return result;
  }

  async rotateMeliAccessToken(): Promise<RotationResult> {
    const operationId = this.operationId();
    return this.rotateWithClaim(operationId, () => this.options.controlPlane.claimRefresh(this.options.expectedUserId));
  }

  async rotateMeliAccessTokenForRuntimeOperation(operationId: string): Promise<RotationResult> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operationId)) {
      const result: RotationResult = {
        outcome: "CONFIG_ERROR",
        externalUserId: this.options.expectedUserId,
        errorCode: "RUNTIME_OPERATION_ID_INVALID",
      };
      this.log("invalid-runtime-operation", this.now(), result, { leaseState: "NOT_CLAIMED" });
      return result;
    }
    const runtimeClaim = this.options.controlPlane.claimRefreshForRuntimeOperation;
    if (!runtimeClaim) {
      return {
        outcome: "CONFIG_ERROR",
        externalUserId: this.options.expectedUserId,
        errorCode: "RUNTIME_OPERATION_GUARD_UNAVAILABLE",
      };
    }
    return this.rotateWithClaim(operationId, () => (
      runtimeClaim.call(this.options.controlPlane, this.options.expectedUserId, operationId)
    ));
  }
}
