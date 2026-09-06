create table public.discovery_category_progress (
 category_id uuid primary key references public.marketplace_categories(marketplace_category_id),
 last_attempt_at timestamptz not null,
 next_attempt_at timestamptz not null,
 status text not null,
 error_code text,
 http_status integer,
 failures integer not null default 0
);
create table public.commercial_rank_observations (
 identity_key text not null,
 category_id text not null,
 observed_at timestamptz not null,
 position integer not null check(position between 1 and 20),
 primary key(identity_key,category_id,observed_at)
);
create index commercial_rank_identity_time on public.commercial_rank_observations(identity_key,observed_at desc);
-- Preserve the known category of earlier collector observations.
insert into public.commercial_rank_observations
select o.identity_key,w.category_id,o.observed_at,min(o.position)
from public.commercial_observations o join public.commercial_watchlist w using(source_key)
where o.position is not null group by o.identity_key,w.category_id,o.observed_at
on conflict do nothing;
alter table public.discovery_category_progress enable row level security;
alter table public.commercial_rank_observations enable row level security;
revoke all on public.discovery_category_progress,public.commercial_rank_observations from public,anon,authenticated;
grant select,insert,update on public.discovery_category_progress,public.commercial_rank_observations to service_role;

create function public.commercial_candidate_categories(keys text[]) returns table(source_key text,category_id text)
language sql security invoker set search_path=public as $$
 select distinct h.type||':'||h.product_id,c.external_category_id
 from highlight_snapshots h join marketplace_categories c using(marketplace_category_id)
 where h.type||':'||h.product_id=any(keys) and h.observed_at>=now()-interval '14 days';
$$;
revoke all on function public.commercial_candidate_categories(text[]) from public,anon,authenticated;
grant execute on function public.commercial_candidate_categories(text[]) to service_role;
