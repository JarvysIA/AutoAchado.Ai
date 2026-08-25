import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildAtomicRegistryApplyPayload } from "../../../src/commerce/registry/apply-payload.js";
import { RegistrySyncError } from "../../../src/commerce/registry/errors.js";
import { buildCommerceRegistrySyncPlan } from "../../../src/commerce/registry/planner.js";
import type { CommerceRegistrySyncPlan } from "../../../src/commerce/registry/types.js";
import {
  applyCommerceRegistrySync,
  callAtomicRegistryApplyRpc,
  type RegistryApplyRpcClient,
  type RegistryApplyRpcResult,
} from "../../../src/server/registry/executor.js";
import { TaxonomyTree } from "../../../src/taxonomy/tree.js";

function plan(): CommerceRegistrySyncPlan {
  return buildCommerceRegistrySyncPlan({
    context: {
      marketplaceKey: "MARKET", siteId: "SITE", verticalKey: "VERTICAL", rootExternalCategoryId: "ROOT",
      sourceVersion: "source/v1", expectedClassificationVersion: "classifier/v1",
      configVersion: "commerce-registry-sync/v1", checkedAt: "2026-08-24T12:00:00.000Z",
    },
    taxonomyTree: new TaxonomyTree([{
      marketplaceKey: "MARKET", siteId: "SITE", externalCategoryId: "ROOT", name: "Root",
      parentExternalCategoryId: null, childrenExternalCategoryIds: [], pathExternalCategoryIds: ["ROOT"],
      pathNames: ["Root"], isLeaf: true,
    }], { requiredRootId: "ROOT" }),
    classifyCategory: (id) => ({
      externalCategoryId: id, scopeStatus: "ALLOWED", priorityTier: "A", familyKey: "parts",
      commercialFamilyKeyDefault: "parts", ruleId: "rule.root", classificationVersion: "classifier/v1", reason: "fixture",
    }),
  });
}

function validResult() {
  return {
    contractVersion: "commerce-registry-apply-result/v1", marketplaceKey: "MARKET", siteId: "SITE",
    verticalKey: "VERTICAL", rootExternalCategoryId: "ROOT", sourceVersion: "source/v1",
    classificationVersion: "classifier/v1",
    categories: { inserted: 1, updated: 0, unchanged: 0, reactivated: 0 },
    mappings: { inserted: 1, updated: 0, unchanged: 0, reactivated: 0, inactivated: 0, manualOverrideSkipped: 0 },
    desired: { categories: 1, mappings: 1, automaticEligible: 1 },
    effective: { activeMappings: 1, allowed: 1, review: 0, excluded: 0, unknown: 0,
      tierA: 1, tierB: 0, tierC: 0, automaticEligible: 1 },
  };
}

class FakeClient implements RegistryApplyRpcClient {
  readonly calls: Array<{ functionName: string; args: unknown }> = [];
  constructor(private readonly response: RegistryApplyRpcResult | Error = { data: validResult(), error: null }) {}
  rpc(functionName: "apply_commerce_registry_sync", args: any): PromiseLike<RegistryApplyRpcResult> {
    this.calls.push({ functionName, args });
    if (this.response instanceof Error) return Promise.reject(this.response);
    return Promise.resolve(this.response);
  }
}

describe("server-side registry persistence executor", () => {
  it("constrói o payload aprovado e executa exatamente uma RPC sem diff", async () => {
    const inputPlan = plan();
    const client = new FakeClient();
    await expect(applyCommerceRegistrySync({ client, plan: inputPlan })).resolves.toEqual(validResult());
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]).toEqual({
      functionName: "apply_commerce_registry_sync",
      args: { p_payload: buildAtomicRegistryApplyPayload(inputPlan) },
    });
    expect(JSON.stringify(client.calls[0])).not.toContain('"diff"');
  });

  it("aceita o payload já preparado e preserva a autoridade de uma única RPC", async () => {
    const payload = buildAtomicRegistryApplyPayload(plan());
    const client = new FakeClient();
    await expect(applyCommerceRegistrySync({ client, payload })).resolves.toEqual(validResult());
    expect(client.calls).toEqual([{
      functionName: "apply_commerce_registry_sync",
      args: { p_payload: payload },
    }]);
  });

  it("bloqueia payload preparado inválido antes da RPC", async () => {
    const payload: any = JSON.parse(JSON.stringify(buildAtomicRegistryApplyPayload(plan())));
    payload.context.expectedCategoryCount = 2;
    const client = new FakeClient();
    await expect(applyCommerceRegistrySync({ client, payload })).rejects.toBeInstanceOf(RegistrySyncError);
    expect(client.calls).toHaveLength(0);
  });

  it.each([
    "REGISTRY_SYNC_LOCKED", "REGISTRY_MARKETPLACE_NOT_FOUND", "REGISTRY_VERTICAL_NOT_FOUND",
    "REGISTRY_INVALID_PAYLOAD", "REGISTRY_COUNT_MISMATCH", "REGISTRY_DUPLICATE_CATEGORY",
    "REGISTRY_PARENT_MISSING", "REGISTRY_PATH_INVALID", "REGISTRY_CLASSIFICATION_INVALID",
  ] as const)("mapeia marker conhecido %s sem propagar payload", async (marker) => {
    const client = new FakeClient({ data: null, error: { message: marker, details: "sanitized" } });
    await expect(applyCommerceRegistrySync({ client, plan: plan() })).rejects.toMatchObject({ code: marker });
  });

  it("mapeia erro RPC desconhecido e falha de transporte para código sanitizado", async () => {
    for (const client of [new FakeClient({ data: null, error: { message: "opaque" } }), new FakeClient(new Error("sensitive"))]) {
      await expect(applyCommerceRegistrySync({ client, plan: plan() })).rejects.toMatchObject({
        code: "REGISTRY_ATOMIC_APPLY_FAILED", message: "Falha sanitizada no apply atômico do registry",
      });
    }
  });

  it("rejeita data null pelo validator existente", async () => {
    await expect(applyCommerceRegistrySync({ client: new FakeClient({ data: null, error: null }), plan: plan() }))
      .rejects.toMatchObject({ code: "REGISTRY_APPLY_RESULT_INVALID" });
  });

  it("rejeita contexto divergente sem adaptar o contrato", async () => {
    const response = { ...validResult(), siteId: "OTHER" };
    await expect(applyCommerceRegistrySync({ client: new FakeClient({ data: response, error: null }), plan: plan() }))
      .rejects.toMatchObject({ code: "REGISTRY_APPLY_RESULT_CONTEXT_MISMATCH" });
  });

  it("valida payload antes de chamar a RPC lower-level", async () => {
    const payload: any = JSON.parse(JSON.stringify(buildAtomicRegistryApplyPayload(plan())));
    payload.context.expectedCategoryCount = 2;
    const client = new FakeClient();
    await expect(callAtomicRegistryApplyRpc(client, payload)).rejects.toBeInstanceOf(RegistrySyncError);
    expect(client.calls).toHaveLength(0);
  });

  it("não contém operações de tabela ou superfície HTTP", async () => {
    const source = await readFile(new URL("../../../src/server/registry/executor.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/router|route|Request|Response/);
  });
});
