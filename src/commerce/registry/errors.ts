export type RegistrySyncErrorCode =
  | "REGISTRY_INVALID_CONTEXT"
  | "REGISTRY_INVALID_TREE"
  | "REGISTRY_DUPLICATE_CATEGORY_ID"
  | "REGISTRY_MISSING_PARENT"
  | "REGISTRY_INVALID_PATH"
  | "REGISTRY_INVALID_CLASSIFICATION"
  | "REGISTRY_CLASSIFICATION_VERSION_MISMATCH"
  | "REGISTRY_DUPLICATE_CURRENT_CATEGORY"
  | "REGISTRY_DUPLICATE_CURRENT_MAPPING"
  | "REGISTRY_INVALID_CURRENT_STATE"
  | "REGISTRY_SCOPE_MISMATCH";

export interface RegistrySyncErrorDetails {
  readonly externalCategoryId: string | null;
  readonly expected: string | null;
  readonly actual: string | null;
}

export class RegistrySyncError extends Error {
  readonly details: Readonly<RegistrySyncErrorDetails>;

  constructor(
    readonly code: RegistrySyncErrorCode,
    message: string,
    details: Partial<RegistrySyncErrorDetails> = {},
  ) {
    super(message);
    this.name = "RegistrySyncError";
    this.details = Object.freeze({
      externalCategoryId: details.externalCategoryId ?? null,
      expected: details.expected ?? null,
      actual: details.actual ?? null,
    });
  }
}

export function registrySyncError(
  code: RegistrySyncErrorCode,
  message: string,
  details: Partial<RegistrySyncErrorDetails> = {},
): RegistrySyncError {
  return new RegistrySyncError(code, message, details);
}
