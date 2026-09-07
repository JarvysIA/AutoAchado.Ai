-- Additive foundation. The legacy collector remains exclusively AUTOMOTIVE.
create table public.commercial_verticals (
 vertical_key text primary key,
 label text not null,
 enabled boolean not null default false,
 monitor_capacity integer not null default 100 check(monitor_capacity between 1 and 100),
 editorial_daily_target integer not null default 3 check(editorial_daily_target between 1 and 3),
 rules_version text,
 check(not enabled or rules_version is not null)
);
insert into public.commercial_verticals(vertical_key,label,enabled,rules_version) values
 ('AUTOMOTIVE','Automotivo',true,'AUTOMOTIVE_V1'),
 ('HOME','Casa, utilidades e organização',false,null),
 ('APPLIANCES','Eletrodomésticos',false,null),
 ('FASHION','Moda',false,null),
 ('BEAUTY','Beleza e cuidado pessoal',false,null),
 ('ELECTRONICS','Eletrônicos, celulares e acessórios',false,null),
 ('KIDS','Infantil: bebês, brinquedos e moda infantil',false,null),
 ('GAMES','Games',false,null),
 ('SPORTS_FITNESS','Esportes e fitness',false,null),
 ('PET','Pet',false,null);

create table public.commercial_vertical_memberships (
 vertical_key text not null references public.commercial_verticals,
 identity_key text not null,
 source_key text not null references public.commercial_watchlist,
 monitor boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(vertical_key,identity_key)
);
create index commercial_vertical_membership_source on public.commercial_vertical_memberships(source_key);
create table public.commercial_vertical_feedback (
 vertical_key text not null references public.commercial_verticals,
 identity_key text not null,
 action text not null check(action in ('SHARED','INTERESTED','NOT_RELEVANT','RESET')),
 updated_at timestamptz not null default now(),
 primary key(vertical_key,identity_key)
);
insert into public.commercial_vertical_feedback
 select 'AUTOMOTIVE',identity_key,action,updated_at from public.commercial_feedback;

-- Preserve every legacy identity and its active state; never duplicate price evidence.
insert into public.commercial_vertical_memberships(vertical_key,identity_key,source_key,monitor)
 select distinct on(identity_key) 'AUTOMOTIVE',identity_key,source_key,monitor
 from public.commercial_watchlist order by identity_key,monitor desc,source_key;

create function public.guard_commercial_vertical_capacity() returns trigger
language plpgsql security invoker set search_path=public as $$
declare capacity integer; active boolean;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity,enabled into capacity,active from commercial_verticals where vertical_key=new.vertical_key;
 if new.monitor and (not active or (select count(*) from commercial_vertical_memberships
   where vertical_key=new.vertical_key and monitor
    and (tg_op='INSERT' or identity_key<>old.identity_key))>=capacity) then
  raise exception 'COMMERCIAL_VERTICAL_CAPACITY_OR_DISABLED';
 end if;
 new.updated_at=now();
 return new;
end $$;
create trigger commercial_vertical_capacity before insert or update on public.commercial_vertical_memberships
 for each row execute function public.guard_commercial_vertical_capacity();

-- Compatibility bridge until the scoped collector replaces the legacy executor.
create function public.sync_automotive_membership() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 if new.monitor and exists(select 1 from commercial_watchlist
  where monitor and identity_key=new.identity_key and source_key<>new.source_key) then
  raise exception 'COMMERCIAL_DUPLICATE_MONITOR';
 end if;
 if tg_op='UPDATE' and old.identity_key<>new.identity_key then
  delete from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and source_key=new.source_key;
 end if;
 -- UPDATE first avoids INSERT capacity validation on an existing active membership.
 update commercial_vertical_memberships set source_key=new.source_key,monitor=new.monitor
  where vertical_key='AUTOMOTIVE' and identity_key=new.identity_key
   and (source_key=new.source_key or new.monitor);
 if not found and not exists(select 1 from commercial_vertical_memberships
   where vertical_key='AUTOMOTIVE' and identity_key=new.identity_key) then
  insert into commercial_vertical_memberships(vertical_key,identity_key,source_key,monitor)
   values('AUTOMOTIVE',new.identity_key,new.source_key,new.monitor);
 end if;
 return new;
