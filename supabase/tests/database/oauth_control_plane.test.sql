begin;

create extension if not exists pgtap with schema extensions;

select plan(89);

-- Structure and least-privilege boundary.
select ok(to_regnamespace('private') is not null, 'private schema exists');
select ok(to_regclass('private.meli_oauth_connections') is not null, 'OAuth metadata table exists');
select is(
  (select count(*)::integer from information_schema.columns where table_schema = 'private' and table_name = 'meli_oauth_connections'),
  16,
  'OAuth metadata has the expected columns'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'meli_oauth_connections'
      and column_name in ('refresh_token', 'access_token', 'client_secret', 'authorization_code', 'code_verifier')
  ),
  'OAuth metadata has no credential columns'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.meli_oauth_connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%provider%MERCADO_LIVRE%'
  ),
  'provider is constrained to Mercado Livre'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.meli_oauth_connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%REFRESH_OUTCOME_UNKNOWN%'
  ),
  'connection status is constrained to the approved state machine'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'private.meli_oauth_connections'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%lease_expires_at > lease_acquired_at%'
  ),
  'lease timestamps are structurally coherent'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'private.meli_oauth_connections'::regclass),
  'RLS is enabled as defense in depth on private metadata'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'private' and tablename = 'meli_oauth_connections'),
  0,
  'private metadata has no public-facing policies'
);
select ok(not has_schema_privilege('public', 'private', 'USAGE'), 'PUBLIC has no private schema usage');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no private schema usage');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has no private schema usage');
select ok(not has_schema_privilege('service_role', 'private', 'USAGE'), 'service_role has no private schema usage');
select ok(not has_table_privilege('public', 'private.meli_oauth_connections', 'SELECT, INSERT, UPDATE, DELETE'), 'PUBLIC has no direct metadata privileges');
select ok(not has_table_privilege('anon', 'private.meli_oauth_connections', 'SELECT, INSERT, UPDATE, DELETE'), 'anon has no direct metadata privileges');
select ok(not has_table_privilege('authenticated', 'private.meli_oauth_connections', 'SELECT, INSERT, UPDATE, DELETE'), 'authenticated has no direct metadata privileges');
select ok(not has_table_privilege('service_role', 'private.meli_oauth_connections', 'SELECT, INSERT, UPDATE, DELETE'), 'service_role has no direct metadata privileges');

select is(
  (
    select count(*)::integer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
  ),
  4,
  'exactly four OAuth control-plane RPCs exist'
);
select ok(
  (
    select bool_and(p.prosecdef)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
  ),
  'all sensitive RPCs are SECURITY DEFINER'
);
select ok(
  (
    select bool_and(array_to_string(p.proconfig, ',') = 'search_path=""')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
  ),
  'all sensitive RPCs pin an empty search_path'
);
select ok(
  (
    select bool_and(pg_get_userbyid(p.proowner) = 'postgres')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
  ),
  'all sensitive RPCs are owned by postgres'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
      and has_function_privilege('public', p.oid, 'EXECUTE')
  ),
  'PUBLIC cannot execute OAuth RPCs'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon cannot execute OAuth RPCs'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  'authenticated cannot execute OAuth RPCs'
);
select ok(
  (
    select bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('initialize_meli_oauth_connection', 'claim_meli_refresh', 'complete_meli_refresh', 'fail_meli_refresh')
  ),
  'service_role can execute all four specific RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '(get|read|update).*secret|secret.*(get|read|update)'
  ),
  0,
  'no generic secret RPC exists'
);
select ok(
  not has_schema_privilege('anon', 'vault', 'USAGE')
  and not has_table_privilege('anon', 'vault.secrets', 'SELECT')
  and not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'),
  'anon has no direct Vault access'
);
select ok(
  not has_schema_privilege('authenticated', 'vault', 'USAGE')
  and not has_table_privilege('authenticated', 'vault.secrets', 'SELECT')
  and not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT'),
  'authenticated has no direct Vault access'
);
select ok(
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    join pg_roles grantee on grantee.oid = a.grantee
    join pg_roles grantor on grantor.oid = a.grantor
    where n.nspname = 'vault'
      and c.relname in ('secrets', 'decrypted_secrets')
      and grantee.rolname = 'service_role'
      and grantor.rolname = 'postgres'
  ),
  'migration adds no postgres-issued direct Vault grant to service_role'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(p.proacl) a
    join pg_roles grantee on grantee.oid = a.grantee
    join pg_roles grantor on grantor.oid = a.grantor
    where n.nspname = 'vault'
      and p.proname in ('create_secret', 'update_secret')
      and grantee.rolname = 'service_role'
      and grantor.rolname = 'postgres'
  ),
  'migration adds no postgres-issued Vault function grant to service_role'
);
select ok(
  pg_get_functiondef('public.initialize_meli_oauth_connection(bigint,text)'::regprocedure)
    like '%pg_advisory_xact_lock%hashtextextended%autoachado:meli:%',
  'initialize serializes the logical Mercado Livre identity before lookup'
);
select ok(
  pg_get_functiondef('public.initialize_meli_oauth_connection(bigint,text)'::regprocedure)
    like '%c.status = v_expected_status%'
  and pg_get_functiondef('public.initialize_meli_oauth_connection(bigint,text)'::regprocedure)
    like '%c.token_version = v_expected_version%',
  'reauthorization update has explicit state and version CAS predicates'
);

