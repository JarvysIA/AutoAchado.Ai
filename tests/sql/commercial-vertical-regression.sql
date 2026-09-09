-- Execute inside BEGIN / ROLLBACK, optionally with the unapplied migration first.
do $$
declare before_prices bigint; source text; identity text; result jsonb;
begin
 select count(*) into before_prices from commercial_observations;
 if (select count(*) from commercial_verticals)<>10 or (select sum(monitor_capacity) from commercial_verticals)<>1000 then
  raise exception 'Missing reserved capacity'; end if;
 if (select count(*) from commercial_verticals where enabled)<>1 then raise exception 'Premature activation'; end if;
 if exists(select 1 from commercial_watchlist w where not exists(select 1 from commercial_vertical_memberships m
  where m.vertical_key='AUTOMOTIVE' and m.identity_key=w.identity_key)) then raise exception 'Backfill lost identity'; end if;
 if exists(select 1 from commercial_feedback f where not exists(select 1 from commercial_vertical_feedback v
  where v.vertical_key='AUTOMOTIVE' and v.identity_key=f.identity_key and v.action=f.action)) then raise exception 'Feedback lost'; end if;
 select source_key,identity_key into source,identity from commercial_watchlist where monitor limit 1;
 if source is null then raise exception 'Regression requires one existing active watch'; end if;
 begin
  insert into commercial_vertical_memberships(vertical_key,identity_key,source_key,monitor) values('HOME',identity,source,true);
  raise exception 'Disabled vertical accepted monitoring';
 exception when raise_exception then
  if sqlerrm<>'COMMERCIAL_VERTICAL_CAPACITY_OR_DISABLED' then raise; end if;
 end;
 update commercial_verticals set enabled=true,executor_ready=true,rules_version='TEST_ONLY',monitor_capacity=1 where vertical_key='HOME';
 insert into commercial_vertical_memberships(vertical_key,identity_key,source_key,monitor) values('HOME',identity,source,true);
 insert into commercial_vertical_feedback values('HOME',identity,'INTERESTED',now());
 result:=save_automotive_commercial_feedback(source,'NOT_RELEVANT');
 if not (select monitor from commercial_vertical_memberships where vertical_key='HOME' and identity_key=identity) then raise exception 'Cross-vertical deactivation'; end if;
 if (select action from commercial_vertical_feedback where vertical_key='HOME' and identity_key=identity)<>'INTERESTED' then raise exception 'Cross-vertical feedback'; end if;
 result:=save_automotive_commercial_feedback(source,'RESET');
 if not (result->>'monitoring')::boolean then raise exception 'Resume failed'; end if;
 begin
  insert into commercial_vertical_memberships(vertical_key,identity_key,source_key,monitor) values('HOME','fixture:excess',source,true);
  raise exception 'Capacity was exceeded';
 exception when raise_exception then
  if sqlerrm<>'COMMERCIAL_VERTICAL_CAPACITY_OR_DISABLED' then raise; end if;
 end;
 update commercial_vertical_memberships set monitor=true where vertical_key='HOME' and identity_key=identity;
 if (select count(*) from commercial_observations)<>before_prices then raise exception 'Prices were modified'; end if;
 if has_table_privilege('anon','commercial_vertical_feedback','SELECT') or
  has_function_privilege('authenticated','save_automotive_commercial_feedback(text,text)','EXECUTE') then raise exception 'Public privilege leak'; end if;
end $$;
