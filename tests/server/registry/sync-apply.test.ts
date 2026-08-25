import { describe, expect, it } from "vitest";
import { RegistrySyncError } from "../../../src/commerce/registry/errors.js";
import type { RegistrySyncDryRunPreset } from "../../../src/server/registry/sync-orchestrator.js";
import type {
  RegistryReadClient,
  RegistryReadQuery,
  RegistryReadResult,
} from "../../../src/server/registry/current-state.js";
import type {
  RegistryApplyRpcClient,
  RegistryApplyRpcResult,
} from "../../../src/server/registry/executor.js";
import {
  runRegistrySyncApply,
  type RunRegistrySyncApplyInput,
} from "../../../src/server/registry/sync-apply.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";

const target = Object.freeze({
  kind: "LOCAL" as const,
  label: "LOCAL" as const,
  projectRef: null,
  baseUrl: "http://127.0.0.1:54321",
});
const checkedAt = "2026-08-21T17:03:43.000Z";
const sourceVersion = `sha256:${"a".repeat(64)}`;

const snapshot = Object.freeze({
  schemaVersion: "meli-automotive-taxonomy-snapshot/v1" as const,
  marketplaceKey: "MERCADO_LIVRE" as const,
  siteId: "MLB" as const,
  rootCategoryId: "MLB5672" as const,
  sourceVersion,
  sourceContentCreated: checkedAt,
  nodeCount: 1,
  nodes: Object.freeze([Object.freeze({
    externalCategoryId: "MLB5672",
    name: "Acessórios para Veículos",
    parentExternalCategoryId: null,
    pathExternalCategoryIds: Object.freeze(["MLB5672"]),
    pathNames: Object.freeze(["Acessórios para Veículos"]),
    isLeaf: true,
  })]),
});

const preset: RegistrySyncDryRunPreset = Object.freeze({
  presetId: "TEST_AUTOMOTIVE_V1",
  marketplaceKey: "MERCADO_LIVRE",
  siteId: "MLB",
  verticalKey: "AUTOMOTIVE",
  rootExternalCategoryId: "MLB5672",
  configVersion: "commerce-registry-sync/v1",
  expectedClassificationVersion: "automotive-classifier/mlb/v1",
  loadSource: async () => ({
    snapshot,
    taxonomyTree: new TaxonomyTree([{
      marketplaceKey: "MERCADO_LIVRE",
      siteId: "MLB",
      externalCategoryId: "MLB5672",
      name: "Acessórios para Veículos",
      parentExternalCategoryId: null,
      childrenExternalCategoryIds: [],
      pathExternalCategoryIds: ["MLB5672"],
      pathNames: ["Acessórios para Veículos"],
      isLeaf: true,
    }], { requiredRootId: "MLB5672" }),
    checksum: "fixture-checksum",
    checkedAt,
  }),
  classifyCategory: (externalCategoryId: string) => ({
    externalCategoryId,
    scopeStatus: "REVIEW" as const,
    priorityTier: null,
    familyKey: null,
    commercialFamilyKeyDefault: null,
    ruleId: "fixture.rule",
    classificationVersion: "automotive-classifier/mlb/v1",
    reason: "fixture",
  }),
  firstSyncExpectation: {
    snapshotChecksum: "unused",
    sourceVersion: "unused",
    sourceContentCreated: checkedAt,
    classificationVersion: "automotive-classifier/mlb/v1",
    configVersion: "commerce-registry-sync/v1",
    payloadBytes: 0,
    categoryCount: 1,
    mappingCount: 1,
    scopeCounts: { allowed: 0, review: 1, excluded: 0, unknown: 0 },
    tierCounts: { A: 0, B: 0, C: 0 },
    automaticEligibleCount: 0,
    expectedCurrentCategoryCount: 0,
    expectedCurrentMappingCount: 0,
    expectedCategoryDiff: { insert: 1, update: 0, unchanged: 0, reactivate: 0 },
    expectedMappingDiff: { insert: 1, update: 0, unchanged: 0, reactivate: 0, inactivate: 0, manual_override_skipped: 0 },
  },
});

type Row = Readonly<Record<string, unknown>>;

