import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type {
  CurrentCommerceRegistryState,
  CurrentMarketplaceCategory,
  CurrentVerticalCategoryMapping,
} from "../../../src/commerce/registry/types.js";
import {
  resolveLocalRegistryAdminTarget,
  validateLocalRegistryUrl,
} from "../../../src/server/registry/admin-target.js";
import {
  AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION,
  AUTOMOTIVE_REGISTRY_PRESET_ID,
  AUTOMOTIVE_REGISTRY_SNAPSHOT_CHECKSUM,
  automotiveRegistryDryRunPreset,
  loadFrozenAutomotiveRegistrySource,
} from "../../../src/server/registry/automotive-registry-preset.js";
import type {
  RegistryReadClient,
  RegistryReadQuery,
  RegistryReadResult,
} from "../../../src/server/registry/current-state.js";
import {
  prepareRegistrySyncRun,
  runRegistrySyncDryRun,
} from "../../../src/server/registry/sync-orchestrator.js";
import {
  REGISTRY_SYNC_SAMPLE_LIMIT,
  digestCurrentCommerceRegistryState,
} from "../../../src/server/registry/sync-preview.js";

class FakeQuery implements RegistryReadQuery {
  private readonly filters: Array<[string, string]> = [];
  private orderBy = "";
  constructor(private readonly rows: readonly Record<string, unknown>[]) {}
  select(): RegistryReadQuery { return this; }
  eq(column: string, value: string): RegistryReadQuery { this.filters.push([column, value]); return this; }
  order(column: string): RegistryReadQuery { this.orderBy = column; return this; }
  async range(from: number, to: number): Promise<RegistryReadResult> {
    const filtered = this.rows
      .filter((row) => this.filters.every(([key, value]) => row[key] === value))
      .sort((left, right) => String(left[this.orderBy]).localeCompare(String(right[this.orderBy])));
    return { data: filtered.slice(from, to + 1), error: null };
  }
}

class FakeReadClient implements RegistryReadClient {
  constructor(private readonly tables: Readonly<Record<string, readonly Record<string, unknown>[]>> = {}) {}
  from(table: string): RegistryReadQuery { return new FakeQuery(this.tables[table] ?? []); }
}

const localTarget = Object.freeze({
  kind: "LOCAL" as const,
  label: "LOCAL" as const,
  projectRef: null,
  baseUrl: "http://127.0.0.1:54321",
});
const remoteTarget = Object.freeze({
  kind: "REMOTE" as const,
  label: "REMOTE" as const,
  projectRef: "nrwhzfahjypybjyajmrj" as const,
  baseUrl: "https://nrwhzfahjypybjyajmrj.supabase.co",
});

