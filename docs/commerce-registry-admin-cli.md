# Commerce Registry Admin CLI

## C4A boundary

`pnpm commerce:registry:sync` is a local-only, read-only registry preview. It loads the approved
automotive snapshot, builds the existing planner and apply payload, reads current state through the
local Supabase Data API, calculates the existing semantic diff and prints a deterministic preview.

The C4A runtime has no executor, RPC or table-write capability. `--apply` fails with
`REGISTRY_SYNC_APPLY_NOT_ENABLED`; `--remote` fails with `REGISTRY_SYNC_REMOTE_NOT_ENABLED`; both
are rejected before local target resolution. Unknown, duplicate and `--confirm` arguments fail
closed.

## Commands

- `pnpm commerce:registry:sync`: generic local dry-run.
- `pnpm commerce:registry:sync -- --first-sync`: validates the frozen empty-registry baseline.
- `pnpm commerce:registry:sync -- --first-sync --json`: emits one JSON preview object.

The CLI does not start or reset Supabase. The local Data API URL must use HTTP with hostname
`localhost` or `127.0.0.1`. Credentials returned by `supabase status -o env` stay in memory and are
never part of the preview or error output.

## Frozen first-sync baseline

The approved snapshot has SHA-256
`c9e15babf11f24faa009641f174810eabb1459a705d74b8d4d0c3a6c1e77ded2`, 3,269 nodes and a
1,603,538-byte apply payload. An empty local registry previews 3,269 category inserts and 3,269
mapping inserts. Commercial totals remain 470 ALLOWED, 1,950 REVIEW, 849 EXCLUDED, zero UNKNOWN,
tiers A/B/C of 28/116/326 and 144 automatic-eligible mappings.

`checkedAt` is the snapshot's `sourceContentCreated`, not the CLI clock. The fingerprint hashes
canonical target, contracts, versions, payload, desired/diff summaries and semantic current state.
Durations, UUIDs and persistence timestamps are excluded. Its confirmation token is informational
in C4A and cannot enable a write.

## Future boundaries

C4B may add confirmed local apply through the existing executor and mandatory post-read/post-diff.
C4C may add remote read-only target resolution. A separately authorized C4-LIVE gate owns the first
remote apply. None of those capabilities exists in C4A.
