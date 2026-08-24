import { describe, expect, it } from "vitest";
import {
  loadCurrentCommerceRegistryState,
  REGISTRY_CURRENT_STATE_PAGE_SIZE,
  type RegistryReadClient,
  type RegistryReadQuery,
  type RegistryReadResult,
} from "../../../src/server/registry/current-state.js";

interface Call { table: string; fields: string; filters: [string, string][]; order: string; from: number; to: number }

class FakeQuery implements RegistryReadQuery {
  private fields = "";
  private readonly filters: [string, string][] = [];
  private orderBy = "";
  constructor(private readonly client: FakeClient, private readonly table: string) {}
  select(columns: string): RegistryReadQuery { this.fields = columns; return this; }
  eq(column: string, value: string): RegistryReadQuery { this.filters.push([column, value]); return this; }
  order(column: string): RegistryReadQuery { this.orderBy = column; return this; }
  async range(from: number, to: number): Promise<RegistryReadResult> {
    this.client.calls.push({ table: this.table, fields: this.fields, filters: [...this.filters], order: this.orderBy, from, to });
    if (this.client.failAt?.table === this.table && this.client.failAt.from === from) return { data: null, error: { sensitive: true } };
    const rows = [...(this.client.tables[this.table] ?? [])]
      .filter((row) => this.filters.every(([key, value]) => row[key] === value))
      .sort((left, right) => String(left[this.orderBy]).localeCompare(String(right[this.orderBy])));
    return { data: rows.slice(from, to + 1), error: null };
  }
}

class FakeClient implements RegistryReadClient {
  readonly calls: Call[] = [];
  failAt?: { table: string; from: number };
  constructor(readonly tables: Record<string, Record<string, unknown>[]>) {}
  from(table: string): RegistryReadQuery { return new FakeQuery(this, table); }
}

