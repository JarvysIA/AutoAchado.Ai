-- Enclose in a transaction and ROLLBACK.
do $$
declare row_key text; expected bigint; health jsonb;
begin
 select source_key into row_key from commercial_watchlist where monitor limit 1;
 update commercial_watchlist set last_evidence_attempt=now(),last_valid_price_at=null,next_evidence_check=now()-interval '1 hour',evidence_failures=1 where source_key=row_key;
 select count(*) into expected from commercial_watchlist where monitor and last_valid_price_at>=now()-interval '24 hours';
 health:=commercial_monitoring_health();
 if (health->>'fresh')::bigint<>expected then raise exception 'Attempt counted as valid evidence'; end if;
 if (health->>'retrying')::integer<1 then raise exception 'Retry missing'; end if;
 update commercial_watchlist set last_valid_price_at=now(),next_evidence_check=now()+interval '12 hours',evidence_failures=0 where source_key=row_key;
 if (commercial_monitoring_health()->>'fresh')::bigint<>expected+1 then raise exception 'Valid evidence not counted'; end if;
 if has_function_privilege('anon','dispatch_commercial_history()','EXECUTE') then raise exception 'Public cron dispatch'; end if;
end $$;
