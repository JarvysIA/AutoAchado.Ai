# Commerce discovery persistence

## Scope

`0B3D-P` aligns discovery persistence with the canonical Commerce Registry. It adds no live Mercado Livre or OAuth wiring, does not enable `--persist`, and does not create product candidates, price history, scoring, affiliate, UI, or distribution state.

## Schema before and after

`scan_runs` remains the single run table. Discovery rows add nullable audit fields for the `commerce-discovery-run/v1` contract, `automotive-mlb-discovery/v1` config, `meli-highlights-discovery/v1` adapter, marketplace/site/vertical, run mode, and the deterministic registry digest. A conditional check requires all of that context only when `job_type = COMMERCE_DISCOVERY`; legacy jobs remain compatible.

`highlight_snapshots.category_id` and its FK to `automotive_categories` remain available for legacy consumers. New discovery occurrences leave that column null and use `marketplace_category_id`, a restrictive FK to the canonical `marketplace_categories` row. No legacy table or data is dropped or backfilled.

The discovery identity is:

`(run_id, marketplace_category_id, type, product_id)`

This makes replay of the same occurrence idempotent while allowing:

- `PRODUCT MLB123` and `ITEM MLB123` in the same category;
- one product to retain occurrences from multiple categories;
- the same typed product to reappear in later runs.

`PRODUCT`, `ITEM`, and `USER_PRODUCT` IDs are checked according to their type. Unknown types cannot be persisted. New rows also record the source contract and A/B tier. Raw API responses, headers, and tokens are never stored.

## Repository

`src/server/discovery/persistence-repository.ts` is the narrow server boundary. It immediately adapts a server-side Supabase client and exposes only:

- `beginDiscoveryRun`;
- `persistDiscoveryOccurrences`;
- `completeDiscoveryRun`;
- `readDiscoveryRunForVerification`.

Before a write, occurrences are validated and their canonical category IDs are verified in one bulk read. Duplicate normalized identities are collapsed in memory, then written in bounded batches of 500. The database unique constraint remains the final idempotency guard. Errors are converted to stable, sanitized persistence errors.

Detailed category outcomes are not given a new table in this gate. Aggregate error and progress metadata fit the existing `scan_runs.error_counts` and `cursor` objects. Candidate rows remain derived from `PRODUCT` occurrences and belong to the future normalization flow.

## Security

RLS stays enabled on `scan_runs` and `highlight_snapshots`; no anon/authenticated policy or grant is added. Persistence remains an administrative service-role operation. The migration is tested only against local Supabase and is not applied remotely by this gate.

## Local E2E

`pnpm test:discovery-persistence-local-e2e` resets local Supabase, materializes the frozen local Commerce Registry using the existing registry E2E, and verifies PRODUCT/ITEM/USER_PRODUCT, cross-type identity, replay, multi-category provenance, cross-run recurrence, run completion, canonical FK rejection, and zero dependency on new `automotive_categories` rows.

The test uses only local Supabase and synthetic identities. It makes zero Mercado Livre and OAuth calls.

## Operational boundary

The discovery CLI still rejects `--persist` with `DISCOVERY_PERSISTENCE_NOT_ENABLED`. Live discovery remains disabled. Enabling persistence in an operational sweep requires a separately authorized future gate after the limited live read-only smoke.
