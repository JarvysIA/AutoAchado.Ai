# Commerce Registry Apply Contracts

## Scope

0B3C3A defines the read-only boundary between the pure 0B3C2 planner and the future atomic registry RPC. It creates no migration, function, grant, database write, live marketplace call or public HTTP surface.

## Lossless apply payload

`buildAtomicRegistryApplyPayload` converts `CommerceRegistrySyncPlan` into the versioned `commerce-registry-apply/v1` contract. Categories and mappings are joined by marketplace, site and external category identity, never by array position or name. The rows are sorted by external category ID.

Marketplace, site, vertical, root, source/classification/config versions and `checkedAt` are global context. Each combined row retains the category facts and complete automatic commercial decision: external and parent IDs, name, both paths, leaf flag, scope/tier, family fields, classification rule and decision reason. Active, manual and decision-source values are contract invariants and are not repeated per row. The adapter creates no clock, UUID, random, environment, filesystem or network dependency.

Runtime validation rejects context divergence, duplicate or missing identities, non-1:1 category/mapping relationships, invalid root/parent/path/leaf structure, invalid scope/tier and count divergence. The current frozen snapshot produces 3,269 rows and measures 1,603,538 UTF-8 bytes (1.529253 MiB), versus 3,110,501 bytes for the full plan: a 48.45% lossless reduction. Tests require at least 40% reduction.

## Apply result

The future RPC response uses `commerce-registry-apply-result/v1`. Runtime validation checks context identity, non-negative safe-integer counts, category and desired-mapping accounting, effective scope totals, tier totals and the A+B automatic count. Inactivated mappings are old rows absent from desired state and therefore are not incorrectly included in desired-present mapping accounting.

## Current-state reader

`loadCurrentCommerceRegistryState` receives an injected narrow read client and performs only explicit `select`, equality filters, stable ordering and `range` pagination. Page size is 1,000, matching the current local Data API `max_rows`. Exact page-size multiples fetch a final empty page, and any failed or malformed page rejects the entire read.

The reader loads marketplace categories for one marketplace/site in pages, avoiding a URL containing thousands of desired IDs. It retains the union of desired IDs and categories whose `path_external_ids` contains the controlled root. This supports both moved-in and moved-out categories. Parent UUIDs are resolved in memory from the already loaded marketplace/site set, without N+1 queries.

Mappings are loaded in pages for one vertical and retained only when their category UUID belongs to the relevant category set. Other roots, verticals, sites and marketplaces remain outside the returned controlled state. Raw snake_case responses are validated and mapped to the existing `CurrentCommerceRegistryState` camelCase contract. Manual decisions, decision source/reason and `decidedAt` are preserved, and the existing mapping semantic validator rejects inconsistent manual or scope/tier states.

## Active and manual semantics

Absence from a vertical subtree never proves that a marketplace category became factually inactive. The reader only reports current state; it does not decide or write active flags. A future atomic RPC may inactivate a vertical mapping belonging to the controlled root while preserving the category fact and every manual commercial decision.

The reader protects scope by deriving `controlledMappingExternalCategoryIds` from stored paths, not from an arbitrary caller-provided list. Desired IDs are comparison inputs, not authority for historical membership.

## Security and next boundary

No Supabase singleton, environment value or secret is required by the pure payload module or unit tests. The server reader accepts a client dependency; `registryReadClientFromSupabase` adapts the existing server-only Supabase client without adding a package. The reader exposes no write or RPC method.

0B3C3B will separately implement and test the privileged atomic SQL function, advisory lock, conditional upserts, parent resolution, manual-override race protection, mapping inactivation, timestamp stability and grants using Supabase local only.
