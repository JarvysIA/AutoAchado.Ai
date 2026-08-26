import { describe, expect, it, vi } from "vitest";
import { runCommerceDiscoveryCli } from "../../scripts/commerce-discovery-run.js";
import {
  MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT,
  type DiscoveryEligibleCategory,
  type MarketplaceDiscoveryAdapter,
} from "../../src/commerce/discovery/types.js";

function categories(): DiscoveryEligibleCategory[] {
  return Array.from({ length: 144 }, (_, index) => ({
    marketplaceCategoryId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
    externalCategoryId: `MLB${10_000 + index}`, priorityTier: index < 28 ? "A" : "B",
    manualOverride: false, decisionSource: "AUTO", classificationVersion: "v1", sourceVersion: "v1",
    categoryConfigVersion: "v1", marketplaceConfigVersion: "v1", verticalConfigVersion: "v1",
  }));
}

function harness() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let calls = 0;
  const adapter: MarketplaceDiscoveryAdapter = { discoverCategory: async (category) => {
    calls += 1;
    return {
      contractVersion: MARKETPLACE_DISCOVERY_ADAPTER_CONTRACT, category, occurrences: [], rawHighlights: 0,
      productHighlights: 0, itemHighlights: 0, userProductHighlights: 0, unsupportedHighlights: 0,
      requestCount: 1, retryCount: 0, durationMs: 0,
    };
  } };
  const load = vi.fn(async () => categories());
  return { dependencies: { loadEligibleCategories: load, adapter, stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value) }, stdout, stderr, load, get calls() { return calls; } };
}

describe("commerce discovery CLI", () => {
  it.each([{ args: [] as string[] }, { args: ["--smoke"] }])("runs deterministic smoke for $args", async ({ args }) => {
    const value = harness();
    await expect(runCommerceDiscoveryCli(args, value.dependencies)).resolves.toBe(0);
    expect(value.calls).toBe(4);
    expect(value.stdout[0]).toContain("NO DISCOVERY DATA PERSISTED");
  });

  it("runs the full fake sweep", async () => {
    const value = harness();
    await expect(runCommerceDiscoveryCli(["--full-sweep"], value.dependencies)).resolves.toBe(0);
    expect(value.calls).toBe(144);
  });

  it("writes exactly one JSON object", async () => {
    const value = harness();
    await runCommerceDiscoveryCli(["--json"], value.dependencies);
    expect(value.stdout).toHaveLength(1);
    expect(JSON.parse(value.stdout[0]!)).toMatchObject({ contractVersion: "commerce-discovery-run/v1", mode: "SMOKE" });
  });

  it("blocks persist before registry or adapter access", async () => {
    const value = harness();
    await expect(runCommerceDiscoveryCli(["--persist"], value.dependencies)).resolves.toBe(1);
    expect(value.load).not.toHaveBeenCalled();
    expect(value.calls).toBe(0);
    expect(value.stderr.join(" ")).toContain("DISCOVERY_PERSISTENCE_NOT_ENABLED");
  });

  it("uses injected fakes without touching the live network", async () => {
    const fetchCanary = vi.fn(() => { throw new Error("LIVE_NETWORK_CANARY"); });
    vi.stubGlobal("fetch", fetchCanary);
    try {
      const value = harness();
      await expect(runCommerceDiscoveryCli([], value.dependencies)).resolves.toBe(0);
      expect(fetchCanary).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([["--smoke", "--full-sweep"], ["--unknown"], ["--json", "--json"]])("rejects invalid flags %j", async (...args) => {
    const value = harness();
    await expect(runCommerceDiscoveryCli(args, value.dependencies)).resolves.toBe(2);
    expect(value.load).not.toHaveBeenCalled();
    expect(value.calls).toBe(0);
    expect(value.stderr.join(" ")).not.toMatch(/Bearer|access_token|refresh_token/i);
  });
});
