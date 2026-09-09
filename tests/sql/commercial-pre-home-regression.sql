-- Always execute in BEGIN / ROLLBACK. Fixtures cannot survive the transaction.
do $$
declare before_prices bigint; changes_before bigint; admitted integer; n integer; test_run uuid; samples_before bigint;
begin
 perform pg_advisory_xact_lock(hashtext('commercial-watchlist-seed'));
 select count(*) into before_prices from commercial_observations;
 select count(*) into samples_before from commercial_health_samples;
 insert into commercial_collection_runs(kind) values('HISTORY') returning id into test_run;
 update commercial_collection_runs set status='COMPLETED',finished_at=now() where id=test_run;
 if (select count(*) from commercial_health_samples)<>samples_before+1 then raise exception 'Run health trigger failed'; end if;
 select count(*) into changes_before from commercial_cohort_changes;
 update commercial_watchlist set monitor=false where monitor;
 update commercial_candidate_queue set state='REJECTED' where state='QUALIFIED';
 update commercial_verticals set monitor_capacity=3,family_capacity=1,daily_replacement_limit=1 where vertical_key='AUTOMOTIVE';
 for n in 1..6 loop
  insert into commercial_watchlist(source_key,product_id,type,category_id,snapshot,identity_key,monitor,preview)
   values('PRODUCT:MLB98999000'||n,'MLB98999000'||n,'PRODUCT','MLB5672','{}','fixture:prehome:'||n,n<=3,
    jsonb_build_object('priceCheckedAt',now()::text,'price',50,'seller_id','fixture-seller'));
  insert into commercial_editorial_assessments(vertical_key,source_key,identity_key,family,state,reason,version,assessed_at,preview_checked_at,valid_until)
   values('AUTOMOTIVE','PRODUCT:MLB98999000'||n,'fixture:prehome:'||n,
    case when n in(1,2) then 'avaliar' when n in(3,6) then 'limpeza' when n=4 then 'pneus' else 'celular' end,
    case when n<=2 then 'EXCLUDE' else 'ELIGIBLE' end,'fixture','automotive-pre-home-v1',now(),now()::text,now()+interval '1 hour');
  if n>3 then
   insert into commercial_candidate_queue(source_key,product_id,type,category_id,snapshot,best_position,last_seen_at,state)
    values('PRODUCT:MLB98999000'||n,'MLB98999000'||n,'PRODUCT','MLB5672','{}',n,now(),'QUALIFIED');
  end if;
 end loop;
 insert into commercial_sent_products(vertical_key,identity_key,sent_at) values('AUTOMOTIVE','fixture:prehome:2',now());
 admitted:=promote_commercial_candidates();
 if admitted<>1 then raise exception 'Expected one bounded replacement, got %',admitted; end if;
 if (select count(*) from commercial_cohort_changes)<>changes_before+1 then raise exception 'Audit missing'; end if;
 if (select monitor from commercial_watchlist where source_key='PRODUCT:MLB989990001') then raise exception 'Excluded fixture not replaced'; end if;
 if not (select monitor from commercial_watchlist where source_key='PRODUCT:MLB989990002') then raise exception 'Sent product replaced'; end if;
 if promote_commercial_candidates()<>0 then raise exception 'Daily replacement cap bypassed'; end if;
 update commercial_watchlist set monitor=false where source_key='PRODUCT:MLB989990004';
 if promote_commercial_candidates()<>1 then raise exception 'Empty slot should admit next eligible family'; end if;
 update commercial_watchlist set monitor=false where source_key='PRODUCT:MLB989990005';
 if promote_commercial_candidates()<>0 then raise exception 'Family ceiling bypassed'; end if;
 if (select count(*) from commercial_observations)<>before_prices+2 then raise exception 'Admission prices missing or historical rows removed'; end if;
 if not exists(select 1 from commercial_watchlist where source_key='PRODUCT:MLB989990005' and last_valid_price_at=now()) then
  raise exception 'Admission price coverage missing'; end if;
 begin
  update commercial_verticals set enabled=true,rules_version='TEST' where vertical_key='HOME';
  raise exception 'HOME executor guard missing';
 exception when check_violation then null;
 end;
 if (commercial_pre_home_readiness()->>'seven_day_coverage_passed')::boolean then raise exception 'Invented seven days'; end if;
 if has_table_privilege('anon','commercial_editorial_assessments','SELECT')
  or has_function_privilege('authenticated','commercial_pre_home_readiness()','EXECUTE') then raise exception 'Access leaked'; end if;
end $$;
