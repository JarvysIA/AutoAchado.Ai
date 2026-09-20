-- Automotive families now come from the official category, with diversity limits and a rebalance
-- that starts in dry-run. No price, discount or sending rule changes here.

create table public.operational_settings (
 key text primary key check(key ~ '^[A-Z][A-Z0-9_]{2,63}$'),
 value jsonb not null,
 updated_at timestamptz not null default now()
);
insert into public.operational_settings(key,value) values('AUTOMOTIVE_REBALANCE_APPLY','false'::jsonb);

create table public.automotive_rebalance_previews (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 swaps jsonb not null,
 summary jsonb not null
);
create index automotive_rebalance_previews_recent on public.automotive_rebalance_previews(created_at desc);

-- New and nullable: the existing assessment columns keep their meaning and constraints.
alter table public.commercial_selection_assessments
 add column category_id text, add column brand text, add column duplicate_key text;

-- Only the id/external pairs the discovery registry already exposes; no product data.
create function public.automotive_category_map()
returns table(marketplace_category_id uuid,external_category_id text)
language sql stable security definer set search_path='' as $$
 select c.marketplace_category_id,c.external_category_id
 from public.marketplace_categories c
 join public.vertical_category_mappings m using(marketplace_category_id)
 where m.vertical_key='AUTOMOTIVE' and m.active and c.active
  and c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'
  and m.scope_status='ALLOWED' and m.priority_tier in ('A','B');
$$;

-- Replaces the assessment generation without promoting anyone: promotion is the rebalance's job.
create function public.replace_automotive_selection_assessments(p_assessments jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare stored integer;
begin
 if jsonb_typeof(p_assessments)<>'array' or jsonb_array_length(p_assessments)>10000 then
  raise exception 'SELECTION_INVALID_GENERATION'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtext('commercial-watchlist-seed'));
 delete from public.commercial_selection_assessments;
 insert into public.commercial_selection_assessments
  select s.* from jsonb_populate_recordset(null::public.commercial_selection_assessments,p_assessments) s
  join public.commercial_watchlist w on w.source_key=s.source_key and w.identity_key=s.identity_key
  where exists(select 1 from public.commercial_vertical_memberships m
   where m.vertical_key='AUTOMOTIVE' and m.identity_key=s.identity_key);
 get diagnostics stored=row_count;
 return stored;
end $$;

