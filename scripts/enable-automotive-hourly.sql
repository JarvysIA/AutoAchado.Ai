-- Apply only after the daily-coverage migration and corresponding deployment are verified.
-- No secret in job text; dispatch reads the existing protected Vault credential.
select cron.schedule('autoachado-commercial-history','15 * * * *','select public.dispatch_commercial_history();');
