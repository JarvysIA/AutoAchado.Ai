begin;
set local role service_role;
update public.home_candidates set monitor=false,assessment='{}';
insert into public.home_candidates(source_key,product_id,identity_key,category_id,family,preview,assessment,score)
select 'PRODUCT:MLB999888'||g,'MLB999888'||g,'diversity-test-'||g,'test-cat-'||(g%40),'test-family-'||(g%8),jsonb_build_object('title','Test','priceCheckedAt',now()),'{"eligible":true}',100-(g%4) from generate_series(1,160) g;
do $$ declare n integer; auto_before integer; begin
 select count(*) into auto_before from public.commercial_watchlist where monitor;
 perform public.renew_home_candidates();
 if (select count(*) from public.home_candidates where monitor)<>100 then raise exception 'CAPACITY';end if;
 if exists(select 1 from public.home_candidates where monitor group by diversity_key having count(*)>3) then raise exception 'TYPE_CAP';end if;
 if exists(select 1 from public.home_candidates where monitor group by family having count(*)>25) then raise exception 'FAMILY_CAP';end if;
 if public.home_diversity_key('a','Mop Spray')<>public.home_diversity_key('b','Esfregão giratório') then raise exception 'CROSS_CATEGORY';end if;
 update public.home_candidates set monitor=false;
 update public.home_candidates set monitor=true,category_id='concentrated' where identity_key like 'diversity-test-%' and substring(identity_key from 16)::integer<=10;
 update public.home_candidates set feedback='INTERESTED' where identity_key='diversity-test-1';
 perform public.rebalance_home_candidates(100);
 if not (select monitor from public.home_candidates where identity_key='diversity-test-1') then raise exception 'INTERESTED_REMOVED';end if;
 if (select count(*) from public.home_candidates where monitor and diversity_key='concentrated')>3 then raise exception 'REBALANCE';end if;
 if (select count(*) from public.commercial_watchlist where monitor)<>auto_before then raise exception 'AUTO_CHANGED';end if;
end $$;
rollback;
