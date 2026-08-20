export type RotationOutcome =
  | "ROTATED"
  | "LOCK_BUSY"
  | "REAUTH_REQUIRED"
  | "DISABLED"
  | "OUTCOME_UNKNOWN"
  | "CONFIG_ERROR"
  | "UPSTREAM_ERROR";

export interface RotationLogEvent {
  operationId: string;
  externalUserId: number;
  outcome: RotationOutcome;
  durationMs: number;
  tokenVersion?: number;
  leaseState?: "NOT_CLAIMED" | "CLAIMED" | "RELEASED" | "UNKNOWN";
  httpStatus?: number;
  sanitizedErrorCode?: string;
}

export type RotationLogger = (event: Readonly<RotationLogEvent>) => void;

export function emitRotationLog(logger: RotationLogger | undefined, event: RotationLogEvent): void {
  if (!logger) return;
  try {
    logger(Object.freeze({ ...event }));
  } catch {
    // Observability must never alter the credential state machine.
  }
}
