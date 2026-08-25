import { describe, expect, it } from "vitest";
import type { AtomicRegistryApplyPayload } from "../../../src/commerce/registry/apply-payload.js";
import type {
  RegistryReadClient,
  RegistryReadQuery,
  RegistryReadResult,
} from "../../../src/server/registry/current-state.js";
import type { RegistryApplyRpcClient } from "../../../src/server/registry/executor.js";
import {
  FIRST_REMOTE_REGISTRY_PAYLOAD_SHA256,
  buildLiveRemoteConfirmationToken,
  prepareFirstRemoteRegistryApplyPreview,
  runFirstRemoteRegistryApply,
  validateFirstRemoteRegistryStructuralState,
} from "../../../src/server/registry/first-remote-sync-apply.js";
import { resolveFirstRemoteRegistryApplyTarget } from "../../../src/server/registry/remote-live-target.js";
import { automotiveRegistryDryRunPreset } from "../../../src/server/registry/automotive-registry-preset.js";
import { prepareRegistrySyncRun } from "../../../src/server/registry/sync-orchestrator.js";
import { sha256Utf8 } from "../../../src/server/registry/sync-preview.js";

const target = Object.freeze({
  kind: "REMOTE" as const,
  label: "REMOTE" as const,
  projectRef: "nrwhzfahjypybjyajmrj" as const,
  baseUrl: "https://nrwhzfahjypybjyajmrj.supabase.co",
});

type Row = Readonly<Record<string, unknown>>;

class Store {
  categories: Row[] = [];
  mappings: Row[] = [];
}

