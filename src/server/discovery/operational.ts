import {AUTOMOTIVE_MLB_DISCOVERY_TOOLS} from '../../commerce/discovery/automotive-tools.js';
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { planDiscoveryRun } from "../../commerce/discovery/planner.js";
import { createSupabaseServerClient } from "../supabase/client.js";
import { loadSupabaseServerConfig } from "../supabase/config.js";
import { createMeliOAuthRuntimeOperationRotationService } from "../oauth/factory.js";
import { MeliClient } from "../../meli/client.js";
import { createMeliHighlightsDiscoveryAdapter } from "../../meli/highlights-discovery-adapter.js";
import { discoveryRegistryReadClientFromSupabase, loadDiscoveryEligibleCategories } from "./registry-reader.js";
import { createDiscoveryPersistenceRepository, discoveryPersistenceClientFromSupabase } from "./persistence-repository.js";
import { runDiscoveryOrchestrator } from "./orchestrator.js";
import {dueCategories,categoryRetry,type CategoryProgress} from './coverage.js';
import {DiscoveryError} from '../../commerce/discovery/types.js';

export class LiveSmokeDiscoveryAdapter {
  constructor(readonly client: SupabaseClient) {}
  async latestSnapshots() {
    const { data, count, error } = await this.client.schema("public").from("highlight_snapshots")
      .select("product_id,marketplace_category_id,position,type,priority_tier,observed_at", { count: "exact" })
      .order("observed_at", { ascending: false }).order("product_id").limit(100);
    if (error) throw new Error("SNAPSHOTS_READ_FAILED");
    return { snapshots: data ?? [], total: count ?? 0, syncedAt: new Date().toISOString() };
  }
}

export class LiveSmokeDiscoveryRunner {
  constructor(readonly adapter: LiveSmokeDiscoveryAdapter) {}
  async run(mode: "SMOKE" | "FULL_SWEEP") {
    const client = this.adapter.client;
    const config = { ...AUTOMOTIVE_MLB_DISCOVERY_TOOLS, smokeCategoriesPerTier: 1 };
    const categories = await loadDiscoveryEligibleCategories({ client: discoveryRegistryReadClientFromSupabase(client),
      marketplaceKey: config.marketplaceKey, siteId: config.siteId, verticalKey: config.verticalKey });
    const initialPlan = planDiscoveryRun(categories, mode, config);
    const progress=await client.from('discovery_category_progress').select('*');
    if(progress.error) throw new Error('DISCOVERY_COVERAGE_UNAVAILABLE');
    const previous=(progress.data??[]) as CategoryProgress[];
    const plan={...initialPlan,selectedCategories:mode==='FULL_SWEEP'?dueCategories(initialPlan.selectedCategories,previous):initialPlan.selectedCategories};
    if(!plan.selectedCategories.length) return {status:'UP_TO_DATE',selectedCategories:0,persisted:0};
    const rotation = await createMeliOAuthRuntimeOperationRotationService(client)
      .rotateMeliAccessTokenForRuntimeOperation("dashboard-" + randomUUID());
    if (rotation.outcome !== "ROTATED") throw new Error("DISCOVERY_OAUTH_UNAVAILABLE");
    const repository = createDiscoveryPersistenceRepository(discoveryPersistenceClientFromSupabase(client));
    const now = new Date().toISOString();
    const run = await repository.beginDiscoveryRun({ plan, scheduledBucket: now, startedAt: now, shardKey: "dashboard-" + randomUUID() });
    const statuses=new Map<string,number>();
    const adapter=createMeliHighlightsDiscoveryAdapter({client: new MeliClient({ accessToken: rotation.accessToken, timeoutMs: 10000 }), nowIso: () => new Date().toISOString()});
    const result = await runDiscoveryOrchestrator({ plan, budgetMs: 180000, adapter:{discoverCategory:async category=>{
      try{return await adapter.discoverCategory(category);}catch(error){
        if(error instanceof DiscoveryError && typeof error.details.status==='number') statuses.set(category.marketplaceCategoryId,error.details.status);
        throw error;
      }
    }} });
    const persisted = await repository.persistDiscoveryOccurrences(run.runId, result.occurrences);
    const updates=result.outcomes.filter(o=>o.status!=='NOT_ATTEMPTED').map(o=>{
      const failures=o.status==='FAILED'?(previous.find(p=>p.category_id===o.category.marketplaceCategoryId)?.failures??0)+1:0;
      const httpStatus=statuses.get(o.category.marketplaceCategoryId)??null;
      return {category_id:o.category.marketplaceCategoryId,last_attempt_at:new Date().toISOString(),
        next_attempt_at:categoryRetry(o.status,httpStatus,failures),status:httpStatus===404?'NO_RANKING':o.status,
        error_code:o.errorCode,http_status:httpStatus,failures};
    });
    if(updates.length && (await client.from('discovery_category_progress').upsert(updates)).error) throw new Error('DISCOVERY_COVERAGE_WRITE_FAILED');
    const status = result.fatalErrorCode === "DISCOVERY_TIME_BUDGET_EXCEEDED" ? "PARTIAL" : result.fatalErrorCode ? "FAILED" : result.metrics.failedCategories > 0 ? "PARTIAL" : "COMPLETED";
    await repository.completeDiscoveryRun({ runId: run.runId, result, status, finishedAt: new Date().toISOString() });
    return { runId: run.runId, status, persisted, selectedCategories: plan.selectedCategories.length };
  }
}

export function createOperationalDiscoveryAdapter() {
  const config = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { url: process.env.SUPABASE_URL ?? "", secretKey: process.env.SUPABASE_SERVICE_ROLE_KEY }
    : loadSupabaseServerConfig();
  return new LiveSmokeDiscoveryAdapter(createSupabaseServerClient(config, { timeoutMs: 10000 }));
}

export async function runConfiguredDiscoveryLiveSmoke(mode: "SMOKE" | "FULL_SWEEP" = "SMOKE") {
  return new LiveSmokeDiscoveryRunner(createOperationalDiscoveryAdapter()).run(mode);
}
