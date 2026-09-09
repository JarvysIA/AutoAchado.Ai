-- Execute migration + this file inside BEGIN/ROLLBACK against linked database.
update commercial_watchlist set monitor=false where monitor;
delete from commercial_selection_assessments;
delete from commercial_cohort_changes;
update commercial_verticals set monitor_capacity=1 where vertical_key='AUTOMOTIVE';
insert into commercial_watchlist(source_key,product_id,type,category_id,snapshot,identity_key,monitor,preview)
select 'PRODUCT:MLB99988800'||n,'MLB99988800'||n,'PRODUCT','MLB5672','{}','selection-fixture:'||n,n=1,
 jsonb_build_object('title','Compressor portátil','price',50,'currency','BRL','seller_id','fixture-seller','priceCheckedAt',now()::text)
from generate_series(1,2)n;
insert into commercial_candidate_queue(source_key,product_id,type,category_id,snapshot,best_position,last_seen_at,state)
values('PRODUCT:MLB999888002','MLB999888002','PRODUCT','MLB5672','{}',1,now(),'QUALIFIED');
insert into commercial_editorial_assessments(vertical_key,source_key,identity_key,family,state,reason,version,assessed_at,preview_checked_at,valid_until)
values('AUTOMOTIVE','PRODUCT:MLB999888002','selection-fixture:2','pneus','ELIGIBLE','fixture','automotive-pre-home-v1',now(),now()::text,now()+interval '1 day');
insert into commercial_selection_assessments
select 'selection-fixture:'||n,'PRODUCT:MLB99988800'||n,'pneus',case when n=1 then 50 else 75 end,7,true,now()::text,now(),'{}'
from generate_series(1,2)n;
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Fresh tenure replaced'; end if;
end $$;
-- Disable only tenure trigger to construct a seven-day-old fixture; ROLLBACK restores all.
alter table commercial_vertical_memberships disable trigger commercial_monitor_tenure;
update commercial_vertical_memberships set monitor_since=now()-interval '8 days' where identity_key='selection-fixture:1';
alter table commercial_vertical_memberships enable trigger commercial_monitor_tenure;
insert into commercial_vertical_feedback(vertical_key,identity_key,action) values('AUTOMOTIVE','selection-fixture:1','INTERESTED');
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Interest protection ignored'; end if;
end $$;
delete from commercial_vertical_feedback where identity_key='selection-fixture:1';
insert into commercial_sent_products(vertical_key,identity_key,sent_at) values('AUTOMOTIVE','selection-fixture:1',now());
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Sent protection ignored'; end if;
end $$;
delete from commercial_sent_products where identity_key='selection-fixture:1';
update commercial_selection_assessments set demand_days=6 where identity_key='selection-fixture:2';
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Short demand replaced'; end if;
end $$;
update commercial_selection_assessments set demand_days=7,score=60 where identity_key='selection-fixture:2';
update commercial_selection_assessments set score=55 where identity_key='selection-fixture:1';
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Small advantage replaced'; end if;
end $$;
update commercial_selection_assessments set score=75,assessed_at=now()-interval '1 hour' where identity_key='selection-fixture:2';
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Stale assessment replaced'; end if;
end $$;
update commercial_selection_assessments set assessed_at=now() where identity_key='selection-fixture:2';
update commercial_selection_assessments set score=50 where identity_key='selection-fixture:1';
update commercial_verticals set daily_replacement_limit=0 where vertical_key='AUTOMOTIVE';
do $$ begin
 if promote_commercial_candidates()<>0 then raise exception 'Daily budget ignored'; end if;
end $$;
update commercial_verticals set daily_replacement_limit=5 where vertical_key='AUTOMOTIVE';
do $$ begin
 if promote_commercial_candidates()<>1 then raise exception 'Valid replacement failed'; end if;
 if promote_commercial_candidates()<>0 then raise exception 'Not idempotent'; end if;
 if (select count(*) from commercial_vertical_memberships where vertical_key='AUTOMOTIVE' and monitor)<>1 then raise exception 'Capacity drift'; end if;
 if not exists(select 1 from commercial_cohort_changes where added_source='PRODUCT:MLB999888002' and evidence->>'advantage'='25') then raise exception 'Audit missing'; end if;
 if not exists(select 1 from commercial_observations where source_key='PRODUCT:MLB999888002') then raise exception 'Admission price missing'; end if;
 if exists(select 1 from commercial_verticals where vertical_key='HOME' and enabled) then raise exception 'HOME activated'; end if;
end $$;
