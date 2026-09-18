-- Operational alerting: alert bookkeeping, OAuth transition history and the hourly dispatch.
-- Read-only with respect to selection, collection and price rules; no token material is copied.
create table public.operational_alert_state (
 alert_key text primary key check(alert_key ~ '^[A-Z][A-Z0-9_]*(:[A-Z][A-Z0-9_]*)?$'),
 active boolean not null default false,
 first_detected_at timestamptz, last_notified_at timestamptz, resolved_at timestamptz,
 detail text check(detail is null or length(detail)<=200)
);

create table private.meli_oauth_events (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(),
 from_status text, to_status text, reauth_required boolean,
 error_code text check(error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
 consecutive_failures integer, token_version bigint
);
alter table private.meli_oauth_events enable row level security;
alter table private.meli_oauth_events owner to postgres;
revoke all privileges on table private.meli_oauth_events from public, anon, authenticated, service_role;

-- Records only the observable connection state. Lease and vault columns are never read here.
create function private.record_meli_oauth_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status
  or new.reauth_required is distinct from old.reauth_required
  or new.last_error_code is distinct from old.last_error_code
  or new.consecutive_failures is distinct from old.consecutive_failures then
  insert into private.meli_oauth_events(from_status,to_status,reauth_required,error_code,consecutive_failures,token_version)
  values(old.status,new.status,new.reauth_required,new.last_error_code,new.consecutive_failures,new.token_version);
 end if;
 return new;
end $$;
create trigger meli_oauth_event after update on private.meli_oauth_connections for each row execute function private.record_meli_oauth_event();

create function public.operational_meli_connection_status()
returns table(status text,reauth_required boolean,consecutive_failures integer,last_error_code text,last_success_at timestamptz,last_refresh_at timestamptz)
language sql security definer set search_path='' as $$
 select c.status,c.reauth_required,c.consecutive_failures,c.last_error_code,c.last_success_at,c.last_refresh_at
 from private.meli_oauth_connections c order by c.updated_at desc limit 1;
$$;

create function public.dispatch_operational_alerts() returns bigint language plpgsql security definer set search_path='' as $$
declare bearer text; request_id bigint;
begin
 select decrypted_secret into bearer from vault.decrypted_secrets where name='commercial_priority_cron_secret';
 if bearer is null then raise exception 'ALERTS_CRON_NOT_CONFIGURED';end if;
 select net.http_get(url:='https://autoachado-ai.vercel.app/api/commercial/alerts',
  headers:=jsonb_build_object('Authorization','Bearer '||bearer),timeout_milliseconds:=60000) into request_id;return request_id;
end $$;

alter table public.operational_alert_state enable row level security;
revoke all on public.operational_alert_state from public,anon,authenticated;
grant all on public.operational_alert_state to service_role;
revoke all on function public.operational_meli_connection_status(),public.dispatch_operational_alerts(),private.record_meli_oauth_event() from public,anon,authenticated;
grant execute on function public.operational_meli_connection_status(),public.dispatch_operational_alerts() to service_role;
select cron.schedule('operational-alerts-hourly','50 * * * *',$$select public.dispatch_operational_alerts()$$);