class Query implements RegistryReadQuery {
  private readonly filters: Array<[string, string]> = [];
  private orderBy = "";
  constructor(private readonly store: Store, private readonly table: string) {}
  select(): RegistryReadQuery { return this; }
  eq(column: string, value: string): RegistryReadQuery {
    this.filters.push([column, value]);
    return this;
  }
  order(column: string): RegistryReadQuery { this.orderBy = column; return this; }
  async range(from: number, to: number): Promise<RegistryReadResult> {
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

function uuid(index: number): string {
  return "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0");
}

function materialize(store: Store, payload: Readonly<AtomicRegistryApplyPayload>): void {
  const ids = new Map(payload.rows.map((row, index) => [row.externalCategoryId, uuid(index + 1)]));
  store.categories = payload.rows.map((row) => ({
    marketplace_category_id: ids.get(row.externalCategoryId),
    marketplace_key: payload.context.marketplaceKey,
    site_id: payload.context.siteId,
    external_category_id: row.externalCategoryId,
    parent_marketplace_category_id: row.parentExternalCategoryId === null
      ? null
      : ids.get(row.parentExternalCategoryId),
    name: row.name,
    path_external_ids: [...row.pathExternalIds],
    path_names: [...row.pathNames],
    is_leaf: row.isLeaf,
    active: true,
    source_version: payload.context.sourceVersion,
    config_version: payload.context.configVersion,
    first_seen_at: payload.context.checkedAt,
    last_seen_at: payload.context.checkedAt,
    source_checked_at: payload.context.checkedAt,
  }));
  store.mappings = payload.rows.map((row) => ({
    vertical_key: payload.context.verticalKey,
    marketplace_category_id: ids.get(row.externalCategoryId),
    scope_status: row.scopeStatus,
    priority_tier: row.priorityTier,
    family_key: row.familyKey,
    commercial_family_key_default: row.commercialFamilyKeyDefault,
    classification_rule: row.classificationRule,
    classification_version: payload.context.classificationVersion,
    manual_override: false,
    decision_source: "AUTO",
    decision_reason: row.decisionReason,
    decided_at: payload.context.checkedAt,
    active: true,
  }));
}

function rpcResult() {
  return {
    contractVersion: "commerce-registry-apply-result/v1",
    marketplaceKey: "MERCADO_LIVRE",
    siteId: "MLB",
    verticalKey: "AUTOMOTIVE",
    rootExternalCategoryId: "MLB5672",
    sourceVersion: automotiveRegistryDryRunPreset.firstSyncExpectation.sourceVersion,
    classificationVersion: automotiveRegistryDryRunPreset.firstSyncExpectation.classificationVersion,
    categories: { inserted: 3_269, updated: 0, unchanged: 0, reactivated: 0 },
    mappings: {
      inserted: 3_269, updated: 0, unchanged: 0, reactivated: 0,
      inactivated: 0, manualOverrideSkipped: 0,
    },
    desired: { categories: 3_269, mappings: 3_269, automaticEligible: 144 },
    effective: {
      activeMappings: 3_269, allowed: 470, review: 1_950, excluded: 849, unknown: 0,
      tierA: 28, tierB: 116, tierC: 326, automaticEligible: 144,
    },
  } as const;
}

describe("first remote registry apply tooling", () => {
  it("mantém o apply client lazy e o secret fora do target serializado", async () => {
    let readClientCalls = 0;
    let applyClientCalls = 0;
    const resolved = resolveFirstRemoteRegistryApplyTarget(target, {
      resolveCredential: () => ({
        baseUrl: "https://nrwhzfahjypybjyajmrj.supabase.co",
        secret: "sb_secret_fake_live_canary",
        credentialResolveMs: 1,
      }),
      createReadClient: (_url, secret) => {
        readClientCalls += 1;
        expect(secret).toBe("sb_secret_fake_live_canary");
        return new ReadClient(new Store());
      },
      createApplyClient: (_url, secret) => {
        applyClientCalls += 1;
        expect(secret).toBe("sb_secret_fake_live_canary");
        return { rpc: async () => ({ data: rpcResult(), error: null }) };
      },
    });
    expect(readClientCalls).toBe(1);
    expect(applyClientCalls).toBe(0);
    expect(JSON.stringify(resolved)).not.toContain("sb_secret_fake_live_canary");
    await resolved.createApplyClient();
    expect(applyClientCalls).toBe(1);
  });

  it("gera preview LIVE exato e separa o token do C4C", async () => {
    const store = new Store();
    const envelope = await prepareFirstRemoteRegistryApplyPreview({
      target,
      readClient: new ReadClient(store),
      nowMs: () => 1,
    });
    expect(envelope).toMatchObject({
      contractVersion: "commerce-registry-first-remote-apply/v1",
      phase: "PREVIEW",
      projectRef: "nrwhzfahjypybjyajmrj",
      preview: {
        firstSync: true,
        current: { categories: 0, mappings: 0 },
        desired: { categoryCount: 3_269, mappingCount: 3_269, automaticEligibleCount: 144 },
        payload: { bytes: 1_603_538, sha256: FIRST_REMOTE_REGISTRY_PAYLOAD_SHA256 },
        safety: { previewStatus: "READY", rpcApplyCalls: 0 },
      },
    });
    expect(envelope.liveConfirmation.token).toMatch(
      /^AUTOACHADO:LIVE:REMOTE:MLB5672:3269:[A-F0-9]{12}$/,
    );
    expect(envelope.liveConfirmation.token).not.toBe(envelope.preview.fingerprint.token);
    expect(buildLiveRemoteConfirmationToken(envelope.preview)).toBe(envelope.liveConfirmation.token);
  }, 30_000);

  it("bloqueia token C4C/errado antes de resolver target, factory ou RPC", async () => {
    const store = new Store();
    let targetCalls = 0;
    let factoryCalls = 0;
    let rpcCalls = 0;
    await expect(runFirstRemoteRegistryApply({
      target,
      readClient: new ReadClient(store),
      confirmationMode: "PROVIDED_EXACT_TOKEN",
      readConfirmationToken: async (preview) => preview.fingerprint.token,
      resolveApplyTarget: () => {
        targetCalls += 1;
        return {
          target,
          readClient: new ReadClient(store),
          createApplyClient: async () => {
            factoryCalls += 1;
            return { rpc: async () => { rpcCalls += 1; return { data: rpcResult(), error: null }; } };
          },
        };
      },
      nowMs: () => 1,
    })).rejects.toMatchObject({ code: "REGISTRY_SYNC_CONFIRMATION_MISMATCH" });
    expect({ targetCalls, factoryCalls, rpcCalls }).toEqual({ targetCalls: 0, factoryCalls: 0, rpcCalls: 0 });
  }, 30_000);

  it("bloqueia estado remoto não vazio antes de confirmação/factory/RPC", async () => {
    const empty = new Store();
    const prepared = await prepareRegistrySyncRun({
      target,
      readClient: new ReadClient(empty),
      preset: automotiveRegistryDryRunPreset,
      firstSync: true,
      nowMs: () => 1,
    });
    const changed = new Store();
    const root = prepared.payload.rows.find((row) => row.externalCategoryId === "MLB5672")!;
    materialize(changed, { ...prepared.payload, rows: [root],
      context: { ...prepared.payload.context, expectedCategoryCount: 1, expectedMappingCount: 1,
        expectedAutomaticEligibleCount: 0 } });
    let confirmationCalls = 0;
    let targetCalls = 0;
    await expect(runFirstRemoteRegistryApply({
      target,
      readClient: new ReadClient(changed),
      confirmationMode: "PROVIDED_EXACT_TOKEN",
      readConfirmationToken: async () => { confirmationCalls += 1; return "never"; },
      resolveApplyTarget: () => { targetCalls += 1; throw new Error("never"); },
      nowMs: () => 1,
    })).rejects.toMatchObject({ code: "REGISTRY_SYNC_LIVE_REMOTE_STATE_CHANGED" });
    expect({ confirmationCalls, targetCalls }).toEqual({ confirmationCalls: 0, targetCalls: 0 });
  }, 30_000);

  it("bloqueia estado que muda após confirmação no prepare #2 antes da factory/RPC", async () => {
    const empty = new Store();
    const prepared = await prepareRegistrySyncRun({
      target,
      readClient: new ReadClient(empty),
      preset: automotiveRegistryDryRunPreset,
      firstSync: true,
      nowMs: () => 1,
    });
    const changed = new Store();
    const root = prepared.payload.rows.find((row) => row.externalCategoryId === "MLB5672")!;
    materialize(changed, {
      ...prepared.payload,
      rows: [root],
      context: {
        ...prepared.payload.context,
        expectedCategoryCount: 1,
        expectedMappingCount: 1,
        expectedAutomaticEligibleCount: 0,
      },
    });
    let targetCalls = 0;
    let factoryCalls = 0;
    let rpcCalls = 0;
    await expect(runFirstRemoteRegistryApply({
      target,
      readClient: new ReadClient(empty),
      confirmationMode: "PROVIDED_EXACT_TOKEN",
      readConfirmationToken: async (_preview, expected) => expected,
      resolveApplyTarget: () => {
        targetCalls += 1;
        return {
          target,
          readClient: new ReadClient(changed),
          createApplyClient: async () => {
            factoryCalls += 1;
            return { rpc: async () => { rpcCalls += 1; return { data: rpcResult(), error: null }; } };
          },
        };
      },
      nowMs: () => 1,
    })).rejects.toMatchObject({ code: "REGISTRY_SYNC_LIVE_REMOTE_STATE_CHANGED" });
    expect({ targetCalls, factoryCalls, rpcCalls }).toEqual({ targetCalls: 1, factoryCalls: 0, rpcCalls: 0 });
  }, 30_000);

  it("usa o payload exato do prepare #2, uma RPC, zero retry e converge estruturalmente", async () => {
    const store = new Store();
    let factoryCalls = 0;
    let rpcCalls = 0;
    let capturedPayload: Readonly<AtomicRegistryApplyPayload> | null = null;
    const applyClient: RegistryApplyRpcClient = {
      rpc: async (_name, args) => {
        rpcCalls += 1;
        capturedPayload = args.p_payload;
        materialize(store, args.p_payload);
        return { data: rpcResult(), error: null };
      },
    };
    const result = await runFirstRemoteRegistryApply({
      target,
      readClient: new ReadClient(store),
      confirmationMode: "PROVIDED_EXACT_TOKEN",
      readConfirmationToken: async (_preview, expected) => expected,
      resolveApplyTarget: () => ({
        target,
        readClient: new ReadClient(store),
        createApplyClient: async () => { factoryCalls += 1; return applyClient; },
      }),
      nowMs: () => 1,
    });
    expect(result.phase).toBe("RESULT");
    expect(result.applyResult.outcome).toBe("APPLIED_AND_VERIFIED");
    expect(result.applyResult.rpc).toMatchObject({ callCount: 1, retryCount: 0 });
    expect(result.applyResult.post).toMatchObject({ readSucceeded: true, converged: true });
    expect({ factoryCalls, rpcCalls }).toEqual({ factoryCalls: 1, rpcCalls: 1 });
    expect(capturedPayload).not.toBeNull();
    expect(sha256Utf8(JSON.stringify(capturedPayload))).toBe(FIRST_REMOTE_REGISTRY_PAYLOAD_SHA256);
  }, 60_000);

  it("valida integridade estrutural materializada e rejeita parent ausente", async () => {
    const store = new Store();
    const prepared = await prepareRegistrySyncRun({
      target,
      readClient: new ReadClient(store),
      preset: automotiveRegistryDryRunPreset,
      firstSync: true,
      nowMs: () => 1,
    });
    materialize(store, prepared.payload);
    const state = await import("../../../src/server/registry/current-state.js").then(
      ({ loadCurrentCommerceRegistryState }) => loadCurrentCommerceRegistryState({
        client: new ReadClient(store),
        marketplaceKey: "MERCADO_LIVRE",
        siteId: "MLB",
        verticalKey: "AUTOMOTIVE",
        rootExternalCategoryId: "MLB5672",
        desiredExternalCategoryIds: prepared.payload.rows.map((row) => row.externalCategoryId),
      }),
    );
    expect(validateFirstRemoteRegistryStructuralState(state)).toBe(true);
    const broken = {
      ...state,
      categories: state.categories.map((category, index) =>
        index === 1 ? { ...category, parentExternalCategoryId: "MISSING" } : category),
    };
    expect(validateFirstRemoteRegistryStructuralState(broken)).toBe(false);
  }, 60_000);
});
