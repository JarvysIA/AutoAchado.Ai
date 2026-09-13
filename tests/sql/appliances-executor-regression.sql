begin;
set local role service_role;
do $$ declare auto_before integer; home_before integer; run_id uuid; begin
 select count(*) into auto_before from commercial_watchlist where monitor;
 select count(*) into home_before from home_candidates where monitor;
 begin
  perform begin_appliances_run('HISTORY');raise exception 'DISABLED_NOT_ENFORCED';
 exception when others then if sqlerrm<>'APPLIANCES_DISABLED' then raise;end if;end;
 update commercial_verticals set enabled=true,executor_ready=true,rules_version='APPLIANCES_V1' where vertical_key='APPLIANCES';
 insert into appliances_candidates(source_key,product_id,identity_key,category_id,family,preview,assessment,score)
 select 'PRODUCT:MLB999777'||g,'MLB999777'||g,'test-appliances-'||g,'cat-'||(g%40),'family-'||(g%8),jsonb_build_object('priceCheckedAt',now(),'appliance_specs',jsonb_build_object('brand','test','model','model-'||(g%80))),'{"eligible":true}',100-(g%4) from generate_series(1,160) g;
 perform renew_appliances_candidates();
 if (select count(*) from appliances_candidates where monitor)<>100 then raise exception 'CAPACITY';end if;
 if exists(select 1 from appliances_candidates where monitor group by diversity_key having count(*)>4) then raise exception 'TYPE_LIMIT';end if;
 if exists(select 1 from appliances_candidates where monitor group by model_key having count(*)>2) then raise exception 'MODEL_LIMIT';end if;
 if exists(select 1 from appliances_candidates where monitor group by family having count(*)>25) then raise exception 'FAMILY_LIMIT';end if;
 run_id:=begin_appliances_run('HISTORY');if run_id is null then raise exception 'NO_RUN';end if;
 if begin_appliances_run('DISCOVERY') is not null then raise exception 'CONCURRENT_RUN';end if;
 if (select count(*) from commercial_watchlist where monitor)<>auto_before or (select count(*) from home_candidates where monitor)<>home_before then raise exception 'OTHER_VERTICAL_CHANGED';end if;
end $$;
rollback;