function categoryRow(): Row {
  return {
    marketplace_category_id: "00000000-0000-4000-8000-000000000001",
    marketplace_key: "MERCADO_LIVRE",
    site_id: "MLB",
    external_category_id: "MLB5672",
    parent_marketplace_category_id: null,
    name: "Acessórios para Veículos",
    path_external_ids: ["MLB5672"],
    path_names: ["Acessórios para Veículos"],
    is_leaf: true,
    active: true,
    source_version: sourceVersion,
    config_version: "commerce-registry-sync/v1",
    first_seen_at: checkedAt,
    last_seen_at: checkedAt,
    source_checked_at: checkedAt,
  };
}

function mappingRow(overrides: Row = {}): Row {
  return {
    vertical_key: "AUTOMOTIVE",
    marketplace_category_id: "00000000-0000-4000-8000-000000000001",
    scope_status: "REVIEW",
    priority_tier: null,
    family_key: null,
    commercial_family_key_default: null,
    classification_rule: "fixture.rule",
    classification_version: "automotive-classifier/mlb/v1",
    manual_override: false,
    decision_source: "AUTO",
    decision_reason: "fixture",
    decided_at: checkedAt,
    active: true,
    ...overrides,
  };
}

class Store {
  categories: Row[] = [];
  mappings: Row[] = [];
  failReads = false;
}

class Query implements RegistryReadQuery {
  private readonly filters: Array<[string, string]> = [];
  private orderBy = "";
  constructor(private readonly store: Store, private readonly table: string) {}
  select(): RegistryReadQuery { return this; }
  eq(column: string, value: string): RegistryReadQuery { this.filters.push([column, value]); return this; }
  order(column: string): RegistryReadQuery { this.orderBy = column; return this; }
  async range(from: number, to: number): Promise<RegistryReadResult> {
    if (this.store.failReads) throw new Error("secret raw read failure");
    const source = this.table === "marketplace_categories" ? this.store.categories : this.store.mappings;
    const rows = source
      .filter((row) => this.filters.every(([key, value]) => row[key] === value))
      .sort((left, right) => String(left[this.orderBy]).localeCompare(String(right[this.orderBy])));
    return { data: rows.slice(from, to + 1), error: null };
  }
}

class ReadClient implements RegistryReadClient {
  constructor(private readonly store: Store) {}
  from(table: string): RegistryReadQuery { return new Query(this.store, table); }
}

class ApplyClient implements RegistryApplyRpcClient {
  calls = 0;
  constructor(private readonly handler: () => RegistryApplyRpcResult | Promise<RegistryApplyRpcResult>) {}
  async rpc(): Promise<RegistryApplyRpcResult> {
    this.calls += 1;
    return this.handler();
  }
}

function result(kind: "insert" | "unchanged" | "manual" | "reactivate" = "insert") {
  return {
    contractVersion: "commerce-registry-apply-result/v1",
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    verticalKey: "AUTOMOTIVE",
    rootExternalCategoryId: "MLB5672",
    sourceVersion,
    classificationVersion: "automotive-classifier/mlb/v1",
    categories: { inserted: kind === "insert" ? 1 : 0, updated: 0,
      unchanged: kind === "insert" ? 0 : 1, reactivated: 0 },
    mappings: { inserted: kind === "insert" ? 1 : 0, updated: 0,
      unchanged: kind === "unchanged" ? 1 : 0,
      reactivated: kind === "reactivate" ? 1 : 0, inactivated: 0,
      manualOverrideSkipped: kind === "manual" ? 1 : 0 },
    desired: { categories: 1, mappings: 1, automaticEligible: 0 },
    effective: { activeMappings: 1, allowed: 0, review: 1, excluded: 0, unknown: 0,
      tierA: 0, tierB: 0, tierC: 0, automaticEligible: 0 },
  };
}

function materialize(store: Store, mapping: Row = mappingRow()): void {
  store.categories = [categoryRow()];
  store.mappings = [mapping];
}

function input(
  initial: Store,
  refreshed: Store,
  client: ApplyClient,
  overrides: Partial<RunRegistrySyncApplyInput> = {},
): RunRegistrySyncApplyInput {
  return {
    target,
    readClient: new ReadClient(initial),
    preset,
    firstSync: false,
    confirmationMode: "PROVIDED_EXACT_TOKEN",
    readConfirmationToken: async (value) => value.fingerprint.token,
    resolveApplyTarget: () => ({
      target,
      readClient: new ReadClient(refreshed),
      createApplyClient: async () => client,
    }),
    nowMs: () => 1,
    ...overrides,
  };
}