-- Initialize and rotate a synthetic credential. Values are assembled at runtime
-- and only boolean hashes are asserted, so pgTAP never prints the canary.
create temporary table init_result on commit drop as
select * from public.initialize_meli_oauth_connection(
  900000001,
  pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_INITIAL_', 'A')
);

select is((select outcome from init_result), 'INITIALIZED', 'initialize creates a connection');
select ok(
  (select vault_secret_id is not null from private.meli_oauth_connections where external_user_id = 900000001),
  'initialize stores a Vault UUID reference'
);
select ok(
  (
    select status = 'ACTIVE' and token_version = 1 and not reauth_required and consecutive_failures = 0
    from private.meli_oauth_connections where external_user_id = 900000001
  ),
  'new connection starts ACTIVE at version one'
);
select ok(
  not (to_jsonb(init_result.*) ?| array['refresh_token', 'access_token', 'client_secret', 'vault_secret_id']),
  'initialize result contains no credential or Vault locator'
)
from init_result;
select ok(
  exists (
    select 1
    from private.meli_oauth_connections c
    join vault.secrets s on s.id = c.vault_secret_id
    where c.external_user_id = 900000001
  ),
  'initialize creates the associated Vault secret'
);

drop table init_result;
create temporary table active_before on commit drop as
select c.vault_secret_id, c.token_version, c.status, c.lease_id,
       extensions.digest(s.decrypted_secret, 'sha256') as secret_hash
from private.meli_oauth_connections c
join vault.decrypted_secrets s on s.id = c.vault_secret_id
where c.external_user_id = 900000001;

create temporary table init_result on commit drop as
select * from public.initialize_meli_oauth_connection(
  900000001,
  pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_ROTATED_', 'A')
);
select is((select outcome from init_result), 'ALREADY_INITIALIZED', 'ACTIVE connection refuses silent replacement');
select is((select token_version from init_result), 1::bigint, 'ACTIVE authorization does not increment token version');
select ok(
  (
    select c.vault_secret_id = b.vault_secret_id and c.token_version = b.token_version
      and c.status = b.status and c.lease_id is not distinct from b.lease_id
    from private.meli_oauth_connections c cross join active_before b
    where c.external_user_id = 900000001
  ),
  'ACTIVE authorization preserves metadata and Vault reference'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') = b.secret_hash
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    cross join active_before b
    where c.external_user_id = 900000001
  ),
  'ACTIVE authorization does not replace the current Vault value'
);

select ok(
  (
    select outcome = 'CLAIMED'
      and external_user_id = 900000001
      and lease_id is not null
      and expected_version = 1
      and extensions.digest(refresh_token, 'sha256') =
          extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_INITIAL_', 'A'), 'sha256')
    from public.claim_meli_refresh(900000001)
  ),
  'claim returns one exclusive lease and only the associated synthetic credential'
);
select ok(
  (
    select status = 'REFRESHING' and lease_id is not null and lease_acquired_at is not null and lease_expires_at is not null
    from private.meli_oauth_connections where external_user_id = 900000001
  ),
  'claim persists REFRESHING lease metadata'
);
create temporary table refreshing_before on commit drop as
select c.vault_secret_id, c.token_version, c.status, c.lease_id, c.lease_acquired_at, c.lease_expires_at,
       extensions.digest(s.decrypted_secret, 'sha256') as secret_hash
