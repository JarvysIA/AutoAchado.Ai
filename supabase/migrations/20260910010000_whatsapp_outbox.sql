-- The notebook has an outbox-only bearer credential, never a Supabase key.
create table public.whatsapp_connector (
 id integer primary key check(id=1), token_hash text not null,
 generation uuid not null default gen_random_uuid(), heartbeat_at timestamptz,
 connected boolean not null default false, groups jsonb not null default '[]',
 updated_at timestamptz not null default now()
);
create table public.whatsapp_destinations (
 vertical_key text primary key references public.commercial_verticals(vertical_key),
 group_id text not null check(group_id ~ '^[0-9-]+@g.us$'), group_name text not null,
 enabled boolean not null default false, updated_at timestamptz not null default now()
);
create table public.whatsapp_outbox (
 id uuid primary key default gen_random_uuid(), generation uuid not null,
 vertical_key text not null references public.commercial_verticals(vertical_key),
 identity_key text not null, product_id text not null, product_type text not null,
 group_id text not null, group_name text not null, affiliate_url text not null,
 message text not null, title text not null,
 state text not null default 'DRAFT' check(state in ('DRAFT','PENDING','SENDING','SENT','FAILED','UNKNOWN','CANCELLED')),
 created_at timestamptz not null default now(), claimed_at timestamptz, finished_at timestamptz,
 claim_token uuid, message_id text, failure_code text
);
create unique index whatsapp_outbox_no_duplicate on public.whatsapp_outbox(vertical_key,identity_key,group_id)
 where state in ('PENDING','SENDING','SENT','UNKNOWN');
create index whatsapp_outbox_queue on public.whatsapp_outbox(state,created_at);
alter table public.whatsapp_connector enable row level security;
alter table public.whatsapp_destinations enable row level security;
alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_connector,public.whatsapp_destinations,public.whatsapp_outbox from public,anon,authenticated;
grant all on public.whatsapp_connector,public.whatsapp_destinations,public.whatsapp_outbox to service_role;

create function public.whatsapp_pair(new_hash text) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into whatsapp_connector(id,token_hash) values(1,new_hash)
 on conflict(id) do update set token_hash=new_hash,generation=gen_random_uuid(),connected=false,heartbeat_at=null,groups='[]',updated_at=now();
 update whatsapp_outbox set state='CANCELLED',failure_code='CONNECTOR_REPLACED' where state in ('DRAFT','PENDING');
 update whatsapp_outbox set state='UNKNOWN',failure_code='CONNECTOR_REPLACED' where state='SENDING';
 update whatsapp_destinations set enabled=false where enabled=true;
end $$;

create function public.whatsapp_bind(v text,g text,n text,e boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from whatsapp_connector where id=1 for update;
 if exists(select 1 from whatsapp_outbox where vertical_key=v and state='SENDING') then raise exception 'SEND_IN_PROGRESS'; end if;
 if not exists(select 1 from whatsapp_connector c,jsonb_array_elements(c.groups) x where c.id=1 and x->>'id'=g and x->>'name'=n) then raise exception 'UNKNOWN_GROUP'; end if;
 insert into whatsapp_destinations(vertical_key,group_id,group_name,enabled) values(v,g,n,e)
 on conflict(vertical_key) do update set group_id=g,group_name=n,enabled=e,updated_at=now();
 update whatsapp_outbox set state='CANCELLED',failure_code='DESTINATION_CHANGED' where vertical_key=v and state in ('DRAFT','PENDING');
end $$;

create function public.whatsapp_approve(job uuid) returns void language plpgsql security definer set search_path=public as $$
declare j whatsapp_outbox;
begin
 perform 1 from whatsapp_connector where id=1 for update;
 select * into j from whatsapp_outbox where id=job for update;
 if j.state='PENDING' then return; end if;
 if j.state is distinct from 'DRAFT' or j.created_at<now()-interval '10 minutes' then raise exception 'DRAFT_EXPIRED'; end if;
 if not exists(select 1 from whatsapp_connector where id=1 and generation=j.generation) or
 not exists(select 1 from whatsapp_destinations where vertical_key=j.vertical_key and group_id=j.group_id and enabled) then raise exception 'DESTINATION_CHANGED'; end if;
 update whatsapp_outbox set state='PENDING' where id=job;
end $$;

create function public.whatsapp_claim(gen uuid) returns setof public.whatsapp_outbox language plpgsql security definer set search_path=public as $$
declare job uuid;
begin
 perform 1 from whatsapp_connector where id=1 and generation=gen and connected and heartbeat_at>now()-interval '90 seconds' for update;
 if not found then return; end if;
 update whatsapp_outbox set state='UNKNOWN',failure_code='CONFIRMATION_TIMEOUT' where state='SENDING' and claimed_at<now()-interval '5 minutes';
 update whatsapp_outbox set state='FAILED',failure_code='OFFER_EXPIRED' where state='PENDING' and created_at<now()-interval '30 minutes';
 if exists(select 1 from whatsapp_outbox where state='SENDING') then return; end if;
 select o.id into job from whatsapp_outbox o join whatsapp_destinations d on d.vertical_key=o.vertical_key and d.group_id=o.group_id and d.enabled
 where o.state='PENDING' and o.generation=gen order by o.created_at limit 1 for update of o skip locked;
 return query update whatsapp_outbox set state='SENDING',claimed_at=now(),claim_token=gen_random_uuid() where id=job returning *;
end $$;

create function public.whatsapp_finish(job uuid,gen uuid,claim uuid,result text,provider_id text,reason text) returns void
language plpgsql security definer set search_path=public as $$
declare j whatsapp_outbox;
begin
 select * into j from whatsapp_outbox where id=job and generation=gen and claim_token=claim for update;
 if not found then raise exception 'INVALID_CLAIM'; end if;
 if j.state='SENT' and result='SENT' and j.message_id=provider_id then return; end if;
 if j.state not in ('SENDING','UNKNOWN') or result not in ('SENT','FAILED','UNKNOWN') then raise exception 'INVALID_STATE'; end if;
 if result='SENT' and (provider_id is null or length(provider_id)<5) then raise exception 'MISSING_CONFIRMATION'; end if;
 update whatsapp_outbox set state=result,message_id=provider_id,failure_code=reason,finished_at=now() where id=job;
 if result='SENT' then
  insert into commercial_sent_products(vertical_key,identity_key,sent_at,updated_at) values(j.vertical_key,j.identity_key,now(),now())
  on conflict(vertical_key,identity_key) do update set sent_at=excluded.sent_at,updated_at=excluded.updated_at;
 end if;
end $$;
revoke all on function public.whatsapp_pair(text),public.whatsapp_bind(text,text,text,boolean),public.whatsapp_approve(uuid),public.whatsapp_claim(uuid),public.whatsapp_finish(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.whatsapp_pair(text),public.whatsapp_bind(text,text,text,boolean),public.whatsapp_approve(uuid),public.whatsapp_claim(uuid),public.whatsapp_finish(uuid,uuid,uuid,text,text,text) to service_role;
