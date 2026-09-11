-- Publishing does not reserve a monitoring slot forever. Keep sent records and price history.
create or replace function public.promote_commercial_candidates() returns integer
language plpgsql security invoker set search_path=public as $$
declare capacity integer; family_limit integer; replacement_limit integer; promoted integer:=0;
 candidate record; victim record; family_count integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select monitor_capacity,family_capacity,daily_replacement_limit into capacity,family_limit,replacement_limit
 from commercial_verticals where vertical_key='AUTOMOTIVE' and enabled and executor_ready;
 if capacity is null then return 0; end if;
 -- Only explicit interest protects a slot; sent history survives renewal independently.
 lock table commercial_vertical_feedback in share row exclusive mode;
 update commercial_candidate_queue q set state='RETRY',reason='SELECTION_FRESHNESS_RECHECK',next_check_at=now()
 from commercial_watchlist w where q.source_key=w.source_key and q.state='QUALIFIED' and not w.monitor
  and (w.preview->>'priceCheckedAt' is null or (w.preview->>'priceCheckedAt')::timestamptz<now()-interval '24 hours');
 for candidate in
  select s.*,w.preview from commercial_selection_assessments s
   join commercial_watchlist w on w.source_key=s.source_key and w.identity_key=s.identity_key
   join commercial_candidate_queue q on q.source_key=w.source_key
   join commercial_editorial_assessments a on a.source_key=w.source_key and a.vertical_key='AUTOMOTIVE'
  where s.eligible and s.score>=60 and s.demand_days>=3 and not w.monitor and q.state='QUALIFIED'
   and s.assessed_at between now()-interval '15 minutes' and now()
   and s.preview_checked_at=w.preview->>'priceCheckedAt'
   and a.state='ELIGIBLE' and a.identity_key=w.identity_key and a.valid_until>now()
   and a.preview_checked_at=w.preview->>'priceCheckedAt' and a.family=s.family
   and w.preview->>'seller_id' is not null
   and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key='AUTOMOTIVE'
    and f.identity_key=w.identity_key and f.action='NOT_RELEVANT')
   and not exists(select 1 from commercial_cohort_changes c where c.removed_source=w.source_key)
  order by s.score desc,s.identity_key,s.source_key
 loop
  if exists(select 1 from commercial_vertical_memberships where vertical_key='AUTOMOTIVE'
    and identity_key=candidate.identity_key and monitor) then continue; end if;
  select count(*) into family_count from commercial_vertical_memberships m
   left join commercial_selection_assessments s using(identity_key)
   where m.vertical_key='AUTOMOTIVE' and m.monitor and coalesce(s.family,'avaliar')=candidate.family;
  select null::text as source_key,null::integer as score,null::text as family,null::jsonb as evidence into victim;
  if (select count(*) from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor)>=capacity then
   if candidate.demand_days<7 or (select count(*) from commercial_cohort_changes where vertical_key='AUTOMOTIVE'
     and changed_at>=date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')>=replacement_limit then continue; end if;
   select m.source_key,s.score,s.family,s.evidence into victim
    from commercial_vertical_memberships m join commercial_selection_assessments s using(identity_key)
    where m.vertical_key='AUTOMOTIVE' and m.monitor and m.monitor_since<=now()-interval '7 days'
     and s.assessed_at between now()-interval '15 minutes' and now() and candidate.score-s.score>=10
     and (family_count<family_limit or (family_count=family_limit and s.family=candidate.family))
     and not exists(select 1 from commercial_vertical_feedback f where f.vertical_key=m.vertical_key
       and f.identity_key=m.identity_key and f.action='INTERESTED')
    order by s.score,m.source_key limit 1;
   if victim.source_key is null then continue; end if;
   update commercial_watchlist set monitor=false where source_key=victim.source_key;
  elsif family_count>=family_limit then continue;
  end if;
  insert into commercial_observations(identity_key,source_key,observed_at,observed_day,price,currency,seller_id,comparable,trusted,position)
   values(candidate.identity_key,candidate.source_key,(candidate.preview->>'priceCheckedAt')::timestamptz,
    ((candidate.preview->>'priceCheckedAt')::timestamptz at time zone 'UTC')::date,
    (candidate.preview->>'price')::numeric,'BRL',candidate.preview->>'seller_id',true,true,null)
   on conflict(source_key,observed_at) do nothing;
  update commercial_watchlist set monitor=true,next_evidence_check=now(),
   last_valid_price_at=(candidate.preview->>'priceCheckedAt')::timestamptz where source_key=candidate.source_key;
  update commercial_candidate_queue set state='MONITORED',reason=null where source_key=candidate.source_key;
  if victim.source_key is not null then
   insert into commercial_cohort_changes(vertical_key,removed_source,added_source,reason,evidence)
    values('AUTOMOTIVE',victim.source_key,candidate.source_key,'RECURRING_POTENTIAL_ADVANTAGE',
     jsonb_build_object('before',victim.evidence,'after',candidate.evidence,'advantage',candidate.score-victim.score));
  end if;
  promoted:=promoted+1;
 end loop;
 return promoted;
end $$;

