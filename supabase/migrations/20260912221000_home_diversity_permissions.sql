-- Generated-column evaluation runs with the writer's role.
revoke all on function public.home_diversity_key(text,text) from public,anon,authenticated;
grant execute on function public.home_diversity_key(text,text) to service_role;
