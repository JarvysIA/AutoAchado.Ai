-- Preserve the first verified price when admitting a new monitored product.
create or replace function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare capacity integer; family_limit integer; replacement_limit integer; promoted integer:=0;
 candidate record; victim text; victim_reason text; family_count integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity,family_capacity,daily_replacement_limit into capacity,family_limit,replacement_limit
 from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled and executor_ready;
 if capacity is null then return 0; end if;
 update commercial_candidate_queue q set state=case when a.state='EXCLUDE' then 'REJECTED' else 'RETRY' end,
  reason='EDITORIAL_OR_FRESHNESS_RECHECK',next_check_at=now()
 from commercial_editorial_assessments a where a.source_key=q.source_key and a.vertical_key='AUTOMOTIVE'
  and q.state='QUALIFIED' and (a.state<>'ELIGIBLE' or a.valid_until<=now());
 for candidate in
  select q.source_key,w.identity_key,w.preview,a.family from commercial_candidate_queue q
   join commercial_watchlist w using(source_key)
   join commercial_editorial_assessments a on a.source_key=w.source_key and a.vertical_key='AUTOMOTIVE'
  where q.state='QUALIFIED' and not w.monitor and a.state='ELIGIBLE'
   and a.identity_key=w.identity_key and a.version='automotive-pre-home-v1'
   and a.valid_until>now() and a.assessed_at>=now()-interval '24 hours'
   and a.preview_checked_at=w.preview->>'priceCheckedAt'
   and w.preview->>'seller_id' is not null
   and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
    and f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   -- Retired candidates cannot immediately cycle back into a newly freed slot.
   and not exists(select 1 from commercial_cohort_changes c where c.removed_source=w.source_key)
  order by q.best_position,q.first_seen_at,q.source_key
 loop
  if exists(select 1 from commercial_vertical_memberships where vertical_key='AUTOMOTIVE'
    and identity_key=candidate.identity_key and monitor) then continue; end if;
  select count(*) into family_count from commercial_vertical_memberships m
   join commercial_editorial_assessments a on a.source_key=m.source_key and a.vertical_key=m.vertical_key
   where m.vertical_key='AUTOMOTIVE' and m.monitor and a.family=candidate.family;
  if family_count>=family_limit then continue; end if;
  victim:=null;
  if (select count(*) from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor)>=capacity then
   if (select count(*) from commercial_cohort_changes where vertical_key='AUTOMOTIVE'
     and changed_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')>=replacement_limit then continue; end if;
   select m.source_key,case when a.state='EXCLUDE' then 'EDITORIAL_EXCLUDE' else 'FAMILY_OVERFLOW' end
    into victim,victim_reason
   from commercial_vertical_memberships m
    join commercial_editorial_assessments a on a.vertical_key=m.vertical_key and a.source_key=m.source_key
   where m.vertical_key='AUTOMOTIVE' and m.monitor and a.family<>candidate.family
    and a.version='automotive-pre-home-v1' and a.assessed_at>=now()-interval '24 hours'
    and (a.state='EXCLUDE' or (select count(*) from commercial_vertical_memberships other
      join commercial_editorial_assessments oa on oa.vertical_key=other.vertical_key and oa.source_key=other.source_key
      where other.vertical_key='AUTOMOTIVE' and other.monitor and oa.family=a.family)>family_limit)
    and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key=m.vertical_key
      and f.identity_key=m.identity_key and f.action in ('INTERESTED','SHARED'))
    and not exists(select 1 from commercial_sent_products s where s.vertical_key=m.vertical_key
      and s.identity_key=m.identity_key and s.sent_at is not null)
   order by (a.state='EXCLUDE') desc,m.created_at desc,m.source_key limit 1;
   if victim is null then continue; end if;
   update commercial_watchlist set monitor=false where source_key=victim;
  end if;
  -- The validated admission price is a real observation, with its original timestamp.
  -- Never invent a current time or ranking position and never overwrite existing evidence.
  insert into commercial_observations(identity_key,source_key,observed_at,observed_day,price,currency,seller_id,comparable,trusted,position)
   values(candidate.identity_key,candidate.source_key,(candidate.preview->>'priceCheckedAt')::timestamptz,
    ((candidate.preview->>'priceCheckedAt')::timestamptz at time zone 'UTC')::date,
    (candidate.preview->>'price')::numeric,'BRL',candidate.preview->>'seller_id',true,true,null)
   on conflict(source_key,observed_at) do nothing;
  update commercial_watchlist w set monitor=true,last_valid_price_at=(select max(o.observed_at) from commercial_observations o
   where o.source_key=w.source_key and o.identity_key=w.identity_key and o.comparable and o.trusted and o.price>0
    and o.currency='BRL' and o.observed_at<=now()) where w.source_key=candidate.source_key;
  update commercial_candidate_queue set state='MONITORED',reason=null where source_key=candidate.source_key;
  if victim is not null then
   insert into commercial_cohort_changes(vertical_key,removed_source,added_source,reason)
    values('AUTOMOTIVE',victim,candidate.source_key,victim_reason);
  end if;
  promoted:=promoted+1;
 end loop;
 return promoted;
end $$;

