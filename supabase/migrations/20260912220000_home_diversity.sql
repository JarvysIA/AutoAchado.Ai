-- Diversity is separate from price approval: never manufacture demand or a discount.
create function public.home_diversity_key(category text,title text) returns text language sql immutable set search_path=public as $$
 select case
 when t ~ '\m(mop|esfregao)\M' then 'mop'
 when t ~ '\m(pote|potes|marmita|marmitas)\M' then 'potes'
 when t ~ '\m(pano|panos|flanela|flanelas|duramax)\M' then 'panos'
 when t ~ '\m(esponja|esponjas|bucha|bombril)\M' and t !~ 'porta|dispenser' then 'esponjas'
 when t ~ 'escorredor.*louca' then 'escorredores'
 when t ~ '\m(cabide|cabides)\M' then 'cabides'
 when t ~ 'toalha' and category in ('MLB278286','MLB186351') then 'toalhas-banho-rosto'
 else category end
 from (select translate(lower(coalesce(title,'')),'áàâãéêíóôõúüç','aaaaeeiooouuc') t) s
$$;
alter table public.home_candidates add column diversity_key text generated always as (public.home_diversity_key(category_id,preview->>'title')) stored;
create index on public.home_candidates(diversity_key) where monitor;
alter table public.home_renewals add column reason text not null default 'SCORE';

create function public.rebalance_home_candidates(max_changes integer default 5) returns integer language plpgsql security invoker set search_path=public as $$
declare c record; victim text; changed integer:=0; swaps integer; slots integer; why text;
begin
 perform pg_advisory_xact_lock(hashtext('home-executor'));
 if max_changes<0 or max_changes>100 then raise exception 'INVALID_LIMIT';end if;
 if not exists(select 1 from commercial_verticals where vertical_key='HOME' and enabled and executor_ready) then raise exception 'HOME_DISABLED';end if;
 select least(monitor_capacity,100) into slots from commercial_verticals where vertical_key='HOME';
 select count(*) into swaps from home_renewals where old_source is not null and (created_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date;
 -- First represent useful types that have no slot, then the next-best of each type.
 for c in select h.* from home_candidates h
 where not monitor and assessment->>'eligible'='true' and feedback is distinct from 'NOT_RELEVANT'
 and (preview->>'priceCheckedAt')::timestamptz>now()-interval '24 hours'
 order by (select count(*) from home_candidates m where m.monitor and m.diversity_key=h.diversity_key) + row_number() over(partition by h.diversity_key order by h.score desc,h.source_key),score desc,source_key loop
  if (select count(*) from home_candidates where monitor and diversity_key=c.diversity_key)>=3 then continue;end if;
  victim:=null;why:='ADMISSION';
  if (select count(*) from home_candidates where monitor)>=slots then
   if changed>=max_changes then exit;end if;
   -- Replace redundant types first, retaining products the operator marked interested.
   select h.source_key into victim from home_candidates h where h.monitor and h.feedback is distinct from 'INTERESTED'
   and (select count(*) from home_candidates m where m.monitor and m.diversity_key=h.diversity_key)>3
   and ((select count(*) from home_candidates m where m.monitor and m.family=c.family)<25 or h.family=c.family)
   order by h.score,h.source_key limit 1;
   why:='DIVERSITY';
   if victim is null then
    if swaps>=5 then continue;end if;
    select h.source_key into victim from home_candidates h where h.monitor and h.feedback is distinct from 'INTERESTED' and h.score<c.score-5
    and ((select count(*) from home_candidates m where m.monitor and m.family=c.family)<25 or h.family=c.family)
    order by h.score,h.source_key limit 1;
    why:='SCORE';
   end if;
   if victim is null then continue;end if;
  elsif (select count(*) from home_candidates where monitor and family=c.family)>=25 then continue;
  end if;
  if victim is not null then update home_candidates set monitor=false where source_key=victim;swaps:=swaps+1;end if;
  update home_candidates set monitor=true where source_key=c.source_key;
  insert into home_renewals(old_source,new_source,reason) values(victim,c.source_key,why);changed:=changed+1;
 end loop;return changed;
end $$;
create or replace function public.renew_home_candidates() returns integer language sql security invoker set search_path=public as $$
 select public.rebalance_home_candidates(5)
$$;
revoke all on function public.rebalance_home_candidates(integer) from public,anon,authenticated;
grant execute on function public.rebalance_home_candidates(integer) to service_role;
