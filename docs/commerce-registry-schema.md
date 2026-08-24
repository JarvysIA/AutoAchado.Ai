# Commerce Universe Registry — schema contract

## Classification scope and priority

vertical_category_mappings.scope_status accepts ALLOWED, REVIEW, EXCLUDED and UNKNOWN.
Only ALLOWED has a priority tier, which must be A, B or C. REVIEW, EXCLUDED and
UNKNOWN always use a null priority tier. EXCLUDED is a scope and is never a registry priority.

The legacy automotive_categories contract is intentionally unchanged and may still represent
EXCLUDED in its legacy priority field. It is a temporary compatibility surface, not the canonical
generic registry.

## Manual decisions

manual_override = true is equivalent to decision_source = MANUAL; false is equivalent to
decision_source = AUTO. A manual decision continues to require decided_at. Future automatic
syncs must protect the complete commercial decision when a mapping is manual.

## Active state

marketplace_categories.active is a factual state of the external marketplace category.
Disappearance from the MLB5672 subtree alone does not authorize an AUTOMOTIVE sync to set that
field to false, because a vertical-scoped sync cannot conclude that the external category ceased to
exist globally.

vertical_category_mappings.active is the category's operational participation in one vertical and
may be changed by that vertical's sync without changing the external category's factual active state.

## Independent versions

marketplace_categories.source_version identifies the factual taxonomy source. The separate
vertical_category_mappings.classification_version identifies the classifier that produced the
commercial decision. Existing config-version fields retain their current purpose; no duplicate
version column is introduced by 0B3C1.

## Access boundary

RLS remains enabled with no public policy. PUBLIC, anon and authenticated remain denied.
service_role temporarily retains its existing direct SELECT/INSERT/UPDATE access until the atomic
RPC executor is implemented and tested in 0B3C3; it still has no DELETE grant. 0B3C1 creates no RPC,
sync, category data or public client access.
