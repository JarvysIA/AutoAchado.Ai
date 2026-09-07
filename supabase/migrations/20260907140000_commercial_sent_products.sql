-- Manual confirmation only: copying text or creating a link never writes here.
create table public.commercial_sent_products (
 vertical_key text not null references public.commercial_verticals,
 identity_key text not null,
 sent_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(vertical_key,identity_key)
);
-- Preserve existing explicit "Divulguei" confirmations without inventing dates.
insert into public.commercial_sent_products(vertical_key,identity_key,sent_at,updated_at)
 select vertical_key,identity_key,updated_at,updated_at from public.commercial_vertical_feedback where action='SHARED';
alter table public.commercial_sent_products enable row level security;
revoke all on public.commercial_sent_products from public,anon,authenticated;
grant select,insert,update on public.commercial_sent_products to service_role;