end $$;
create trigger commercial_automotive_membership after insert or update of monitor,identity_key on public.commercial_watchlist
 for each row execute function public.sync_automotive_membership();

-- Old application versions can continue to write feedback during deployment.
create function public.sync_automotive_feedback() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 insert into commercial_vertical_feedback values('AUTOMOTIVE',new.identity_key,new.action,new.updated_at)
 on conflict(vertical_key,identity_key) do update set action=excluded.action,updated_at=excluded.updated_at;
 return new;
end $$;
create trigger commercial_automotive_feedback after insert or update on public.commercial_feedback
 for each row execute function public.sync_automotive_feedback();

create or replace function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare promoted integer; capacity integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity into capacity from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled;
 if capacity is null then return 0; end if;
 with eligible as (
  select q.source_key,q.best_position,q.first_seen_at,
   row_number() over(partition by w.identity_key order by q.best_position,q.first_seen_at,q.source_key) as identity_slot
  from commercial_candidate_queue q join commercial_watchlist w using(source_key)
  where q.state='QUALIFIED' and not w.monitor
   and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
    and f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   and not exists(select 1 from commercial_vertical_memberships m where m.vertical_key='AUTOMOTIVE'
    and m.monitor and m.identity_key=w.identity_key)
 ), selected as (
  select source_key from eligible where identity_slot=1 order by best_position,first_seen_at,source_key
  limit greatest(0,capacity-(select count(*)::integer from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor))
 ), updated as (
  update commercial_watchlist w set monitor=true from selected s where w.source_key=s.source_key returning w.source_key
 )
 update commercial_candidate_queue q set state='MONITORED',reason=null from updated u where q.source_key=u.source_key;
 get diagnostics promoted=row_count;
 return promoted;
end $$;

create function public.save_automotive_commercial_feedback(candidate_key text, feedback_action text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare identity text; active_count integer; capacity integer; resume boolean;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select identity_key into identity from commercial_watchlist where source_key=candidate_key;
 if identity is null then raise exception 'COMMERCIAL_PRODUCT_NOT_FOUND'; end if;
 insert into commercial_feedback(identity_key,action,updated_at) values(identity,feedback_action,now())
 on conflict(identity_key) do update set action=excluded.action,updated_at=excluded.updated_at;
 if feedback_action='NOT_RELEVANT' then
  update commercial_watchlist set monitor=false where identity_key=identity;
 elsif feedback_action in ('INTERESTED','RESET') then
  select monitor_capacity into capacity from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled;
  select count(*) into active_count from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor;
  resume:=capacity is not null and (active_count<capacity or exists(select 1 from commercial_vertical_memberships
   where vertical_key='AUTOMOTIVE' and identity_key=identity and monitor));
  if resume then
   -- A single canonical source consumes a single historical slot.
   update commercial_watchlist set monitor=false where identity_key=identity and source_key<>candidate_key and monitor;
   update commercial_watchlist set monitor=true,unavailable_attempts=0 where source_key=candidate_key;
  end if;
 end if;
 return jsonb_build_object('saved',true,'monitoring',coalesce((select monitor from commercial_vertical_memberships
  where vertical_key='AUTOMOTIVE' and identity_key=identity),false));
end $$;

alter table public.commercial_verticals enable row level security;
alter table public.commercial_vertical_memberships enable row level security;
alter table public.commercial_vertical_feedback enable row level security;
revoke all on public.commercial_verticals,public.commercial_vertical_memberships,public.commercial_vertical_feedback from public,anon,authenticated;
grant select,insert,update,delete on public.commercial_verticals,public.commercial_vertical_memberships,public.commercial_vertical_feedback to service_role;
revoke all on function public.guard_commercial_vertical_capacity(),public.sync_automotive_membership(),public.sync_automotive_feedback(),public.save_automotive_commercial_feedback(text,text) from public,anon,authenticated;
grant execute on function public.guard_commercial_vertical_capacity(),public.sync_automotive_membership(),public.sync_automotive_feedback(),public.save_automotive_commercial_feedback(text,text) to service_role;
