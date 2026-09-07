alter table public.commercial_watchlist
 add column next_evidence_check timestamptz not null default now(),
 add column last_evidence_attempt timestamptz,
 add column last_valid_price_at timestamptz,
 add column evidence_failures integer not null default 0;
alter table public.commercial_collection_runs add column deferred integer not null default 0;
create index commercial_evidence_due on public.commercial_watchlist(next_evidence_check) where monitor;
update public.commercial_watchlist w set last_valid_price_at=(
 select max(observed_at) from public.commercial_observations o where o.identity_key=w.identity_key
 and o.price>0 and o.currency='BRL' and o.comparable and o.trusted and o.observed_at<=now());

create function public.commercial_monitoring_health() returns jsonb
language sql security invoker set search_path=public as $$
 select jsonb_build_object('monitored',count(*),
 'fresh',count(*) filter(where last_valid_price_at>=now()-interval '24 hours'),
 'due',count(*) filter(where next_evidence_check<=now()),
 'retrying',count(*) filter(where evidence_failures>0),
 'never_observed',count(*) filter(where last_valid_price_at is null))
 from commercial_watchlist where monitor;
$$;
revoke all on function public.commercial_monitoring_health() from public,anon,authenticated;
grant execute on function public.commercial_monitoring_health() to service_role;

-- Activation occurs after verifying the new deployment; reuse the protected Vault secret.
create function public.dispatch_commercial_history() returns bigint
language plpgsql security definer set search_path='' as $$
declare bearer text; request_id bigint;
begin
 select decrypted_secret into bearer from vault.decrypted_secrets where name='commercial_priority_cron_secret';
 if bearer is null or length(bearer)<32 then raise exception 'HISTORY_CRON_NOT_CONFIGURED'; end if;
 select net.http_get(url:='https://autoachado-ai.vercel.app/api/commercial/cron',
  headers:=jsonb_build_object('Authorization','Bearer '||bearer),timeout_milliseconds:=240000) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_commercial_history() from public,anon,authenticated;
grant execute on function public.dispatch_commercial_history() to service_role;
