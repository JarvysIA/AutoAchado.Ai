-- Automotive discovery moves from the Vercel cron to pg_cron + pg_net, alongside the
-- Home/Appliances schedules that have not been missing runs. Twice a day, 03h and 15h Brasilia.
create function public.dispatch_automotive_discovery() returns bigint language plpgsql security definer set search_path='' as $$
declare bearer text; request_id bigint;
begin
 select decrypted_secret into bearer from vault.decrypted_secrets where name='commercial_priority_cron_secret';
 if bearer is null then raise exception 'DISCOVERY_CRON_NOT_CONFIGURED';end if;
 select net.http_get(url:='https://autoachado-ai.vercel.app/api/commercial/discover',
  headers:=jsonb_build_object('Authorization','Bearer '||bearer),timeout_milliseconds:=300000) into request_id;return request_id;
end $$;

revoke all on function public.dispatch_automotive_discovery() from public,anon,authenticated;
grant execute on function public.dispatch_automotive_discovery() to service_role;
select cron.schedule('automotive-discovery-twice-daily','0 6,18 * * *',$$select public.dispatch_automotive_discovery()$$);
