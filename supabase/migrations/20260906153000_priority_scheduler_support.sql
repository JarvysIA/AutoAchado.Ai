create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Scheduling is enabled only after the new production route has been verified.
-- The job text contains no credential, only this fixed function call.
create function public.dispatch_commercial_priority() returns bigint
language plpgsql security definer set search_path='' as $$
declare bearer text; request_id bigint;
begin
 select decrypted_secret into bearer from vault.decrypted_secrets where name='commercial_priority_cron_secret';
 if bearer is null or length(bearer)<32 then raise exception 'PRIORITY_CRON_NOT_CONFIGURED'; end if;
 select net.http_get(
  url:='https://autoachado-ai.vercel.app/api/commercial/priority',
  headers:=jsonb_build_object('Authorization','Bearer '||bearer),
  timeout_milliseconds:=180000
 ) into request_id;
 return request_id;
end $$;
revoke all on function public.dispatch_commercial_priority() from public,anon,authenticated;
grant execute on function public.dispatch_commercial_priority() to service_role;
