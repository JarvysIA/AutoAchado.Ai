import { describe, expect, it } from "vitest";
import {
  DISCOVERY_REGISTRY_PAGE_SIZE,
  loadDiscoveryEligibleCategories,
  type DiscoveryRegistryReadClient,
  type DiscoveryRegistryReadQuery,
} from "../../../src/server/discovery/registry-reader.js";

type Row = Record<string, unknown>;
class Query implements DiscoveryRegistryReadQuery {
  private filters: Array<[string, string]> = [];
  constructor(readonly owner: Client, readonly table: string) {}
  select(): DiscoveryRegistryReadQuery { return this; }
  eq(column: string, value: string): DiscoveryRegistryReadQuery { this.filters.push([column, value]); return this; }
  order(): DiscoveryRegistryReadQuery { return this; }
  range(from: number, to: number): PromiseLike<{ data: unknown; error: unknown }> {
    this.owner.calls.push({ table: this.table, from, to });
    const rows = (this.owner.tables[this.table] ?? []).filter((row) => this.filters.every(([key, value]) => row[key] === value));
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  }
}
class Client implements DiscoveryRegistryReadClient {
  calls: Array<{ table: string; from: number; to: number }> = [];
  constructor(readonly tables: Record<string, Row[]>) {}
  from(table: string): DiscoveryRegistryReadQuery { return new Query(this, table); }
}

function category(index: number, overrides: Row = {}): Row {
  return {
    marketplace_category_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    marketplace_key: "MERCADO_LIVRE", site_id: "MLB", external_category_id: `MLB${100 + index}`,
    active: true, source_version: "source/v1", config_version: "category/v1", ...overrides,
  };
}
function mapping(index: number, overrides: Row = {}): Row {
  return {
    vertical_key: "AUTOMOTIVE", marketplace_category_id: category(index).marketplace_category_id,
    scope_status: "ALLOWED", priority_tier: index % 2 === 0 ? "A" : "B",
    classification_version: "classifier/v1", manual_override: false, decision_source: "AUTO", active: true,
    ...overrides,
  };
}
function tables(categories: Row[] = [category(0), category(1)], mappings: Row[] = [mapping(0), mapping(1)]): Record<string, Row[]> {
  return {
    marketplaces: [{ marketplace_key: "MERCADO_LIVRE", active: true, config_version: "marketplace/v1" }],
    commerce_verticals: [{ vertical_key: "AUTOMOTIVE", active: true, config_version: "vertical/v1" }],
    marketplace_categories: categories,
    vertical_category_mappings: mappings,
  };
}
const input = (client: Client) => ({ client, marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE" });

describe("discovery registry reader", () => {
  it("derives A/B eligibility and normalized registry provenance", async () => {
    const client = new Client(tables());
    const result = await loadDiscoveryEligibleCategories(input(client));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ priorityTier: "A", marketplaceConfigVersion: "marketplace/v1", verticalConfigVersion: "vertical/v1" });
    expect(new Set(client.calls.map((call) => call.table))).toEqual(new Set(["marketplaces", "commerce_verticals", "marketplace_categories", "vertical_category_mappings"]));
  });

  it("excludes inactive category, inactive mapping, C, REVIEW, EXCLUDED, and wrong site in bulk", async () => {
    const categories = Array.from({ length: 7 }, (_, index) => category(index, index === 1 ? { active: false } : index === 6 ? { site_id: "MLA" } : {}));
    const mappings = [
      mapping(0), mapping(1), mapping(2, { active: false }), mapping(3, { priority_tier: "C" }),
      mapping(4, { scope_status: "REVIEW", priority_tier: "B" }),
      mapping(5, { scope_status: "EXCLUDED", priority_tier: "EXCLUDED" }), mapping(6),
    ];
    await expect(loadDiscoveryEligibleCategories(input(new Client(tables(categories, mappings))))).resolves.toHaveLength(1);
  });

  it("accepts an effective manual ALLOWED A/B mapping", async () => {
    const result = await loadDiscoveryEligibleCategories(input(new Client(tables([category(0)], [mapping(0, {
      manual_override: true, decision_source: "MANUAL",
    })]))));
    expect(result[0]).toMatchObject({ manualOverride: true, decisionSource: "MANUAL" });
  });

  it.each(["marketplaces", "commerce_verticals"])("fails closed when %s is inactive", async (table) => {
    const data = tables();
    data[table]![0] = { ...data[table]![0], active: false };
    await expect(loadDiscoveryEligibleCategories(input(new Client(data)))).rejects.toMatchObject({ code: "DISCOVERY_REGISTRY_RESPONSE_INVALID" });
  });

  it("uses paginated bulk reads without N+1", async () => {
    const categories = Array.from({ length: DISCOVERY_REGISTRY_PAGE_SIZE + 1 }, (_, index) => category(index));
    const client = new Client(tables(categories, []));
    await loadDiscoveryEligibleCategories(input(client));
    expect(client.calls.filter((call) => call.table === "marketplace_categories")).toHaveLength(2);
    expect(client.calls.filter((call) => call.table === "vertical_category_mappings")).toHaveLength(1);
  });
});
