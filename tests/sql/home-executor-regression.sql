begin;
do $$
declare before_auto integer; n integer; run_id uuid;
begin
 select count(*) into before_auto from public.commercial_watchlist where monitor;
 update public.commercial_verticals set executor_ready=true,enabled=true,rules_version='HOME_EDITORIAL_V1' where vertical_key='HOME';
 insert into public.home_candidates(source_key,product_id,identity_key,category_id,family,preview,assessment,score)
 select 'PRODUCT:MLB999999'||g,'MLB999999'||g,'test-home-'||g,'test-category-'||(g%40),'family-'||(g%5),
 jsonb_build_object('priceCheckedAt',now()),'{"eligible":true}',100 from generate_series(1,105) g;
 perform public.renew_home_candidates();
 select count(*) into n from public.home_candidates where monitor;
 if n<>100 then raise exception 'Expected 100 monitored, got %',n;end if;
 if exists(select 1 from public.home_candidates where monitor group by family having count(*)>25) then raise exception 'Family limit exceeded';end if;
 if (select count(*) from public.commercial_watchlist where monitor)<>before_auto then raise exception 'Automotive changed';end if;
 run_id:=public.begin_home_run('HISTORY');
 if run_id is null then raise exception 'First run not acquired';end if;
 if public.begin_home_run('DISCOVERY') is not null then raise exception 'Concurrent run allowed';end if;
 begin
  update public.home_candidates set monitor=true where source_key=(select source_key from public.home_candidates where not monitor limit 1);
  raise exception 'Capacity guard failed';
 exception when others then
  if sqlerrm<>'HOME_CAPACITY' then raise;end if;
 end;
end $$;
rollback;