describe("confirmed local registry apply", () => {
  it("bloqueia target REMOTE direto antes de prepare, read, confirmation ou RPC", async () => {
    const client = new ApplyClient(() => ({ data: result(), error: null }));
    let confirmationCalls = 0;
    let applyTargetCalls = 0;
    const remoteInput = {
      ...input(new Store(), new Store(), client),
      target: {
        kind: "REMOTE", label: "REMOTE", projectRef: "nrwhzfahjypybjyajmrj",
        baseUrl: "https://nrwhzfahjypybjyajmrj.supabase.co",
      },
      readConfirmationToken: async () => { confirmationCalls += 1; return "never"; },
      resolveApplyTarget: () => { applyTargetCalls += 1; throw new Error("never"); },
    } as unknown as RunRegistrySyncApplyInput;
    await expect(runRegistrySyncApply(remoteInput)).rejects.toMatchObject({
      code: "REGISTRY_SYNC_REMOTE_APPLY_NOT_ENABLED",
    });
    expect(confirmationCalls).toBe(0);
    expect(applyTargetCalls).toBe(0);
    expect(client.calls).toBe(0);
  });

  it("aplica o payload preparado com exatamente uma RPC, zero retry e post convergence", async () => {
    const initial = new Store();
    const refreshed = new Store();
    const client = new ApplyClient(() => {
      materialize(refreshed);
      return { data: result("insert"), error: null };
    });
    const applied = await runRegistrySyncApply(input(initial, refreshed, client));
    expect(applied.outcome).toBe("APPLIED_AND_VERIFIED");
    expect(applied.rpc).toMatchObject({ callCount: 1, retryCount: 0, errorCode: null });
    expect(applied.post).toMatchObject({ readAttempted: true, readSucceeded: true, converged: true,
      rpcPreConsistent: true, effectiveConsistent: true });
    expect(applied.post.diffSummary).toMatchObject({
      categories: { unchanged: 1, insert: 0, update: 0, reactivate: 0 },
      mappings: { unchanged: 1, insert: 0, update: 0, reactivate: 0, inactivate: 0 },
    });
    expect(client.calls).toBe(1);
  });

  it("bloqueia token errado, stale second prepare e target divergente antes da RPC", async () => {
    const empty = new Store();
    const client = new ApplyClient(() => ({ data: result(), error: null }));
    await expect(runRegistrySyncApply(input(empty, empty, client, {
      readConfirmationToken: async () => "wrong",
    }))).rejects.toMatchObject({ code: "REGISTRY_SYNC_CONFIRMATION_MISMATCH" });

    const changed = new Store();
    materialize(changed);
    await expect(runRegistrySyncApply(input(empty, changed, client)))
      .rejects.toMatchObject({ code: "REGISTRY_SYNC_CONFIRMATION_MISMATCH" });

    await expect(runRegistrySyncApply(input(empty, empty, client, {
      resolveApplyTarget: () => ({
        target: { ...target, baseUrl: "http://localhost:54322" },
        readClient: new ReadClient(empty),
        createApplyClient: async () => client,
      }),
    }))).rejects.toMatchObject({ code: "REGISTRY_SYNC_TARGET_MISMATCH" });
    expect(client.calls).toBe(0);
  });

  it("executa replay explícito em uma RPC sem writes", async () => {
    const initial = new Store();
    const refreshed = new Store();
    materialize(initial);
    materialize(refreshed);
    const before = JSON.stringify(refreshed);
    const client = new ApplyClient(() => ({ data: result("unchanged"), error: null }));
    const replay = await runRegistrySyncApply(input(initial, refreshed, client));
    expect(replay.outcome).toBe("APPLIED_AND_VERIFIED");
    expect(replay.rpc).toMatchObject({ callCount: 1, retryCount: 0 });
    expect(JSON.stringify(refreshed)).toBe(before);
  });

  it("preserva manual override e aceita manual skip como convergência", async () => {
    const manual = mappingRow({ manual_override: true, decision_source: "MANUAL", decision_reason: "operator" });
    const initial = new Store();
    const refreshed = new Store();
    materialize(initial, manual);
    materialize(refreshed, manual);
    const before = JSON.stringify(refreshed.mappings);
    const client = new ApplyClient(() => ({ data: result("manual"), error: null }));
    const applied = await runRegistrySyncApply(input(initial, refreshed, client));
    expect(applied.outcome).toBe("APPLIED_AND_VERIFIED");
    expect(applied.rpc.result?.mappings.manualOverrideSkipped).toBe(1);
    expect(applied.post.converged).toBe(true);
    expect(JSON.stringify(refreshed.mappings)).toBe(before);
  });

  it("aceita reativação de mapping manual e preserva sua decisão", async () => {
    const inactiveManual = mappingRow({ active: false, manual_override: true, decision_source: "MANUAL",
      decision_reason: "operator" });
    const activeManual = mappingRow({ active: true, manual_override: true, decision_source: "MANUAL",
      decision_reason: "operator" });
    const initial = new Store();
    const refreshed = new Store();
    materialize(initial, inactiveManual);
    materialize(refreshed, inactiveManual);
    const client = new ApplyClient(() => {
      refreshed.mappings = [activeManual];
      return { data: result("reactivate"), error: null };
    });
    const applied = await runRegistrySyncApply(input(initial, refreshed, client));
    expect(applied.outcome).toBe("APPLIED_AND_VERIFIED");
    expect(applied.post.diffSummary?.mappings.manual_override_skipped).toBe(1);
    expect(refreshed.mappings[0]).toMatchObject({ manual_override: true, decision_source: "MANUAL", active: true });
  });

  it("classifica falha com estado igual, estado diferente e post-read indisponível conservadoramente", async () => {
    const unchanged = new Store();
    const failed = new ApplyClient(() => Promise.reject(new Error("network secret")));
    const same = await runRegistrySyncApply(input(unchanged, unchanged, failed));
    expect(same.outcome).toBe("APPLY_FAILED_STATE_UNCHANGED");
    expect(same.rpc).toMatchObject({ callCount: 1, retryCount: 0, errorCode: "REGISTRY_ATOMIC_APPLY_FAILED" });

    const changed = new Store();
    const ambiguous = new ApplyClient(() => {
      materialize(changed);
      return Promise.reject(new Error("response lost"));
    });
    const uncertain = await runRegistrySyncApply(input(new Store(), changed, ambiguous));
    expect(uncertain.outcome).toBe("APPLY_OUTCOME_UNCERTAIN");

    const unreadable = new Store();
    const unreadableClient = new ApplyClient(() => {
      unreadable.failReads = true;
      return Promise.reject(new Error("network"));
    });
    const noPost = await runRegistrySyncApply(input(new Store(), unreadable, unreadableClient));
    expect(noPost.outcome).toBe("APPLY_OUTCOME_UNCERTAIN");
    expect(noPost.post).toMatchObject({ readAttempted: true, readSucceeded: false });
  });

  it("trata lock sem retry e ainda tenta post-read", async () => {
    const store = new Store();
    const client = new ApplyClient(() => ({ data: null, error: { message: "REGISTRY_SYNC_LOCKED" } }));
    const locked = await runRegistrySyncApply(input(store, store, client));
    expect(locked.outcome).toBe("LOCKED");
    expect(locked.rpc).toMatchObject({ callCount: 1, retryCount: 0, errorCode: "REGISTRY_SYNC_LOCKED" });
    expect(locked.post).toMatchObject({ readAttempted: true, readSucceeded: true });
  });

  it("falha fechado em resultado divergente ou pós-estado não convergente", async () => {
    const empty = new Store();
    const wrongResult = { ...result("insert"), categories: { inserted: 0, updated: 0, unchanged: 1, reactivated: 0 } };
    const client = new ApplyClient(() => ({ data: wrongResult, error: null }));
    const failed = await runRegistrySyncApply(input(empty, empty, client));
    expect(failed.outcome).toBe("POST_VERIFY_FAILED");
    expect(failed.post).toMatchObject({ converged: false, rpcPreConsistent: false });
  });

  it("não transforma exceção de preparação bloqueada em RPC", async () => {
    const client = new ApplyClient(() => ({ data: result(), error: null }));
    await expect(runRegistrySyncApply(input(new Store(), new Store(), client, {
      firstSync: true,
    }))).rejects.toMatchObject({ code: "REGISTRY_SYNC_EXPECTATION_MISMATCH" });
    expect(client.calls).toBe(0);
  });

  it("não propaga erro cru de transporte no result", async () => {
    const store = new Store();
    const client = new ApplyClient(() => Promise.reject(new RegistrySyncError(
      "REGISTRY_ATOMIC_APPLY_FAILED", "sb_secret_fake_canary Authorization",
    )));
    const failed = await runRegistrySyncApply(input(store, store, client));
    expect(JSON.stringify(failed)).not.toMatch(/sb_secret_|Authorization/);
  });
});