-- Each pair is validated on its own and applied atomically: a refused pair never removes anyone.
-- FILL pairs carry no remove and only run while the portfolio is below capacity.
create function public.apply_automotive_rebalance(p_swaps jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare swap jsonb; applied integer:=0; refused integer:=0;
 by_reason jsonb:='{}'::jsonb; refusals jsonb:='{}'::jsonb;
 today_start timestamptz; used_diversity integer; used_advantage integer; monitored integer;
 reason text; add_preview jsonb; add_identity text; remove_identity text; refusal text;
begin
 if jsonb_typeof(p_swaps)<>'array' or jsonb_array_length(p_swaps)>200 then raise exception 'REBALANCE_INVALID_PLAN'; end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtext('commercial-watchlist-seed'));
 lock table public.commercial_vertical_feedback,public.commercial_sent_products in share row exclusive mode;
 today_start:=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
 select count(*) filter (where c.reason='DIVERSITY'),count(*) filter (where c.reason='ADVANTAGE')
  into used_diversity,used_advantage
  from public.commercial_cohort_changes c where c.vertical_key='AUTOMOTIVE' and c.changed_at>=today_start;

 for swap in select * from jsonb_array_elements(p_swaps) loop
  reason:=swap->>'reason';
  refusal:=null;
  remove_identity:=null;
  select count(*) into monitored from public.commercial_vertical_memberships m
   where m.vertical_key='AUTOMOTIVE' and m.monitor;

  if reason not in ('DIVERSITY','ADVANTAGE','FILL') then refusal:='INVALID_REASON';
  elsif reason='DIVERSITY' and used_diversity>=20 then refusal:='DIVERSITY_DAILY_LIMIT';
  elsif reason='ADVANTAGE' and used_advantage>=5 then refusal:='ADVANTAGE_DAILY_LIMIT';
  elsif reason='FILL' and (swap->>'remove') is not null then refusal:='FILL_MUST_NOT_REMOVE';
  elsif reason='FILL' and monitored>=100 then refusal:='PORTFOLIO_FULL';
  elsif reason<>'FILL' and (swap->>'remove') is null then refusal:='REMOVE_REQUIRED';
  end if;

  -- Interest, sharing and anything already sent protect a member, exactly like the old promotion.
  if refusal is null and reason<>'FILL' then
   select w.identity_key into remove_identity from public.commercial_watchlist w
   where w.source_key=swap->>'remove' and w.monitor
    and exists(select 1 from public.commercial_vertical_memberships m
     where m.vertical_key='AUTOMOTIVE' and m.identity_key=w.identity_key and m.monitor);
   if remove_identity is null then refusal:='REMOVE_NOT_ELIGIBLE';
   elsif exists(select 1 from public.commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
     and f.identity_key=remove_identity and f.action in ('INTERESTED','SHARED'))
    or exists(select 1 from public.commercial_sent_products s where s.vertical_key='AUTOMOTIVE'
     and s.identity_key=remove_identity and s.sent_at is not null)
   then refusal:='REMOVE_PROTECTED';
   end if;
  end if;

  if refusal is null and exists(select 1 from public.commercial_cohort_changes c
   where c.vertical_key='AUTOMOTIVE' and c.removed_source=swap->>'add'
    and c.changed_at>=now()-interval '30 days') then refusal:='ADD_RECENTLY_REMOVED'; end if;

  if refusal is null then
   select w.identity_key,w.preview into add_identity,add_preview from public.commercial_watchlist w
   join public.commercial_candidate_queue q on q.source_key=w.source_key
   join public.commercial_selection_assessments s on s.source_key=w.source_key and s.identity_key=w.identity_key
   where w.source_key=swap->>'add' and not w.monitor and q.state='QUALIFIED'
    and s.eligible and s.assessed_at between now()-interval '15 minutes' and now()
    and s.preview_checked_at=w.preview->>'priceCheckedAt'
    and (w.preview->>'priceCheckedAt')::timestamptz>now()-interval '24 hours'
    and not exists(select 1 from public.commercial_vertical_memberships m
     where m.vertical_key='AUTOMOTIVE' and m.identity_key=w.identity_key and m.monitor);
   if add_identity is null then refusal:='ADD_NOT_QUALIFIED'; end if;
  end if;

  if refusal is not null then
   refused:=refused+1;
   refusals:=jsonb_set(refusals,array[refusal],to_jsonb(coalesce((refusals->>refusal)::integer,0)+1));
   continue;
  end if;

  if remove_identity is not null then
   update public.commercial_watchlist set monitor=false where source_key=swap->>'remove';
  end if;
  insert into public.commercial_observations(identity_key,source_key,observed_at,observed_day,price,currency,seller_id,comparable,trusted,position)
   values(add_identity,swap->>'add',(add_preview->>'priceCheckedAt')::timestamptz,
    ((add_preview->>'priceCheckedAt')::timestamptz at time zone 'UTC')::date,
    (add_preview->>'price')::numeric,'BRL',add_preview->>'seller_id',true,true,null)
   on conflict(source_key,observed_at) do nothing;
  update public.commercial_watchlist set monitor=true,next_evidence_check=now(),
   last_valid_price_at=(add_preview->>'priceCheckedAt')::timestamptz where source_key=swap->>'add';
  update public.commercial_candidate_queue set state='MONITORED',reason=null where source_key=swap->>'add';
  -- commercial_cohort_changes.removed_source is NOT NULL, so a FILL has nothing to record there.
  if remove_identity is not null then
   insert into public.commercial_cohort_changes(vertical_key,removed_source,added_source,reason,evidence)
    values('AUTOMOTIVE',swap->>'remove',swap->>'add',reason,
     jsonb_build_object('detail',swap->>'detail','advantage',swap->'advantage'));
  end if;
  applied:=applied+1;
  by_reason:=jsonb_set(by_reason,array[reason],to_jsonb(coalesce((by_reason->>reason)::integer,0)+1));
  if reason='DIVERSITY' then used_diversity:=used_diversity+1;
  elsif reason='ADVANTAGE' then used_advantage:=used_advantage+1; end if;
 end loop;
 return jsonb_build_object('applied',applied,'refused',refused,'byReason',by_reason,'refusals',refusals);
end $$;

-- Products the old title rules rejected: the category now decides, so they get one more pass.
-- The stored reason does not separate an editorial refusal from an unavailable product, so both
-- return to the queue; an unavailable one is simply rejected again by the normal admission check.
update public.commercial_candidate_queue q set state='PENDING',reason=null,attempts=0,next_check_at=now()
where q.state='REJECTED' and q.reason='UNSUITABLE_OR_UNAVAILABLE'
 and q.evaluated_at>=now()-interval '21 days'
 and exists(select 1 from public.marketplace_categories c
  join public.vertical_category_mappings m using(marketplace_category_id)
  where c.external_category_id=q.category_id and c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'
   and m.vertical_key='AUTOMOTIVE' and m.active and c.active
   and m.scope_status='ALLOWED' and m.priority_tier in ('A','B'));

alter table public.operational_settings enable row level security;
alter table public.automotive_rebalance_previews enable row level security;
revoke all on public.operational_settings,public.automotive_rebalance_previews from public,anon,authenticated;
grant select on public.operational_settings to service_role;
grant select,insert on public.automotive_rebalance_previews to service_role;
grant usage,select on sequence public.automotive_rebalance_previews_id_seq to service_role;
revoke all on function public.automotive_category_map(),public.replace_automotive_selection_assessments(jsonb),
 public.apply_automotive_rebalance(jsonb) from public,anon,authenticated;
grant execute on function public.automotive_category_map(),public.replace_automotive_selection_assessments(jsonb),
 public.apply_automotive_rebalance(jsonb) to service_role;
