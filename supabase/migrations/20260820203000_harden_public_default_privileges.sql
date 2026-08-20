-- Future objects in the exposed public schema are deny-by-default.
-- Every migration that creates an API-facing object must grant only the
-- privileges that object explicitly requires.

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all privileges on functions from anon, authenticated, service_role;

-- PostgreSQL's built-in EXECUTE grant to PUBLIC is a global default. A
-- schema-scoped revoke alone cannot override it, so this global revoke is
-- required for functions subsequently owned by postgres.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Also remove any schema-scoped PUBLIC grant that may have been configured by
-- the hosted platform for the exposed public schema.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
