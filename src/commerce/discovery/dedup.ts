import type { DiscoveryCandidate, DiscoveryOccurrence } from "./types.js";

function occurrenceKey(value: DiscoveryOccurrence): string {
  return JSON.stringify([
    value.marketplaceKey, value.siteId, value.marketplaceCategoryId, value.highlightType, value.externalId,
  ]);
}

function candidateKey(value: DiscoveryOccurrence): string {
  return JSON.stringify([value.marketplaceKey, value.siteId, value.highlightType, value.externalId]);
}

function preferredPosition(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

export function compareDiscoveryOccurrences(left: DiscoveryOccurrence, right: DiscoveryOccurrence): number {
  const tier = (left.priorityTier === "A" ? 0 : 1) - (right.priorityTier === "A" ? 0 : 1);
  if (tier !== 0) return tier;
  const category = left.externalCategoryId.localeCompare(right.externalCategoryId);
  if (category !== 0) return category;
  const leftPosition = left.position ?? Number.POSITIVE_INFINITY;
  const rightPosition = right.position ?? Number.POSITIVE_INFINITY;
  return leftPosition - rightPosition || left.highlightType.localeCompare(right.highlightType)
    || left.externalId.localeCompare(right.externalId);
}

export interface DeduplicatedDiscovery {
  readonly occurrences: readonly DiscoveryOccurrence[];
  readonly candidates: readonly DiscoveryCandidate[];
  readonly duplicateOccurrences: number;
}

export function deduplicateDiscoveryOccurrences(values: readonly DiscoveryOccurrence[]): DeduplicatedDiscovery {
  const effective = new Map<string, DiscoveryOccurrence>();
  let duplicates = 0;
  for (const value of values) {
    const key = occurrenceKey(value);
    const current = effective.get(key);
    if (!current) {
      effective.set(key, value);
      continue;
    }
    duplicates += 1;
    effective.set(key, Object.freeze({ ...current, position: preferredPosition(current.position, value.position) }));
  }
  const occurrences = Object.freeze([...effective.values()].sort(compareDiscoveryOccurrences));
  const candidateOccurrences = new Map<string, DiscoveryOccurrence[]>();
  for (const occurrence of occurrences) {
    if (occurrence.highlightType !== "PRODUCT") continue;
    const key = candidateKey(occurrence);
    const bucket = candidateOccurrences.get(key) ?? [];
    bucket.push(occurrence);
    candidateOccurrences.set(key, bucket);
  }
  const candidates = Object.freeze([...candidateOccurrences.entries()].map(([key, provenance]) => {
    const first = provenance[0]!;
    return Object.freeze({
      marketplaceKey: first.marketplaceKey,
      siteId: first.siteId,
      highlightType: "PRODUCT" as const,
      externalId: first.externalId,
      eligibleForNormalization: true as const,
      occurrences: Object.freeze([...provenance].sort(compareDiscoveryOccurrences)),
      key,
    });
  }).sort((left, right) => left.externalId.localeCompare(right.externalId))
    .map(({ key: _key, ...candidate }) => Object.freeze(candidate)));
  return Object.freeze({ occurrences, candidates, duplicateOccurrences: duplicates });
}
