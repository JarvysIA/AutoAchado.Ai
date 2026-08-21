export type TaxonomyErrorCode =
  | "TAXONOMY_UNSUPPORTED_SITE"
  | "TAXONOMY_HTTP_ERROR"
  | "TAXONOMY_RATE_LIMITED"
  | "TAXONOMY_TIMEOUT"
  | "TAXONOMY_RESPONSE_TOO_LARGE"
  | "TAXONOMY_INVALID_RESPONSE"
  | "TAXONOMY_CHECKSUM_MISMATCH"
  | "TAXONOMY_INTEGRITY_ERROR"
  | "TAXONOMY_NODE_NOT_FOUND";

export type TaxonomyIntegrityReason =
  | "DUPLICATE_ID"
  | "PARENT_MISSING"
  | "CHILD_MISMATCH"
  | "SELF_PARENT"
  | "CYCLE"
  | "ROOT_MISSING"
  | "SITE_MISMATCH"
  | "DEPTH_LIMIT"
  | "NODE_LIMIT"
  | "UNREACHABLE_NODE"
  | "PATH_MISMATCH";

export interface TaxonomySafeErrorDetails {
  status: number | null;
  operation: string | null;
  retryable: boolean;
  reason: TaxonomyIntegrityReason | null;
}

export class TaxonomyError extends Error {
  readonly details: Readonly<TaxonomySafeErrorDetails>;

  constructor(
    readonly code: TaxonomyErrorCode,
    message: string,
    details: Partial<TaxonomySafeErrorDetails> = {},
  ) {
    super(message);
    this.name = "TaxonomyError";
    this.details = Object.freeze({
      status: details.status ?? null,
      operation: details.operation ?? null,
      retryable: details.retryable ?? false,
      reason: details.reason ?? null,
    });
  }

  toJSON(): Readonly<{ name: string; code: TaxonomyErrorCode; message: string; details: Readonly<TaxonomySafeErrorDetails> }> {
    return Object.freeze({ name: this.name, code: this.code, message: this.message, details: this.details });
  }
}

export function taxonomyIntegrityError(reason: TaxonomyIntegrityReason): TaxonomyError {
  return new TaxonomyError("TAXONOMY_INTEGRITY_ERROR", `Taxonomia inválida: ${reason}`, { reason });
}
