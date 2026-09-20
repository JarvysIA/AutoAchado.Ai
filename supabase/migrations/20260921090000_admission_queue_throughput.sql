-- Admission throughput: the queue was spending its whole budget on types that never convert
-- and on categories that are out of scope, while valuable catalog products waited behind them.
-- Everything here is reversible: put the rows back to PENDING and re-enable the type in
-- exploreCandidates / seed_commercial_watchlist.

-- 1. Park the types that do not convert. /user-products/* answers 403 and ITEM barely qualifies.
update public.commercial_candidate_queue
 set state='REJECTED',reason='UNSUPPORTED_TYPE',evaluated_at=now()
 where type in ('USER_PRODUCT','ITEM') and state in ('PENDING','RETRY');

-- New occurrences of those types are parked on arrival, so they never reach the Mercado Livre API.
-- Reverting means restoring the previous CASE, which had no UNSUPPORTED_TYPE branch.
create or replace function public.seed_commercial_watchlist() returns integer
language plpgsql security invoker set search_path=public as $$
declare inserted integer;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 with latest as (
  select distinct on(h.type,h.product_id) h.*,c.external_category_id
  from highlight_snapshots h join marketplace_categories c using(marketplace_category_id)
  where h.observed_at >= now()-interval '7 days'
  order by h.type,h.product_id,h.observed_at desc,h.position
 )
 insert into commercial_candidate_queue(source_key,product_id,type,category_id,snapshot,best_position,last_seen_at,state,reason)
 select type||':'||product_id,product_id,type,external_category_id,
  jsonb_build_object('product_id',product_id,'type',type,'position',position,'priority_tier',priority_tier,'observed_at',observed_at),
  coalesce(position,20),observed_at,
  case when exists(select 1 from commercial_watchlist w where w.source_key=latest.type||':'||latest.product_id and w.monitor) then 'MONITORED'
   when exists(select 1 from commercial_watchlist w where w.source_key=latest.type||':'||latest.product_id) then 'REJECTED'
   when latest.type<>'PRODUCT' then 'REJECTED' else 'PENDING' end,
  case when latest.type<>'PRODUCT' and not exists(select 1 from commercial_watchlist w where w.source_key=latest.type||':'||latest.product_id)
   then 'UNSUPPORTED_TYPE' end
 from latest
 on conflict(source_key) do update set last_seen_at=excluded.last_seen_at,
  best_position=excluded.best_position,snapshot=excluded.snapshot;
 get diagnostics inserted=row_count;
 return inserted;
end $$;

-- 2. Categories that the frozen family map marks as out of scope never need a preview call.
-- The literal list mirrors AUTOMOTIVE_CATEGORY_FAMILY; regenerate it if the map changes.
update public.commercial_candidate_queue
 set state='REJECTED',reason='EXCLUDED_CATEGORY',evaluated_at=now()
 where type='PRODUCT' and state in ('PENDING','RETRY') and category_id in (
  'MLB11099','MLB191708','MLB191834','MLB193967','MLB194025','MLB194026','MLB194027','MLB194028',
  'MLB198931','MLB2220','MLB2228','MLB22727','MLB22735','MLB243791','MLB3385','MLB3932',
  'MLB429227','MLB430675','MLB431319','MLB432538','MLB437274','MLB438870','MLB439463','MLB439464',
  'MLB439465','MLB439944','MLB440153','MLB440299','MLB440300','MLB440490','MLB45256','MLB456122',
  'MLB456123','MLB456128','MLB456142','MLB456145','MLB457271','MLB457915','MLB457979','MLB458211',
  'MLB458212','MLB458222','MLB458231','MLB458234','MLB458236','MLB458243','MLB458245','MLB458247',
  'MLB458249','MLB458250','MLB458330','MLB458334','MLB458335','MLB46559','MLB46560','MLB47097',
  'MLB47098','MLB47119','MLB47120','MLB4860','MLB6789','MLB7863'
 );

-- 5. Retries that failed without a recorded cause are re-read straight away, now that the order
-- puts the best ranked and most recent first and the failure logs a sanitized code.
update public.commercial_candidate_queue
 set next_check_at=now()
 where type='PRODUCT' and state='RETRY' and reason='UPSTREAM_OR_STORAGE_FAILURE';
