# Commerce Registry Admin CLI

## C4C boundary

`pnpm commerce:registry:sync` is the Commerce Registry administrative CLI. Dry-run remains the
default and performs no RPC. A write is possible only for the LOCAL target with `--apply`, an exact
token tied to the current preview, a second preparation pass, and a second validation of the local
target.

Remote is available only as an explicit read-only target. `--remote --apply` fails with
`REGISTRY_SYNC_REMOTE_APPLY_NOT_ENABLED` before credential resolution, Data API access or RPC. The
CLI never starts or resets Supabase.

## Commands

- `pnpm commerce:registry:sync`: generic local dry-run.
- `pnpm commerce:registry:sync -- --first-sync`: frozen empty-registry dry-run.
- `pnpm commerce:registry:sync -- --apply`: interactive local apply in a TTY; the full displayed
  token must be typed exactly.
- `pnpm commerce:registry:sync -- --apply --confirm "<TOKEN>"`: non-interactive local apply.
- Add `--first-sync` to enforce the frozen 0/0 first-sync baseline.
- Add `--json` for one machine-readable JSON object. JSON apply always requires `--confirm` and
  never prompts.
- `pnpm commerce:registry:sync -- --remote`: generic remote read-only dry-run.
- `pnpm commerce:registry:sync -- --remote --first-sync`: frozen remote first-sync preview.
- Add `--json` to either remote command for exactly one preview JSON object.

`--confirm` without `--apply`, unknown flags, missing values and duplicates fail closed. A non-TTY
apply without `--confirm` fails before local target resolution.

## Remote read-only safety

Remote selection is explicit and pinned to project `nrwhzfahjypybjyajmrj` at
`https://nrwhzfahjypybjyajmrj.supabase.co`. The existing authenticated Supabase CLI retrieves
exactly one modern `sb_secret_` credential into process memory. There is no legacy service-role
fallback, environment persistence, raw credential output, remote apply client, executor call, RPC
or DML path in the remote provider.

The client is immediately narrowed to `RegistryReadClient`, whose current-state reader performs
paginated SELECTs for registry categories and mappings. Remote previews use the same frozen local
snapshot, planner, payload, diff and preview contract as local dry-runs. They are not a live Mercado
Livre taxonomy refresh. A REMOTE fingerprint/token is informational and cannot authorize an apply.

The explicit acceptance command `pnpm test:registry-cli-remote-read` reads before state, runs the
first-sync preview, reads after state and requires equal counts and semantic digests with zero apply
RPC and zero DML. It is not part of the default unit suite, build or CI.

## Confirmation and apply safety

The SHA-256 fingerprint binds the target, contracts, preset, versions, snapshot, exact payload,
desired/diff summaries, semantic current-state digest and first-sync mode. Durations, UUIDs and
persistence timestamps are excluded.

Every apply performs this sequence:

1. resolve the guarded local read target and prepare the current preview;
2. require the exact token;
3. re-resolve `supabase status -o env`, validate HTTP localhost/127.0.0.1 and the same base URL;
4. prepare again and reject a stale fingerprint/token;
5. lazily create the apply client;
6. call the existing executor exactly once with the exact prepared payload;
7. never retry automatically;
8. read current state again, diff again and require convergence.

An explicit replay still executes one authoritative RPC; an unchanged registry must produce zero
writes. Manual overrides may remain as `MANUAL_OVERRIDE_SKIPPED` and still converge when their
lineage and effective post-state are consistent.

## Outcomes

- `APPLIED_AND_VERIFIED`: RPC result matches the refreshed preview and post-state converges.
- `APPLY_FAILED_STATE_UNCHANGED`: RPC failed and the semantic pre/post digest is equal.
- `APPLY_OUTCOME_UNCERTAIN`: RPC failed and post-state changed or could not be read.
- `POST_VERIFY_FAILED`: RPC returned success but result/post-state could not be proven consistent.
- `LOCKED`: the server returned `REGISTRY_SYNC_LOCKED`; post-read is attempted and retry remains zero.

No raw SDK error, credential, payload body or `supabase status` output is emitted.

## Frozen first-sync baseline

The approved snapshot SHA-256 is
`c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2`. It contains 3,269 nodes and
produces a 1,603,538-byte payload: 3,269 category inserts, 3,269 mapping inserts, 470 ALLOWED,
1,950 REVIEW, 849 EXCLUDED, zero UNKNOWN, tiers A/B/C 28/116/326 and 144 automatic eligible.
`checkedAt` is the snapshot `sourceContentCreated`.

## Future boundaries

C4C does not enable remote writes. A separately authorized C4-LIVE gate owns the first remote apply
and must rebuild a fresh remote preview; the C4C token must not be reused as authorization.