from private.meli_oauth_connections c
join vault.decrypted_secrets s on s.id = c.vault_secret_id
where c.external_user_id = 900000001;
select is(
  (select outcome from public.initialize_meli_oauth_connection(
    900000001, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_DURING_REFRESH_', 'A')
  )),
  'LOCK_BUSY',
  'authorization during REFRESHING reports LOCK_BUSY'
);
select ok(
  (
    select c.vault_secret_id = b.vault_secret_id and c.token_version = b.token_version
      and c.status = b.status and c.lease_id = b.lease_id
      and c.lease_acquired_at = b.lease_acquired_at and c.lease_expires_at = b.lease_expires_at
    from private.meli_oauth_connections c cross join refreshing_before b
    where c.external_user_id = 900000001
  ),
  'LOCK_BUSY preserves refresh lease and metadata'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') = b.secret_hash
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    cross join refreshing_before b
    where c.external_user_id = 900000001
  ),
  'LOCK_BUSY does not replace the Vault value'
);
select ok(
  (
    select extract(epoch from (lease_expires_at - lease_acquired_at)) between 119 and 121
    from private.meli_oauth_connections where external_user_id = 900000001
  ),
  'lease TTL is centrally fixed at two minutes'
);
select is((select outcome from public.claim_meli_refresh(900000001)), 'LOCK_BUSY', 'second claim reports LOCK_BUSY');
select ok((select refresh_token is null from public.claim_meli_refresh(900000001)), 'LOCK_BUSY never returns a credential');

select is(
  (
    select r.outcome
    from private.meli_oauth_connections c
    cross join lateral public.complete_meli_refresh(
      900000001,
      c.lease_id,
      c.token_version - 1,
      pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_STALE_', 'A')
    ) r
    where c.external_user_id = 900000001
  ),
  'STALE_VERSION',
  'stale expected_version is rejected'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') =
           extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_INITIAL_', 'A'), 'sha256')
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    where c.external_user_id = 900000001
  ),
  'stale version cannot update Vault'
);
select is(
  (
    select r.outcome
    from private.meli_oauth_connections c
    cross join lateral public.complete_meli_refresh(
      900000001,
      extensions.gen_random_uuid(),
      c.token_version,
      pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_WRONG_LEASE_', 'A')
    ) r
    where c.external_user_id = 900000001
  ),
  'LEASE_MISMATCH',
  'wrong lease is rejected'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') =
           extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_INITIAL_', 'A'), 'sha256')
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    where c.external_user_id = 900000001
  ),
  'wrong lease cannot update Vault'
);
select is(
  (
    select r.outcome
    from private.meli_oauth_connections c
    cross join lateral public.complete_meli_refresh(
      900000001,
      c.lease_id,
      c.token_version,
      pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_COMPLETED_', 'A')
    ) r
    where c.external_user_id = 900000001
  ),
  'COMPLETED',
  'correct lease and version complete rotation'
);
select ok(
  (
    select status = 'ACTIVE' and token_version = 2 and lease_id is null
      and lease_acquired_at is null and lease_expires_at is null
      and last_refresh_at is not null and last_success_at is not null
      and consecutive_failures = 0 and not reauth_required
    from private.meli_oauth_connections where external_user_id = 900000001
  ),
  'complete restores ACTIVE metadata and clears lease'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') =
           extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_COMPLETED_', 'A'), 'sha256')
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    where c.external_user_id = 900000001
  ),
  'complete replaces the Vault credential'
);
select is(
  (
    select outcome from public.complete_meli_refresh(
      900000001,
      extensions.gen_random_uuid(),
      1,
      pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_REPLAY_', 'A')
    )
  ),
  'NOT_REFRESHING',
  'repeated or delayed complete is rejected'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') =
           extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_COMPLETED_', 'A'), 'sha256')
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    where c.external_user_id = 900000001
  ),
  'delayed response cannot overwrite the newest generation'
);

