# Commerce Registry Sync Planner

## Scope

0B3C2 adds a pure, offline boundary that converts a normalized `TaxonomyTree` plus an injected
classifier and explicit sync context into deterministic desired marketplace categories and vertical
mappings. Persistence, Supabase, RPCs, CLIs, OAuth and live marketplace calls are deliberately
outside this module.

The generic planner receives marketplace, site, vertical, root, source version, expected classifier
version, config version and `checkedAt`; it contains no AUTOMOTIVE constants. The current concrete
acceptance composition is MERCADO_LIVRE / MLB / AUTOMOTIVE / MLB5672.

## Desired state

A desired marketplace category uses the natural identity marketplace + site + external category ID.
It carries factual taxonomy fields, `active: true`, source/config versions and the caller-provided
check timestamp. It does not invent UUIDs or persistence timestamps.

A desired vertical mapping uses vertical + marketplace + site + external category ID. It carries the
classifier decision as AUTO, with no `decidedAt`; the diff tells a future executor whether a decision
changed. Scope/tier is fail-closed: ALLOWED requires A/B/C, while REVIEW, EXCLUDED and UNKNOWN
require a null tier.

The output is sorted by external category ID. The summary reports scope, tier and automatic
discovery counts; automatic eligibility is exactly ALLOWED with tier A or B and has no quota logic.

## Diff and active semantics

`marketplace_categories.active` is an external marketplace fact. A category missing from one
vertical's desired subtree is never inactivated by this diff. A current factual category marked
inactive is reactivated when the desired taxonomy proves it exists again.

`vertical_category_mappings.active` is vertical-scoped. A missing mapping is eligible for
INACTIVATE only when its external ID was explicitly supplied in
`controlledMappingExternalCategoryIds` and marketplace/site/vertical all match. This explicit
membership prevents future multi-root syncs from touching unrelated mappings. Reappearance yields
REACTIVATE with the same natural identity.

## Manual override and timestamps

Manual commercial decisions always beat AUTO. Divergence produces MANUAL_OVERRIDE_SKIPPED;
reactivation and inactivation may still change the operational active flag while preserving every
manual decision field. Invalid manual/source combinations fail closed.

`checkedAt` alone never causes UPDATE. A new source version updates the category observation. A new
classifier version updates an AUTO mapping even when the resulting commercial values are otherwise
equal. `decisionChanged` lets the future executor set `decided_at` only for a new or semantically
changed automatic decision and preserve it otherwise.

## Validation and determinism

The planner validates context, root/subtree membership, identity uniqueness, parent/path/leaf
coherence, marketplace/site scope, classifier output and classifier version before returning any
state. Current duplicate identities or semantically invalid mappings fail closed.

The core has no filesystem, environment, network, database, clock, random value or console
dependency. Inputs are not mutated and desired/current ordering does not affect output ordering.

## Frozen automotive acceptance

The versioned sanitized snapshot must produce 3,269 categories and 3,269 mappings: 470 ALLOWED,
1,950 REVIEW, 849 EXCLUDED, 0 UNKNOWN; tiers A/B/C are 28/116/326 and automatic eligibility is 144.
The snapshot and classifier rules remain unchanged by 0B3C2.

## Persistence boundary

0B3C2 performs no write. 0B3C3 must separately review the measured payload, transaction boundary,
UUID and parent resolution, manual-override race protection, advisory locking, grants and atomic
rollback before implementing persistence.
