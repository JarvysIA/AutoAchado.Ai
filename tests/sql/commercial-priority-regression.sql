BEGIN;
DO $$
DECLARE candidate record;
BEGIN
 FOR candidate IN SELECT source_key FROM public.commercial_watchlist WHERE monitor ORDER BY source_key LIMIT 8 LOOP
  PERFORM public.request_commercial_priority(candidate.source_key,'NEW_QUALIFIED_CANDIDATE');
 END LOOP;
 IF (SELECT count(*) FROM public.commercial_watchlist WHERE monitor AND priority_until>now())>6 THEN
  RAISE EXCEPTION 'Priority capacity exceeded';
 END IF;
 IF has_function_privilege('anon','public.dispatch_commercial_priority()','EXECUTE')
  OR has_function_privilege('anon','public.request_commercial_priority(text,text)','EXECUTE')
  OR has_table_privilege('anon','public.commercial_candidate_queue','SELECT') THEN
  RAISE EXCEPTION 'Public commercial access enabled';
 END IF;
END $$;
ROLLBACK;
