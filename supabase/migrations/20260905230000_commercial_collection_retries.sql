alter table public.commercial_watchlist add column unavailable_attempts integer not null default 0 check (unavailable_attempts >= 0);