function category(overrides: Partial<CurrentMarketplaceCategory> = {}): CurrentMarketplaceCategory {
  return {
    marketplaceCategoryId: "00000000-0000-4000-8000-000000000001",
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    externalCategoryId: "MLB5672",
    parentExternalCategoryId: null,
    name: "Acessórios para Veículos",
    pathExternalIds: ["MLB5672"],
    pathNames: ["Acessórios para Veículos"],
    isLeaf: false,
    active: true,
    sourceVersion: "source/v1",
    configVersion: "commerce-registry-sync/v1",
    firstSeenAt: "2026-08-21T00:00:00.000Z",
    lastSeenAt: "2026-08-21T00:00:00.000Z",
    sourceCheckedAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

function mapping(overrides: Partial<CurrentVerticalCategoryMapping> = {}): CurrentVerticalCategoryMapping {
  return {
    marketplaceCategoryId: "00000000-0000-4000-8000-000000000001",
    verticalKey: "AUTOMOTIVE",
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    externalCategoryId: "MLB5672",
    scopeStatus: "REVIEW",
    priorityTier: null,
    familyKey: null,
    commercialFamilyKeyDefault: null,
    classificationRule: "rule",
    classificationVersion: "automotive-classifier/mlb/v1",
    manualOverride: false,
    decisionSource: "AUTO",
    decisionReason: null,
    decidedAt: "2026-08-21T00:00:00.000Z",
    active: true,
    ...overrides,
  };
}

function state(
  categories: readonly CurrentMarketplaceCategory[] = [category()],
  mappings: readonly CurrentVerticalCategoryMapping[] = [mapping()],
): CurrentCommerceRegistryState {
  return { categories, mappings, controlledMappingExternalCategoryIds: ["MLB5672"] };
}

describe("registry sync dry-run core", () => {
  it("promove o snapshot sem alterar metadata, checksum ou árvore", async () => {
    const source = await loadFrozenAutomotiveRegistrySource();
    expect(source.checksum).toBe(AUTOMOTIVE_REGISTRY_SNAPSHOT_CHECKSUM);
    expect(source.snapshot.nodeCount).toBe(3_269);
    expect(source.snapshot.sourceVersion).toBe(AUTOMOTIVE_REGISTRY_FIRST_SYNC_EXPECTATION.sourceVersion);
    expect(source.checkedAt).toBe("2026-08-21T17:03:43.000Z");
    expect(source.taxonomyTree.getDescendants("MLB5672")).toHaveLength(3_268);
    expect(automotiveRegistryDryRunPreset.presetId).toBe(AUTOMOTIVE_REGISTRY_PRESET_ID);
    expect(automotiveRegistryDryRunPreset.expectedClassificationVersion).toBe("automotive-classifier/mlb/v1");
    expect(automotiveRegistryDryRunPreset.configVersion).toBe("commerce-registry-sync/v1");
  });

  it("produz o full first-sync preview READY sem cliente RPC", async () => {
    const preview = await runRegistrySyncDryRun({
      target: localTarget,
      readClient: new FakeReadClient(),
      preset: automotiveRegistryDryRunPreset,
      firstSync: true,
      nowMs: () => 1,
    });
    expect(preview.safety).toMatchObject({
      previewStatus: "READY", writeCapability: "DISABLED_IN_THIS_BUILD", rpcApplyCalls: 0,
    });
    expect(preview.current).toMatchObject({ categories: 0, mappings: 0, controlledMappings: 0 });
    expect(preview.desired).toMatchObject({ categoryCount: 3_269, mappingCount: 3_269, automaticEligibleCount: 144 });
    expect(preview.desired.scope).toEqual({ allowed: 470, review: 1_950, excluded: 849, unknown: 0 });
    expect(preview.desired.tiers).toEqual({ A: 28, B: 116, C: 326 });
    expect(preview.changes.categories.insert).toBe(3_269);
    expect(preview.changes.mappings.insert).toBe(3_269);
    expect(preview.payload.bytes).toBe(1_603_538);
    expect(preview.payload.rpcWrapperBytesEstimate).toBe(1_603_552);
    expect(preview.samples.categories.insert).toHaveLength(REGISTRY_SYNC_SAMPLE_LIMIT);
    expect(preview.samples.categories.insert.map((item) => item.externalCategoryId)).toEqual(
      [...preview.samples.categories.insert.map((item) => item.externalCategoryId)].sort(),
    );
    expect(preview.samples.mappings.insert).toHaveLength(REGISTRY_SYNC_SAMPLE_LIMIT);
    expect(preview.fingerprint.token).toMatch(/^AUTOACHADO:LOCAL:MLB5672:3269:[A-F0-9]{12}$/);
  });

  it("expõe um prepared run coerente sem mudar o contrato público do dry-run", async () => {
    const input = {
      target: localTarget,
      readClient: new FakeReadClient(),
      preset: automotiveRegistryDryRunPreset,
      firstSync: true,
      nowMs: () => 1,
    };
    const prepared = await prepareRegistrySyncRun(input);
    const preview = await runRegistrySyncDryRun(input);
    expect(prepared.plan.summary.categoryCount).toBe(3_269);
    expect(prepared.payload.rows).toHaveLength(3_269);
    expect(prepared.currentState).toEqual({
      categories: [], mappings: [], controlledMappingExternalCategoryIds: [],
    });
    expect(prepared.diff.summary.categories.insert).toBe(3_269);
    expect(prepared.diff.summary.mappings.insert).toBe(3_269);
    expect(prepared.preview.payload.sha256).toBe(preview.payload.sha256);
    expect(prepared.preview).toEqual(preview);
  });

  it("bloqueia first-sync quando o current state não está vazio", async () => {
    const source = await loadFrozenAutomotiveRegistrySource();
    const root = source.snapshot.nodes.find((node) => node.externalCategoryId === "MLB5672")!;
    const rawRoot = {
      marketplace_category_id: "00000000-0000-4000-8000-000000000001",
      marketplace_key: "MERCADO_LIVRE",
      site_id: "MLB",
      external_category_id: root.externalCategoryId,
      parent_marketplace_category_id: null,
      name: root.name,
      path_external_ids: [...root.pathExternalCategoryIds],
      path_names: [...root.pathNames],
      is_leaf: root.isLeaf,
      active: true,
      source_version: source.snapshot.sourceVersion,
      config_version: "commerce-registry-sync/v1",
      first_seen_at: source.checkedAt,
      last_seen_at: source.checkedAt,
      source_checked_at: source.checkedAt,
    };
    const preview = await runRegistrySyncDryRun({
      target: localTarget,
      readClient: new FakeReadClient({ marketplace_categories: [rawRoot] }),
      preset: automotiveRegistryDryRunPreset,
      firstSync: true,
      nowMs: () => 1,
    });
    expect(preview.safety.previewStatus).toBe("BLOCKED");
    expect(preview.safety.blockers).toEqual(["REGISTRY_SYNC_EXPECTATION_MISMATCH"]);
  });

  it("mantém digest semântico estável para ordem, UUID e timestamps", () => {
    const first = state();
    const temporal = state([
      category({
        marketplaceCategoryId: "00000000-0000-4000-8000-000000000999",
        firstSeenAt: "2026-09-01T00:00:00.000Z",
        lastSeenAt: "2026-09-02T00:00:00.000Z",
        sourceCheckedAt: "2026-09-03T00:00:00.000Z",
      }),
    ], [mapping({
      marketplaceCategoryId: "00000000-0000-4000-8000-000000000999",
      decidedAt: "2026-09-04T00:00:00.000Z",
    })]);
    expect(digestCurrentCommerceRegistryState(temporal)).toBe(digestCurrentCommerceRegistryState(first));
    expect(digestCurrentCommerceRegistryState(state([category({ name: "Outro" })])))
      .not.toBe(digestCurrentCommerceRegistryState(first));
    expect(digestCurrentCommerceRegistryState(state(undefined, [mapping({ active: false })])))
      .not.toBe(digestCurrentCommerceRegistryState(first));
    expect(digestCurrentCommerceRegistryState(state(undefined, [mapping({
      manualOverride: true, decisionSource: "MANUAL", decidedAt: "2026-08-21T00:00:00.000Z",
    })]))).not.toBe(digestCurrentCommerceRegistryState(first));
    expect(digestCurrentCommerceRegistryState(state(undefined, [mapping({ scopeStatus: "EXCLUDED" })])))
      .not.toBe(digestCurrentCommerceRegistryState(first));
  });

  it("mantém fingerprint estável entre timings e muda com firstSync", async () => {
    let time = 0;
    const first = await runRegistrySyncDryRun({
      target: localTarget, readClient: new FakeReadClient(), preset: automotiveRegistryDryRunPreset,
      firstSync: true, nowMs: () => time++,
    });
    time = 100;
    const second = await runRegistrySyncDryRun({
      target: localTarget, readClient: new FakeReadClient(), preset: automotiveRegistryDryRunPreset,
      firstSync: true, nowMs: () => time += 7,
    });
    const generic = await runRegistrySyncDryRun({
      target: localTarget, readClient: new FakeReadClient(), preset: automotiveRegistryDryRunPreset,
      firstSync: false, nowMs: () => 1,
    });
    expect(second.performance).not.toEqual(first.performance);
    expect(second.fingerprint).toEqual(first.fingerprint);
    expect(generic.fingerprint.value).not.toBe(first.fingerprint.value);
  });

  it("vincula fingerprint/token ao target REMOTE sem alterar payload ou preview v1", async () => {
    const local = await runRegistrySyncDryRun({
      target: localTarget, readClient: new FakeReadClient(), preset: automotiveRegistryDryRunPreset,
      firstSync: true, nowMs: () => 1,
    });
    const remote = await runRegistrySyncDryRun({
      target: remoteTarget, readClient: new FakeReadClient(), preset: automotiveRegistryDryRunPreset,
      firstSync: true, nowMs: () => 1,
    });
    expect(remote.contractVersion).toBe("commerce-registry-sync-preview/v1");
    expect(remote.target).toEqual(remoteTarget);
    expect(remote.fingerprint.value).not.toBe(local.fingerprint.value);
    expect(remote.fingerprint.token).toMatch(/^AUTOACHADO:REMOTE:MLB5672:3269:[A-F0-9]{12}$/);
    expect(remote.payload).toEqual(local.payload);
  });

  it("aceita somente target HTTP local e nunca expõe o secret no resultado", () => {
    expect(validateLocalRegistryUrl("http://localhost:54321/")).toBe("http://localhost:54321");
    expect(validateLocalRegistryUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
    for (const url of ["https://localhost:54321", "https://project.supabase.co", "not-a-url"]) {
      expect(() => validateLocalRegistryUrl(url)).toThrowError(/Target local inválido/);
    }
    let capturedSecret = "";
    const readClient = new FakeReadClient();
    const resolved = resolveLocalRegistryAdminTarget({
      runStatus: () => ({ status: 0, stdout: "API_URL=http://127.0.0.1:54321\nSECRET_KEY=sb_secret_fake_canary\n" }),
      createReadClient: (_url, secret) => { capturedSecret = secret; return readClient; },
    });
    expect(capturedSecret).toBe("sb_secret_fake_canary");
    expect(JSON.stringify(resolved)).not.toContain("sb_secret_fake_canary");
    expect(() => resolveLocalRegistryAdminTarget({
      runStatus: () => ({ status: 1, stdout: "SECRET_KEY=sb_secret_fake_canary" }),
    })).toThrowError(/Supabase local indisponível/);
  });

  it("mantém o dry-run orchestrator sem executor nem caminhos de write/RPC", async () => {
    const runtime = await readFile(
      new URL("../../../src/server/registry/sync-orchestrator.ts", import.meta.url),
      "utf8",
    );
    expect(runtime).not.toContain("applyCommerceRegistrySync");
    expect(runtime).not.toContain("registryApplyClientFromSupabase");
    expect(runtime).not.toMatch(/\.rpc\s*\(/);
    expect(runtime).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
    expect(runtime).not.toContain("./executor");
  });
});
