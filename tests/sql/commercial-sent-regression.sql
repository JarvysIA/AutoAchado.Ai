-- Run in an enclosing transaction with ROLLBACK.
do $$
declare identity text; old_feedback bigint;
begin
 select identity_key into identity from commercial_watchlist limit 1;
 select count(*) into old_feedback from commercial_vertical_feedback;
 insert into commercial_sent_products values('AUTOMOTIVE',identity,now(),now())
 on conflict(vertical_key,identity_key) do update set sent_at=excluded.sent_at;
 insert into commercial_sent_products values('HOME',identity,now(),now())
 on conflict(vertical_key,identity_key) do update set sent_at=excluded.sent_at;
 update commercial_sent_products set sent_at=null where vertical_key='AUTOMOTIVE' and identity_key=identity;
 if not exists(select 1 from commercial_sent_products where vertical_key='HOME' and identity_key=identity and sent_at is not null) then
  raise exception 'Undo affected another vertical'; end if;
 if (select count(*) from commercial_vertical_feedback)<>old_feedback then raise exception 'Sending changed feedback'; end if;
 if has_table_privilege('anon','commercial_sent_products','SELECT') or has_table_privilege('authenticated','commercial_sent_products','UPDATE') then
  raise exception 'Public sent privilege leak'; end if;
end $$;
