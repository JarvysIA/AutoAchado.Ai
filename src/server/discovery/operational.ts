import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { AUTOMOTIVE_MLB_DISCOVERY_V1, planDiscoveryRun } from "../../commerce/discovery/planner.js";
import { createSupabaseServerClient } from "../supabase/client.js";
import { loadSupabaseServerConfig } from "../supabase/config.js";
import { createMeliOAuthRuntimeOperationRotationService } from "../oauth/factory.js";
import { MeliClient } from "../../meli/client.js";
import { createMeliHighlightsDiscoveryAdapter } from "../../meli/highlights-discovery-adapter.js";
import { discoveryRegistryReadClientFromSupabase, loadDiscoveryEligibleCategories } from "./registry-reader.js";
import { createDiscoveryPersistenceRepository, discoveryPersistenceClientFromSupabase } from "./persistence-repository.js";
import { runDiscoveryOrchestrator } from "./orchestrator.js";

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
    const config = { ...AUTOMOTIVE_MLB_DISCOVERY_V1, smokeCategoriesPerTier: 1 };
    const categories = await loadDiscoveryEligibleCategories({ client: discoveryRegistryReadClientFromSupabase(client),
      marketplaceKey: config.marketplaceKey, siteId: config.siteId, verticalKey: config.verticalKey });
    const plan = planDiscoveryRun(categories, mode, config);
    const rotation = await createMeliOAuthRuntimeOperationRotationService(client)
      .rotateMeliAccessTokenForRuntimeOperation("dashboard-" + randomUUID());
    if (rotation.outcome !== "ROTATED") throw new Error("DISCOVERY_OAUTH_UNAVAILABLE");
    const repository = createDiscoveryPersistenceRepository(discoveryPersistenceClientFromSupabase(client));
    const now = new Date().toISOString();
    const run = await repository.beginDiscoveryRun({ plan, scheduledBucket: now, startedAt: now, shardKey: "dashboard-" + randomUUID() });
    const result = await runDiscoveryOrchestrator({ plan, adapter: createMeliHighlightsDiscoveryAdapter({
      client: new MeliClient({ accessToken: rotation.accessToken, timeoutMs: 10000 }), nowIso: () => new Date().toISOString() }) });
    const persisted = await repository.persistDiscoveryOccurrences(run.runId, result.occurrences);
    const status = result.fatalErrorCode ? "FAILED" : result.metrics.failedCategories > 0 ? "PARTIAL" : "COMPLETED";
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