function id(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function category(value: number, options: {
  externalId?: string; parentId?: string | null; pathIds?: string[]; pathNames?: string[];
  marketplace?: string; site?: string; name?: string;
} = {}): Record<string, unknown> {
  const externalId = options.externalId ?? `C${String(value).padStart(5, "0")}`;
  const name = options.name ?? externalId;
  const parentId = options.parentId === undefined ? (value === 0 ? null : id(0)) : options.parentId;
  const pathIds = options.pathIds ?? (value === 0 ? [externalId] : ["ROOT", externalId]);
  const pathNames = options.pathNames ?? (value === 0 ? [name] : ["Root", name]);
  return {
    marketplace_category_id: id(value), marketplace_key: options.marketplace ?? "MARKET", site_id: options.site ?? "SITE",
    external_category_id: externalId, parent_marketplace_category_id: parentId, name,
    path_external_ids: pathIds, path_names: pathNames, is_leaf: value !== 0, active: true,
    source_version: "source/v1", config_version: "sync/v1", first_seen_at: "2026-08-24T00:00:00.000Z",
    last_seen_at: "2026-08-24T00:00:00.000Z", source_checked_at: "2026-08-24T00:00:00.000Z",
  };
}

function mapping(value: number, options: { vertical?: string; manual?: boolean; scope?: string; tier?: string | null } = {}) {
  const manual = options.manual ?? false;
  return {
    vertical_key: options.vertical ?? "VERTICAL", marketplace_category_id: id(value), scope_status: options.scope ?? "ALLOWED",
    priority_tier: options.tier === undefined ? "A" : options.tier, family_key: "family",
    commercial_family_key_default: null, classification_rule: manual ? "manual" : "rule",
    classification_version: manual ? "manual/v1" : "classifier/v1", manual_override: manual,
    decision_source: manual ? "MANUAL" : "AUTO", decision_reason: manual ? "human" : "auto",
    decided_at: "2026-08-24T00:00:00.000Z", active: true,
  };
}

function input(client: RegistryReadClient, desiredExternalCategoryIds: readonly string[] = []) {
  return { client, marketplaceKey: "MARKET", siteId: "SITE", verticalKey: "VERTICAL",
    rootExternalCategoryId: "ROOT", desiredExternalCategoryIds };
}

describe("current commerce registry state reader", () => {
  it("retorna estado vazio e usa somente selects explícitos", async () => {
    const client = new FakeClient({ marketplace_categories: [], vertical_category_mappings: [] });
    await expect(loadCurrentCommerceRegistryState(input(client))).resolves.toEqual({
      categories: [], mappings: [], controlledMappingExternalCategoryIds: [],
    });
    expect(client.calls).toHaveLength(2);
    expect(client.calls.every((call) => call.fields.length > 0 && call.fields !== "*" && call.to - call.from + 1 === 1000)).toBe(true);
  });

  it.each([[1501, 2], [2000, 3]])("pagina %i categories sem perda, inclusive múltiplo exato", async (count, expectedPages) => {
    const categories = Array.from({ length: count }, (_, index) => category(index, {
      externalId: index === 0 ? "ROOT" : `C${String(index).padStart(5, "0")}`,
    }));
    const client = new FakeClient({ marketplace_categories: categories, vertical_category_mappings: [] });
    const state = await loadCurrentCommerceRegistryState(input(client, categories.map((row) => String(row.external_category_id))));
    expect(state.categories).toHaveLength(count);
    expect(new Set(state.categories.map((row) => row.externalCategoryId))).toHaveLength(count);
    expect(client.calls.filter((call) => call.table === "marketplace_categories")).toHaveLength(expectedPages);
    expect(client.calls).toHaveLength(expectedPages + 1);
  });

  it("falha fechado quando página intermediária falha", async () => {
    const rows = Array.from({ length: 1501 }, (_, index) => category(index, { externalId: index === 0 ? "ROOT" : `C${index}` }));
    const client = new FakeClient({ marketplace_categories: rows, vertical_category_mappings: [] });
    client.failAt = { table: "marketplace_categories", from: REGISTRY_CURRENT_STATE_PAGE_SIZE };
    await expect(loadCurrentCommerceRegistryState(input(client, rows.map((row) => String(row.external_category_id)))))
      .rejects.toMatchObject({ code: "REGISTRY_CURRENT_STATE_READ_FAILED" });
  });

  it("une desired com membership por path e preserva moved-in/moved-out", async () => {
    const rows = [
      category(0, { externalId: "ROOT", name: "Root" }),
      category(1, { externalId: "OUT", pathIds: ["ROOT", "OUT"], pathNames: ["Root", "OUT"] }),
      category(2, { externalId: "OTHER", parentId: null, pathIds: ["OTHER"], pathNames: ["OTHER"] }),
      category(3, { externalId: "IN", parentId: id(2), pathIds: ["OTHER", "IN"], pathNames: ["OTHER", "IN"] }),
      category(4, { externalId: "OTHER_SITE", site: "OTHER" }),
      category(5, { externalId: "OTHER_MARKET", marketplace: "OTHER" }),
    ];
    const mappings = [mapping(1, { manual: true }), mapping(2), mapping(3), mapping(1, { vertical: "HOME" })];
    const client = new FakeClient({ marketplace_categories: rows, vertical_category_mappings: mappings });
    const state = await loadCurrentCommerceRegistryState(input(client, ["ROOT", "IN"]));
    expect(state.categories.map((row) => row.externalCategoryId)).toEqual(["IN", "OUT", "ROOT"]);
    expect(state.controlledMappingExternalCategoryIds).toEqual(["OUT", "ROOT"]);
    expect(state.mappings.map((row) => row.externalCategoryId)).toEqual(["IN", "OUT"]);
    expect(state.mappings.find((row) => row.externalCategoryId === "OUT")).toMatchObject({
      manualOverride: true, decisionSource: "MANUAL", decisionReason: "human", decidedAt: "2026-08-24T00:00:00.000Z",
    });
    expect(state.categories.find((row) => row.externalCategoryId === "IN")?.parentExternalCategoryId).toBe("OTHER");
  });

  it("rejeita parent não resolvido, duplicates e desired duplicado", async () => {
    const unresolved = new FakeClient({ marketplace_categories: [category(1, { externalId: "OUT", parentId: id(99) })], vertical_category_mappings: [] });
    await expect(loadCurrentCommerceRegistryState(input(unresolved, ["OUT"]))).rejects.toMatchObject({
      code: "REGISTRY_CURRENT_STATE_PARENT_UNRESOLVED",
    });
    const duplicate = category(0, { externalId: "ROOT", name: "Root" });
    const duplicates = new FakeClient({ marketplace_categories: [duplicate, { ...duplicate, marketplace_category_id: id(9) }], vertical_category_mappings: [] });
    await expect(loadCurrentCommerceRegistryState(input(duplicates))).rejects.toThrow();
    const empty = new FakeClient({ marketplace_categories: [], vertical_category_mappings: [] });
    await expect(loadCurrentCommerceRegistryState(input(empty, ["A", "A"]))).rejects.toThrow();
  });

  it("rejeita mapping duplicado, manual incoerente e scope/tier inválido", async () => {
    const root = category(0, { externalId: "ROOT", name: "Root" });
    const duplicated = new FakeClient({ marketplace_categories: [root], vertical_category_mappings: [mapping(0), mapping(0)] });
    await expect(loadCurrentCommerceRegistryState(input(duplicated, ["ROOT"]))).rejects.toThrow();
    const manual = new FakeClient({ marketplace_categories: [root], vertical_category_mappings: [{ ...mapping(0), manual_override: true }] });
    await expect(loadCurrentCommerceRegistryState(input(manual, ["ROOT"]))).rejects.toThrow();
    const tier = new FakeClient({ marketplace_categories: [root], vertical_category_mappings: [mapping(0, { scope: "REVIEW", tier: "A" })] });
    await expect(loadCurrentCommerceRegistryState(input(tier, ["ROOT"]))).rejects.toThrow();
  });
});