-- Failure state machine.
select ok((select outcome = 'CLAIMED' from public.claim_meli_refresh(900000001)), 'SAFE_RETRY setup acquires a lease');
select is(
  (
    select r.outcome
    from private.meli_oauth_connections c
    cross join lateral public.fail_meli_refresh(900000001, c.lease_id, c.token_version, 'UPSTREAM_UNAVAILABLE', 'SAFE_RETRY') r
    where c.external_user_id = 900000001
  ),
  'FAILURE_RECORDED',
  'SAFE_RETRY failure is recorded'
);
select ok(
  (
    select status = 'ACTIVE' and not reauth_required and lease_id is null
      and consecutive_failures = 1 and last_error_code = 'UPSTREAM_UNAVAILABLE'
    from private.meli_oauth_connections where external_user_id = 900000001
  ),
  'SAFE_RETRY releases the lease into a safe ACTIVE state'
);
select ok(
  (
    select extensions.digest(s.decrypted_secret, 'sha256') =
           extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_COMPLETED_', 'A'), 'sha256')
    from private.meli_oauth_connections c
    join vault.decrypted_secrets s on s.id = c.vault_secret_id
    where c.external_user_id = 900000001
  ),
  'fail never changes the Vault credential'
);

select ok((select outcome = 'CLAIMED' from public.claim_meli_refresh(900000001)), 'REAUTH_REQUIRED setup acquires a lease');
select is(
  (
    select r.status
    from private.meli_oauth_connections c
    cross join lateral public.fail_meli_refresh(900000001, c.lease_id, c.token_version, 'INVALID_GRANT', 'REAUTH_REQUIRED') r
    where c.external_user_id = 900000001
  ),
  'REAUTH_REQUIRED',
  'REAUTH_REQUIRED becomes terminal'
);
select ok(
  (select reauth_required and lease_id is null and consecutive_failures = 2 from private.meli_oauth_connections where external_user_id = 900000001),
  'REAUTH_REQUIRED sets the recovery flag and clears lease'
);
select ok(
  (select outcome = 'REAUTH_REQUIRED' and refresh_token is null from public.claim_meli_refresh(900000001)),
  'claim rejects REAUTH_REQUIRED without returning a credential'
);

