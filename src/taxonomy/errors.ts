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

export type TaxonomyInvalidResponseReason =
  | "CONTENT_TYPE_INVALID"
  | "CONTENT_ENCODING_INVALID"
  | "EMPTY_BODY"
  | "GZIP_INVALID"
  | "JSON_INVALID"
  | "TOP_LEVEL_SHAPE_INVALID"
  | "CATEGORY_SHAPE_INVALID";

export type TaxonomyErrorReason = TaxonomyIntegrityReason | TaxonomyInvalidResponseReason;

export interface TaxonomySafeErrorDetails {
  status: number | null;
  operation: string | null;
  retryable: boolean;
  reason: TaxonomyErrorReason | null;
  contentType: string | null;
  contentEncoding: string | null;
  contentLength: number | null;
  transportBytes: number | null;
  processedBytes: number | null;
  bodyHadGzipMagic: boolean | null;
  topLevelKind: "ARRAY" | "OBJECT" | "STRING" | "NUMBER" | "BOOLEAN" | "NULL" | "OTHER" | null;
  topLevelArrayLength: number | null;
  topLevelObjectKeyCount: number | null;
  categoryIndex: number | null;
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
      contentType: details.contentType ?? null,
      contentEncoding: details.contentEncoding ?? null,
      contentLength: details.contentLength ?? null,
      transportBytes: details.transportBytes ?? null,
      processedBytes: details.processedBytes ?? null,
      bodyHadGzipMagic: details.bodyHadGzipMagic ?? null,
      topLevelKind: details.topLevelKind ?? null,
      topLevelArrayLength: details.topLevelArrayLength ?? null,
      topLevelObjectKeyCount: details.topLevelObjectKeyCount ?? null,
      categoryIndex: details.categoryIndex ?? null,
    });
  }

  toJSON(): Readonly<{ name: string; code: TaxonomyErrorCode; message: string; details: Readonly<TaxonomySafeErrorDetails> }> {
    return Object.freeze({ name: this.name, code: this.code, message: this.message, details: this.details });
  }
}

export function taxonomyIntegrityError(reason: TaxonomyIntegrityReason): TaxonomyError {
  return new TaxonomyError("TAXONOMY_INTEGRITY_ERROR", `Taxonomia inválida: ${reason}`, { reason });
}

export function taxonomyInvalidResponse(
  reason: TaxonomyInvalidResponseReason,
  details: Partial<TaxonomySafeErrorDetails> = {},
): TaxonomyError {
  return new TaxonomyError("TAXONOMY_INVALID_RESPONSE", `Resposta de taxonomia inválida: ${reason}`, {
    ...details,
    reason,
  });
}

export function withTaxonomyErrorDetails(
  error: TaxonomyError,
  details: Partial<TaxonomySafeErrorDetails>,
): TaxonomyError {
  const current = error.details;
  return new TaxonomyError(error.code, error.message, {
    status: current.status ?? details.status ?? null,
    operation: current.operation ?? details.operation ?? null,
    retryable: current.retryable || (details.retryable ?? false),
    reason: current.reason ?? details.reason ?? null,
    contentType: current.contentType ?? details.contentType ?? null,
    contentEncoding: current.contentEncoding ?? details.contentEncoding ?? null,
    contentLength: current.contentLength ?? details.contentLength ?? null,
    transportBytes: current.transportBytes ?? details.transportBytes ?? null,
    processedBytes: current.processedBytes ?? details.processedBytes ?? null,
    bodyHadGzipMagic: current.bodyHadGzipMagic ?? details.bodyHadGzipMagic ?? null,
    topLevelKind: current.topLevelKind ?? details.topLevelKind ?? null,
    topLevelArrayLength: current.topLevelArrayLength ?? details.topLevelArrayLength ?? null,
    topLevelObjectKeyCount: current.topLevelObjectKeyCount ?? details.topLevelObjectKeyCount ?? null,
    categoryIndex: current.categoryIndex ?? details.categoryIndex ?? null,
  });
}
