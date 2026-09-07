-- Run inside a transaction with ROLLBACK. All fixture writes are temporary.
do $$
declare before_observations bigint; before_watches bigint; available_slots integer; inserted_count integer;
begin
 select count(*) into before_observations from commercial_observations;
 select count(*) into before_watches from commercial_watchlist;
 perform seed_commercial_watchlist();
 if (select count(*) from commercial_watchlist)<>before_watches then raise exception 'Seed must not reset or fill historical watches'; end if;
 if not exists(select 1 from commercial_candidate_queue where source_key='PRODUCT:MLB57468821') then raise exception 'Known discovered compressor lost'; end if;
 insert into commercial_watchlist(source_key,product_id,type,category_id,snapshot,identity_key,monitor)
 select 'PRODUCT:MLB999000'||n,'MLB999000'||n,'PRODUCT','MLB5672','{}','fixture:'||n,true
 from generate_series(1,greatest(0,(select monitor_capacity from commercial_verticals where vertical_key='AUTOMOTIVE')-(select count(*)::integer from commercial_watchlist where monitor))) n;
 insert into commercial_watchlist(source_key,product_id,type,category_id,snapshot,identity_key,monitor)
 values('PRODUCT:MLB999999000','MLB999999000','PRODUCT','MLB5672','{}','fixture:qualified',false);
 insert into commercial_candidate_queue(source_key,product_id,type,category_id,snapshot,best_position,last_seen_at,state)
 values('PRODUCT:MLB999999000','MLB999999000','PRODUCT','MLB5672','{}',1,now(),'QUALIFIED');
 inserted_count:=promote_commercial_candidates();
 if inserted_count<>0 then raise exception 'History capacity exceeded'; end if;
 perform save_automotive_commercial_feedback('PRODUCT:MLB999999000','INTERESTED');
 if (select monitor from commercial_watchlist where source_key='PRODUCT:MLB999999000') then raise exception 'Feedback bypassed capacity'; end if;
 if not exists(select 1 from commercial_candidate_queue where source_key='PRODUCT:MLB999999000' and state='QUALIFIED') then raise exception 'Evaluated novelty lost while capacity full'; end if;
 if (select count(*) from commercial_observations)<>before_observations then raise exception 'History modified'; end if;
end $$;
