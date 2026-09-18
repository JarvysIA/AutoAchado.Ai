begin;
-- The OAuth history lives in the private schema, which service_role cannot reach, so the
-- trigger is exercised as the owner and only the alert table is checked as service_role.
do $$ declare conn uuid; events_before integer; begin
 select count(*) into events_before from private.meli_oauth_events;
 insert into private.meli_oauth_connections(external_user_id,status,reauth_required,consecutive_failures)
 values(999000111,'ACTIVE',false,0) returning connection_id into conn;
 if (select count(*) from private.meli_oauth_events)<>events_before then raise exception 'INSERT_MUST_NOT_EMIT';end if;
 update private.meli_oauth_connections set token_version=token_version+1 where connection_id=conn;
 if (select count(*) from private.meli_oauth_events)<>events_before then raise exception 'TOKEN_VERSION_MUST_NOT_EMIT';end if;
 update private.meli_oauth_connections set status='REAUTH_REQUIRED',reauth_required=true,last_error_code='PREVIEW_AUTH_UNAVAILABLE',consecutive_failures=3 where connection_id=conn;
 if (select count(*) from private.meli_oauth_events)<>events_before+1 then raise exception 'STATUS_CHANGE_MUST_EMIT';end if;
 if not exists(select 1 from private.meli_oauth_events where from_status='ACTIVE' and to_status='REAUTH_REQUIRED' and reauth_required and error_code='PREVIEW_AUTH_UNAVAILABLE' and consecutive_failures=3) then raise exception 'EVENT_CONTENT';end if;
 update private.meli_oauth_connections set consecutive_failures=4 where connection_id=conn;
 if (select count(*) from private.meli_oauth_events)<>events_before+2 then raise exception 'FAILURE_COUNT_MUST_EMIT';end if;
 if (select count(*) from information_schema.columns where table_schema='private' and table_name='meli_oauth_events' and column_name in ('vault_secret_id','lease_id','lease_expires_at','lease_acquired_at'))<>0 then raise exception 'EVENT_LEAKS_TOKEN_COLUMNS';end if;
 if (select count(*) from public.operational_meli_connection_status())<>1 then raise exception 'STATUS_FUNCTION_ROWS';end if;
end $$;

do $$ declare cols integer; begin
 select count(*) into cols from information_schema.columns
 where table_schema='public' and table_name='operational_alert_state';
 if cols<>6 then raise exception 'ALERT_STATE_SHAPE';end if;
 set local role service_role;
 insert into public.operational_alert_state(alert_key,active,first_detected_at,last_notified_at,detail)
 values('COLLECTION:HOME',true,now(),now(),'Coleta do Casa parada'),('MELI_AUTH',true,now(),now(),'Conexao perdida');
 begin
  insert into public.operational_alert_state(alert_key) values('lowercase:key');raise exception 'KEY_FORMAT_NOT_ENFORCED';
 exception when check_violation then null;end;
 update public.operational_alert_state set active=false,resolved_at=now() where alert_key='MELI_AUTH';
 if (select count(*) from public.operational_alert_state where active)<>1 then raise exception 'RESOLVE_FAILED';end if;
end $$;
rollback;