select is(
  (select outcome from public.initialize_meli_oauth_connection(900000001, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_UNKNOWN_', 'A'))),
  'REAUTHORIZED',
  'human authorization recovers REAUTH_REQUIRED'
);
select ok((select outcome = 'CLAIMED' from public.claim_meli_refresh(900000001)), 'OUTCOME_UNKNOWN setup acquires a lease');
select is(
  (
    select r.status
    from private.meli_oauth_connections c
    cross join lateral public.fail_meli_refresh(900000001, c.lease_id, c.token_version, 'RESPONSE_LOST', 'OUTCOME_UNKNOWN') r
    where c.external_user_id = 900000001
  ),
  'REFRESH_OUTCOME_UNKNOWN',
  'OUTCOME_UNKNOWN enters the ambiguous terminal state'
);
select ok(
  (select reauth_required and lease_id is null and consecutive_failures = 1 from private.meli_oauth_connections where external_user_id = 900000001),
  'OUTCOME_UNKNOWN blocks automatic recovery'
);
select ok(
  (select outcome = 'OUTCOME_UNKNOWN' and refresh_token is null from public.claim_meli_refresh(900000001)),
  'claim rejects ambiguous state without returning a credential'
);

select is(
  (select outcome from public.initialize_meli_oauth_connection(900000001, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_CONFIG_', 'A'))),
  'REAUTHORIZED',
  'human authorization recovers REFRESH_OUTCOME_UNKNOWN'
);
select ok((select outcome = 'CLAIMED' from public.claim_meli_refresh(900000001)), 'CONFIG_ERROR setup acquires a lease');
select is(
  (
    select r.status
    from private.meli_oauth_connections c
    cross join lateral public.fail_meli_refresh(900000001, c.lease_id, c.token_version, 'INVALID_CLIENT', 'CONFIG_ERROR') r
    where c.external_user_id = 900000001
  ),
  'DISABLED',
  'CONFIG_ERROR disables the connection'
);
select ok(
  (select reauth_required and lease_id is null from private.meli_oauth_connections where external_user_id = 900000001),
  'CONFIG_ERROR requires intervention and clears lease'
);
select ok(
  (select outcome = 'DISABLED' and refresh_token is null from public.claim_meli_refresh(900000001)),
  'claim rejects DISABLED without returning a credential'
);
select is(
  (select outcome from public.initialize_meli_oauth_connection(900000001, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_DISABLED_', 'A'))),
  'STATE_NOT_ALLOWED',
  'DISABLED connection refuses authorization replacement'
);
select ok(
  (
    select status = 'DISABLED' and token_version = 4 and last_error_code = 'INVALID_CLIENT'
    from private.meli_oauth_connections where external_user_id = 900000001
  ),
  'STATE_NOT_ALLOWED preserves disabled metadata and version'
);

-- Missing secret and expired lease both fail closed.
do $$ begin
  perform * from public.initialize_meli_oauth_connection(900000002, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_MISSING_', 'B'));
end $$;
delete from vault.secrets
where id = (select vault_secret_id from private.meli_oauth_connections where external_user_id = 900000002);
select ok(
  (select outcome = 'SECRET_MISSING' and refresh_token is null from public.claim_meli_refresh(900000002)),
  'missing Vault secret is reported without returning a credential'
);
select ok(
  (
    select status = 'REAUTH_REQUIRED' and reauth_required and last_error_code = 'SECRET_MISSING'
    from private.meli_oauth_connections where external_user_id = 900000002
  ),
  'missing Vault secret forces reauthorization'
);

do $$ begin
  perform * from public.initialize_meli_oauth_connection(900000003, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_EXPIRED_', 'C'));
end $$;
select ok((select outcome = 'CLAIMED' from public.claim_meli_refresh(900000003)), 'expired lease setup acquires a lease');
update private.meli_oauth_connections
set lease_acquired_at = pg_catalog.clock_timestamp() - interval '3 minutes',
    lease_expires_at = pg_catalog.clock_timestamp() - interval '1 minute'
where external_user_id = 900000003;
select ok(
  (select outcome = 'OUTCOME_UNKNOWN' and refresh_token is null from public.claim_meli_refresh(900000003)),
  'expired REFRESHING lease is not automatically reused'
);
select ok(
  (
    select status = 'REFRESH_OUTCOME_UNKNOWN' and reauth_required and lease_id is null
    from private.meli_oauth_connections where external_user_id = 900000003
  ),
  'expired lease transitions deterministically to ambiguous state'
);

-- A different connection can only retrieve its own associated Vault value.
do $$ begin
  perform * from public.initialize_meli_oauth_connection(900000004, pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_ISOLATED_', 'D'));
end $$;
select ok(
  (
    select outcome = 'CLAIMED'
      and external_user_id = 900000004
      and extensions.digest(refresh_token, 'sha256') =
          extensions.digest(pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_ISOLATED_', 'D'), 'sha256')
    from public.claim_meli_refresh(900000004)
  ),
  'claim can read only the credential associated with the requested connection'
);

select throws_ok(
  $$select * from public.initialize_meli_oauth_connection(0, 'not-a-real-token')$$,
  '22023',
  'OAUTH_INVALID_EXTERNAL_USER_ID',
  'invalid external user error is constant and sanitized'
);
select throws_ok(
  $$select * from public.initialize_meli_oauth_connection(900000005, null)$$,
  '22023',
  'OAUTH_INVALID_REFRESH_TOKEN',
  'invalid refresh credential error does not echo input'
);
select throws_ok(
  $$select * from public.fail_meli_refresh(900000005, '00000000-0000-0000-0000-000000000000', 0, 'bad value', 'SAFE_RETRY')$$,
  '22023',
  'OAUTH_INVALID_ERROR_CODE',
  'free-form error text is rejected without echoing it'
);
select throws_ok(
  $$select * from public.fail_meli_refresh(900000005, '00000000-0000-0000-0000-000000000000', 0, 'SAFE_CODE', 'ARBITRARY')$$,
  '22023',
  'OAUTH_INVALID_OUTCOME_CLASS',
  'arbitrary outcome class is rejected'
);

-- Vault and metadata participate in the same transaction/subtransaction.
do $$
begin
  begin
    perform * from public.initialize_meli_oauth_connection(
      900000099,
      pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_ROLLBACK_', 'Z')
    );
    raise exception using message = 'SYNTHETIC_ROLLBACK';
  exception when others then
    null;
  end;
end;
$$;
select ok(
  not exists (select 1 from private.meli_oauth_connections where external_user_id = 900000099)
  and not exists (select 1 from vault.secrets where name = 'autoachado_meli_refresh_900000099'),
  'rollback after Vault creation leaves neither metadata nor orphan secret'
);

select * from finish();
rollback;
