import { spawn, spawnSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const supabaseCli = resolve(root, "node_modules/supabase/dist/supabase.js");
const tsxCli = resolve(root, "node_modules/tsx/dist/cli.mjs");
const registryCli = resolve(root, "scripts/commerce-registry-sync.ts");
const ensure: (condition: unknown, marker: string) => asserts condition = (condition, marker) => {
  if (!condition) throw new Error(marker);
};

function command(executable: string, args: readonly string[]) {
  return spawnSync(executable, [...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function localEnvironment(): { url: string; secret: string } {
  const result = command(process.execPath, [supabaseCli, "status", "-o", "env"]);
  ensure(result.status === 0, "LOCAL_SUPABASE_STATUS_FAILED");
  const values: Record<string, string> = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]!] = match[2]!.replace(/^"|"$/g, "");
  }
  const url = new URL(values.API_URL ?? "");
  ensure(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname), "LOCAL_ONLY_GUARD_FAILED");
  const secret = values.SECRET_KEY ?? values.SERVICE_ROLE_KEY;
  ensure(secret, "LOCAL_CREDENTIALS_MISSING");
  return { url: url.toString().replace(/\/$/, ""), secret };
}

function runCli(args: readonly string[]): any {
  const result = command(process.execPath, [tsxCli, registryCli, ...args, "--json"]);
  ensure(result.status === 0, `REGISTRY_CLI_FAILED:${result.stderr.trim().slice(0, 120)}`);
  ensure(!/sb_secret_|SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|Authorization|apikey|Bearer/.test(result.stdout + result.stderr),
    "SECRET_OUTPUT_DETECTED");
  return JSON.parse(result.stdout);
}

function runPsql(sql: string): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const child = spawn("docker", [
      "exec", "supabase_db_AutoAchado.AI", "psql", "-U", "postgres", "-d", "postgres",
      "-AtX", "-v", "ON_ERROR_STOP=1", "-c", sql,
    ], { windowsHide: true });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", () => undefined);
    child.on("error", () => reject(new Error("LOCAL_PSQL_FAILED")));
    child.on("close", (code) => code === 0
      ? resolveResult(stdout.trim())
      : reject(new Error("LOCAL_PSQL_FAILED")));
  });
}

async function counts(client: SupabaseClient) {
  const count = async (table: string) => {
    const result = await client.from(table).select("*", { count: "exact", head: true });
    ensure(!result.error, "LOCAL_COUNT_FAILED");
    return result.count ?? -1;
  };
  return {
    categories: await count("marketplace_categories"),
    mappings: await count("vertical_category_mappings"),
  };
}

async function timestampHash(): Promise<string> {
  return runPsql("select md5(coalesce((select string_agg(external_category_id||first_seen_at::text||last_seen_at::text||source_checked_at::text||updated_at::text,'' order by external_category_id) from public.marketplace_categories where marketplace_key='MERCADO_LIVRE' and site_id='MLB'),'')||coalesce((select string_agg(c.external_category_id||m.decided_at::text||m.updated_at::text,'' order by c.external_category_id) from public.vertical_category_mappings m join public.marketplace_categories c using(marketplace_category_id) where c.marketplace_key='MERCADO_LIVRE' and c.site_id='MLB'),''))");
}

