export enum Availability {
  AVAILABLE = "AVAILABLE",
  PARTIAL = "PARTIAL",
  NOT_AVAILABLE_FOR_THIRD_PARTY = "NOT_AVAILABLE_FOR_THIRD_PARTY",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  UNSUPPORTED = "UNSUPPORTED",
}

export function classifyAvailability(status: number, hasData: boolean, complete = true): Availability {
  if (status === 403) return Availability.FORBIDDEN;
  if (status === 404) return Availability.NOT_FOUND;
  if (status === 405 || status === 410 || status === 501) return Availability.UNSUPPORTED;
  if (status >= 200 && status < 300 && hasData) {
    return complete ? Availability.AVAILABLE : Availability.PARTIAL;
  }
  if (status >= 200 && status < 300) return Availability.NOT_AVAILABLE_FOR_THIRD_PARTY;
  return Availability.PARTIAL;
}
