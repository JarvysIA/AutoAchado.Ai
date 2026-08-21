import { spawn } from "node:child_process";

const container = "supabase_db_AutoAchado.AI";
const testUser = 910000001;
const blockedUser = 910000002;
const independentUser = 910000003;

function runPsql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec", container, "psql", "-U", "postgres", "-d", "postgres",
      "-AtX", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], { windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", () => {});
    child.on("error", () => reject(new Error("LOCAL_PSQL_PROCESS_FAILED")));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error("LOCAL_PSQL_COMMAND_FAILED"));
      else resolve(stdout.trim());
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lockKey = (userId) => `pg_catalog.hashtextextended('autoachado:meli:' || ${userId}::text, 0)`;
const token = (label) => `pg_catalog.concat('TEST_', 'REFRESH_', 'TOKEN_CONCURRENT_', '${label}')`;
const initialize = (userId, label) =>
  `select outcome from public.initialize_meli_oauth_connection(${userId}, ${token(label)})`;

async function holdIdentityLock(userId, seconds) {
  return runPsql(
    `begin; select pg_catalog.pg_advisory_xact_lock(${lockKey(userId)}); select pg_catalog.pg_sleep(${seconds}); commit`,
  );
}

async function cleanup(userIds) {
  await runPsql(`
    with removed as (
      delete from private.meli_oauth_connections
       where external_user_id in (${userIds.join(",")})
       returning vault_secret_id
    )
    delete from vault.secrets s using removed r where s.id = r.vault_secret_id
  `);
}

function expectOutcomes(values, expected, code) {
  const actual = [...values].sort().join(",");
  if (actual !== [...expected].sort().join(",")) throw new Error(code);
}

try {
  await cleanup([testUser, blockedUser, independentUser]);

  const initialGate = holdIdentityLock(testUser, 1);
  await delay(250);
  const initialResults = await Promise.all([
    runPsql(initialize(testUser, "INITIAL_A")),
    runPsql(initialize(testUser, "INITIAL_B")),
  ]);
  await initialGate;
  expectOutcomes(initialResults, ["INITIALIZED", "ALREADY_INITIALIZED"], "INITIAL_CONCURRENCY_FAILED");

  await runPsql(`
    update private.meli_oauth_connections
       set status = 'REAUTH_REQUIRED', reauth_required = true, last_error_code = 'INVALID_GRANT'
     where external_user_id = ${testUser}
  `);
  const reauthGate = holdIdentityLock(testUser, 1);
  await delay(250);
  const reauthResults = await Promise.all([
    runPsql(initialize(testUser, "REAUTH_A")),
    runPsql(initialize(testUser, "REAUTH_B")),
  ]);
  await reauthGate;
  expectOutcomes(reauthResults, ["REAUTHORIZED", "ALREADY_INITIALIZED"], "REAUTH_CONCURRENCY_FAILED");

  const version = await runPsql(
    `select token_version from private.meli_oauth_connections where external_user_id = ${testUser}`,
  );
  if (version !== "2") throw new Error("REAUTH_VERSION_FAILED");

  const claimOutcome = await runPsql(`select outcome from public.claim_meli_refresh(${testUser})`);
  if (claimOutcome !== "CLAIMED") throw new Error("REFRESH_SETUP_FAILED");
  const leaseBefore = await runPsql(
    `select lease_id::text || ':' || token_version::text from private.meli_oauth_connections where external_user_id = ${testUser}`,
  );
  const duringRefresh = await runPsql(initialize(testUser, "DURING_REFRESH"));
  const leaseAfter = await runPsql(
    `select lease_id::text || ':' || token_version::text from private.meli_oauth_connections where external_user_id = ${testUser}`,
  );
  if (duringRefresh !== "LOCK_BUSY" || leaseBefore !== leaseAfter) throw new Error("REFRESHING_ISOLATION_FAILED");

  const independentGate = holdIdentityLock(blockedUser, 2);
  await delay(250);
  const blocked = runPsql(initialize(blockedUser, "BLOCKED_IDENTITY"));
  const independentStarted = Date.now();
  const independent = await runPsql(initialize(independentUser, "INDEPENDENT_IDENTITY"));
  const independentDuration = Date.now() - independentStarted;
  await Promise.all([independentGate, blocked]);
  if (independent !== "INITIALIZED" || independentDuration >= 1500) {
    throw new Error("IDENTITY_LOCK_SCOPE_FAILED");
  }

  process.stdout.write("OAUTH_INITIALIZE_CONCURRENCY_OK\n");
} finally {
  await cleanup([testUser, blockedUser, independentUser]).catch(() => {});
}