const reset = command(process.execPath, [supabaseCli, "db", "reset", "--local"]);
ensure(reset.status === 0, "LOCAL_DB_RESET_FAILED");
const local = localEnvironment();
const service = createClient(local.url, local.secret, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const pre = await counts(service);
ensure(pre.categories === 0 && pre.mappings === 0, "LOCAL_DB_NOT_FRESH");

const firstDry = runCli(["--first-sync"]);
ensure(firstDry.safety.previewStatus === "READY", "FIRST_DRY_RUN_BLOCKED");
ensure(firstDry.desired.categoryCount === 3_269 && firstDry.desired.mappingCount === 3_269, "FIRST_DESIRED_MISMATCH");
ensure(firstDry.changes.categories.insert === 3_269 && firstDry.changes.mappings.insert === 3_269,
  "FIRST_DIFF_MISMATCH");
ensure(firstDry.payload.bytes === 1_603_538, "FIRST_PAYLOAD_MISMATCH");

const first = runCli(["--first-sync", "--apply", "--confirm", firstDry.fingerprint.token]);
ensure(first.outcome === "APPLIED_AND_VERIFIED", "FIRST_APPLY_NOT_VERIFIED");
ensure(first.rpc.callCount === 1 && first.rpc.retryCount === 0, "FIRST_RPC_POLICY_FAILED");
ensure(first.rpc.result.categories.inserted === 3_269 && first.rpc.result.mappings.inserted === 3_269,
  "FIRST_RPC_COUNTS_FAILED");
ensure(first.post.converged === true, "FIRST_POST_NOT_CONVERGED");
const postFirst = await counts(service);
ensure(postFirst.categories === 3_269 && postFirst.mappings === 3_269, "FIRST_POST_COUNTS_FAILED");

const integrity = await runPsql("select (select count(*) from public.marketplace_categories c where c.parent_marketplace_category_id is not null and not exists(select 1 from public.marketplace_categories p where p.marketplace_category_id=c.parent_marketplace_category_id))||'|'||(select count(*) from public.vertical_category_mappings m where not exists(select 1 from public.marketplace_categories c where c.marketplace_category_id=m.marketplace_category_id))||'|'||(select count(*) from (select marketplace_key,site_id,external_category_id,count(*) from public.marketplace_categories group by 1,2,3 having count(*)>1)x)||'|'||(select count(*) from (select vertical_key,marketplace_category_id,count(*) from public.vertical_category_mappings group by 1,2 having count(*)>1)x)||'|'||(select count(*)-count(distinct marketplace_category_id) from public.marketplace_categories where marketplace_key='MERCADO_LIVRE' and site_id='MLB')||'|'||(select count(*) from public.vertical_category_mappings where active)||'|'||(select count(*) from public.vertical_category_mappings where not ((scope_status='ALLOWED' and priority_tier in('A','B','C')) or (scope_status in('REVIEW','EXCLUDED','UNKNOWN') and priority_tier is null)))");
ensure(integrity === "0|0|0|0|0|3269|0", "STRUCTURAL_INTEGRITY_FAILED");

const timestampsBeforeReplay = await timestampHash();
const replayDry = runCli([]);
const replay = runCli(["--apply", "--confirm", replayDry.fingerprint.token]);
ensure(replay.outcome === "APPLIED_AND_VERIFIED", "REPLAY_NOT_VERIFIED");
ensure(replay.rpc.callCount === 1 && replay.rpc.retryCount === 0, "REPLAY_RPC_POLICY_FAILED");
ensure(replay.rpc.result.categories.unchanged === 3_269 && replay.rpc.result.mappings.unchanged === 3_269,
  "REPLAY_RESULT_FAILED");
ensure(await timestampHash() === timestampsBeforeReplay, "REPLAY_TIMESTAMP_CHURN");

const manualId = await runPsql("select c.external_category_id from public.vertical_category_mappings m join public.marketplace_categories c using(marketplace_category_id) where m.priority_tier='A' and c.is_leaf order by c.external_category_id limit 1");
ensure(manualId, "MANUAL_CANDIDATE_MISSING");
await runPsql(`update public.vertical_category_mappings m set scope_status='REVIEW',priority_tier=null,manual_override=true,decision_source='MANUAL',decision_reason='cli-c4b-e2e' from public.marketplace_categories c where c.marketplace_category_id=m.marketplace_category_id and c.external_category_id='${manualId}' and c.site_id='MLB'`);
const manualBefore = await runPsql(`select scope_status||'|'||coalesce(priority_tier,'NULL')||'|'||manual_override::text||'|'||decision_source||'|'||decision_reason from public.vertical_category_mappings m join public.marketplace_categories c using(marketplace_category_id) where c.external_category_id='${manualId}' and c.site_id='MLB'`);
const manualDry = runCli([]);
ensure(manualDry.changes.mappings.manual_override_skipped === 1, "MANUAL_PREVIEW_MISSING");
const manual = runCli(["--apply", "--confirm", manualDry.fingerprint.token]);
ensure(manual.outcome === "APPLIED_AND_VERIFIED", "MANUAL_APPLY_NOT_VERIFIED");
ensure(manual.rpc.callCount === 1 && manual.rpc.retryCount === 0, "MANUAL_RPC_POLICY_FAILED");
ensure(manual.rpc.result.mappings.manualOverrideSkipped === 1, "MANUAL_SKIP_MISSING");
const manualAfter = await runPsql(`select scope_status||'|'||coalesce(priority_tier,'NULL')||'|'||manual_override::text||'|'||decision_source||'|'||decision_reason from public.vertical_category_mappings m join public.marketplace_categories c using(marketplace_category_id) where c.external_category_id='${manualId}' and c.site_id='MLB'`);
ensure(manualAfter === manualBefore, "MANUAL_FIELDS_CHANGED");

const lockDry = runCli([]);
const hold = runPsql("begin;select pg_advisory_xact_lock(hashtextextended('autoachado:commerce-registry:MERCADO_LIVRE:MLB',0));select pg_sleep(15);rollback");
await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
const lockProcess = command(process.execPath, [tsxCli, registryCli, "--apply", "--confirm", lockDry.fingerprint.token, "--json"]);
ensure(lockProcess.status === 1, "LOCK_EXIT_CODE_FAILED");
const locked = JSON.parse(lockProcess.stdout);
ensure(locked.outcome === "LOCKED", "LOCK_OUTCOME_FAILED");
ensure(locked.rpc.callCount === 1 && locked.rpc.retryCount === 0, "LOCK_RPC_POLICY_FAILED");
ensure(locked.post.readAttempted === true, "LOCK_POST_READ_MISSING");
await hold;

process.stdout.write(`${JSON.stringify({
  pre,
  firstDry: {
    token: firstDry.fingerprint.token,
    fingerprint: firstDry.fingerprint.value,
    payloadBytes: firstDry.payload.bytes,
  },
  first: { rpc: first.rpc, post: first.post, performance: first.performance },
  postFirst,
  integrity,
  replay: { rpc: replay.rpc, post: replay.post, timestampHashUnchanged: true },
  manual: { externalCategoryId: manualId, before: manualBefore, after: manualAfter,
    rpc: manual.rpc, post: manual.post },
  lock: { rpc: locked.rpc, post: locked.post, outcome: locked.outcome },
  remoteCalls: 0,
  mercadoLivreCalls: 0,
  oauthCalls: 0,
})}\n`);
