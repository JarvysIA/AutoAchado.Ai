import { describe, expect, it } from "vitest";
import type { RegistryReadClient } from "../../src/server/registry/current-state.js";
import type { RegistryApplyRpcClient } from "../../src/server/registry/executor.js";
import type {
  FirstRemoteRegistryApplyResultEnvelope,
  FirstRemoteRegistryPreviewEnvelope,
} from "../../src/server/registry/first-remote-sync-apply.js";
import type { RegistrySyncApplyRunResult } from "../../src/server/registry/sync-apply.js";
import { registrySyncDryRunError } from "../../src/server/registry/sync-orchestrator.js";
import type { RegistrySyncPreview } from "../../src/server/registry/sync-preview.js";
import {
  parseFirstRemoteRegistryApplyCliArgs,
  runFirstRemoteRegistryApplyCli,
  type FirstRemoteRegistryApplyCliDependencies,
} from "../../scripts/commerce-registry-first-remote-apply.js";

const readClient = {} as RegistryReadClient;
const applyClient = {} as RegistryApplyRpcClient;
const target = Object.freeze({
  kind: "REMOTE" as const,
  label: "REMOTE" as const,
  projectRef: "nrwhzfahjypybjyajmrj" as const,
  baseUrl: "https://nrwhzfahjypybjyajmrj.supabase.co",
});
const fingerprint = "a".repeat(64);
const c4cToken = "AUTOACHADO:REMOTE:MLB5672:3269:" + "A".repeat(12);
const liveToken = "AUTOACHADO:LIVE:REMOTE:MLB5672:3269:" + "A".repeat(12);

function preview(): RegistrySyncPreview {
  return {
    contractVersion: "commerce-registry-sync-preview/v1",
    mode: "DRY_RUN",
    target,
    presetId: "AUTOMOTIVE_MLB_FROZEN_V1",
    firstSync: true,
    context: {
      marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
      rootExternalCategoryId: "MLB5672", sourceVersion: "source",
      expectedClassificationVersion: "classifier", configVersion: "config",
      checkedAt: "2026-08-21T17:03:43.000Z",
    },
    source: {
      schemaVersion: "snapshot/v1", checksum: "checksum", sourceVersion: "source",
      sourceContentCreated: "2026-08-21T17:03:43.000Z",
      checkedAt: "2026-08-21T17:03:43.000Z", nodeCount: 3_269,
    },
    current: { categories: 0, mappings: 0, controlledMappings: 0, digest: "digest" },
    desired: {
      categoryCount: 3_269, mappingCount: 3_269,
      scope: { allowed: 470, review: 1_950, excluded: 849, unknown: 0 },
      tiers: { A: 28, B: 116, C: 326 }, automaticEligibleCount: 144,
      rootExternalCategoryId: "MLB5672", sourceVersion: "source",
      classificationVersion: "classifier", configVersion: "config",
    },
    changes: {
      categories: { insert: 3_269, update: 0, unchanged: 0, reactivate: 0 },
      mappings: {
        insert: 3_269, update: 0, unchanged: 0, reactivate: 0,
        inactivate: 0, manual_override_skipped: 0,
      },
    },
    payload: {
      bytes: 1_603_538, kibibytes: 1_566, mebibytes: 1.529,
      sha256: "payload", rpcWrapperBytesEstimate: 1_603_552,
    },
    samples: {
      categories: { insert: [], update: [], unchanged: [], reactivate: [] },
      mappings: {
        insert: [], update: [], unchanged: [], reactivate: [],
        inactivate: [], manual_override_skipped: [],
      },
    },
    safety: {
      previewStatus: "READY", writeCapability: "DISABLED_IN_THIS_BUILD",
      rpcApplyCalls: 0, warnings: [], blockers: [],
    },
    fingerprint: { algorithm: "sha256", value: fingerprint, token: c4cToken },
    performance: {
      sourceLoadMs: 1, plannerMs: 1, payloadBuildMs: 1, payloadSerializationMs: 1,
      currentReadMs: 1, diffMs: 1, previewMs: 1, totalMs: 7,
    },
  };
}

function previewEnvelope(): FirstRemoteRegistryPreviewEnvelope {
  const value = preview();
  return {
    contractVersion: "commerce-registry-first-remote-apply/v1",
    phase: "PREVIEW",
    projectRef: target.projectRef,
    preview: value,
    liveConfirmation: { fingerprint, token: liveToken, verified: false, mode: null },
    performance: value.performance,
  };
}

function applyRun(): RegistrySyncApplyRunResult {
  return {
    contractVersion: "commerce-registry-sync-apply-run/v1",
    outcome: "APPLIED_AND_VERIFIED",
    preview: preview(),
    confirmation: { mode: "PROVIDED_EXACT_TOKEN", verified: true },
    rpc: { result: null, errorCode: null, callCount: 1, retryCount: 0 },
    post: {
      readAttempted: true, readSucceeded: true, currentSummary: null,
      currentDigest: "post", diffSummary: null, converged: true,
      rpcPreConsistent: true, effectiveConsistent: true,
    },
    performance: {
      initialPrepareMs: 1, confirmationWaitMs: 0, refreshedPrepareMs: 1,
      rpcMs: 1, postReadMs: 1, postDiffMs: 1, executionMs: 5,
    },
  };
}

function resultEnvelope(mode: "INTERACTIVE_EXACT_TOKEN" | "PROVIDED_EXACT_TOKEN"):
FirstRemoteRegistryApplyResultEnvelope {
  const run = { ...applyRun(), confirmation: { mode, verified: true as const } };
  return {
    contractVersion: "commerce-registry-first-remote-apply/v1",
    phase: "RESULT",
    projectRef: target.projectRef,
    preview: run.preview,
    liveConfirmation: { fingerprint, token: liveToken, verified: true, mode },
    confirmation: run.confirmation,
    applyResult: run,
    performance: run.performance,
  };
}

function harness(options: { tty?: boolean; entered?: string; resolverError?: Error } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let readTargetCalls = 0;
  let previewCalls = 0;
  let runApplyCalls = 0;
  let applyTargetCalls = 0;
  let factoryCalls = 0;
  let promptCalls = 0;
  const dependencies: FirstRemoteRegistryApplyCliDependencies = {
    resolveRemoteReadTarget: () => {
      readTargetCalls += 1;
      if (options.resolverError) throw options.resolverError;
      return { target, readClient, credentialResolveMs: 1 };
    },
    preparePreview: async () => { previewCalls += 1; return previewEnvelope(); },
    runApply: async (input) => {
      runApplyCalls += 1;
      const supplied = await input.readConfirmationToken(preview(), liveToken);
      if (supplied.trim() !== liveToken) {
        throw registrySyncDryRunError("REGISTRY_SYNC_CONFIRMATION_MISMATCH", "mismatch");
      }
      const resolved = await input.resolveApplyTarget!(target);
      await resolved.createApplyClient();
      return resultEnvelope(input.confirmationMode);
    },
    resolveRemoteApplyTarget: () => {
      applyTargetCalls += 1;
      return {
        target,
        readClient,
        createApplyClient: async () => { factoryCalls += 1; return applyClient; },
      };
    },
    isTty: () => options.tty === true,
    readConfirmationToken: async () => {
      promptCalls += 1;
      return options.entered ?? liveToken;
    },
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  };
  return {
    dependencies,
    stdout,
    stderr,
    calls: () => ({
      readTargetCalls, previewCalls, runApplyCalls, applyTargetCalls, factoryCalls, promptCalls,
    }),
  };
}

describe("first remote registry apply CLI", () => {
  it("parseia somente preview/json/confirm e rejeita superfície genérica", () => {
    expect(parseFirstRemoteRegistryApplyCliArgs(["--preview", "--json"])).toEqual({
      preview: true, json: true, confirmationToken: null,
    });
    expect(parseFirstRemoteRegistryApplyCliArgs(["--confirm", liveToken])).toEqual({
      preview: false, json: false, confirmationToken: liveToken,
    });
    for (const args of [
      ["--remote"], ["--apply"], ["--first-sync"], ["--force"], ["--yes"], ["--wat"],
      ["--json", "--json"], ["--confirm"], ["--preview", "--confirm", liveToken],
    ]) expect(() => parseFirstRemoteRegistryApplyCliArgs(args)).toThrowError(/Argumentos|Preview/);
  });

  it.each([{ args: [] }, { args: ["--json"] }])(
    "exige confirmação fora de TTY antes de credencial/read: $args",
    async ({ args }) => {
      const test = harness();
      await expect(runFirstRemoteRegistryApplyCli(args, test.dependencies)).resolves.toBe(1);
      expect(test.stderr.join("")).toContain("REGISTRY_SYNC_CONFIRMATION_REQUIRED");
      expect(test.calls()).toMatchObject({ readTargetCalls: 0, runApplyCalls: 0, applyTargetCalls: 0 });
    },
  );

  it("executa preview human read-only sem apply target/factory", async () => {
    const test = harness();
    await expect(runFirstRemoteRegistryApplyCli(["--preview"], test.dependencies)).resolves.toBe(0);
    expect(test.stdout.join("")).toContain("REMOTE WRITE\n  NOT EXECUTED");
    expect(test.calls()).toEqual({
      readTargetCalls: 1, previewCalls: 1, runApplyCalls: 0,
      applyTargetCalls: 0, factoryCalls: 0, promptCalls: 0,
    });
  });

  it("emite exatamente um envelope JSON no preview", async () => {
    const test = harness();
    await expect(runFirstRemoteRegistryApplyCli(["--preview", "--json"], test.dependencies)).resolves.toBe(0);
    expect(test.stdout).toHaveLength(1);
    expect(JSON.parse(test.stdout[0]!)).toMatchObject({
      contractVersion: "commerce-registry-first-remote-apply/v1",
      phase: "PREVIEW",
      liveConfirmation: { token: liveToken, verified: false },
    });
  });

  it("encaminha confirmação LIVE fornecida e usa o path dedicado uma vez", async () => {
    const test = harness();
    await expect(runFirstRemoteRegistryApplyCli([
      "--confirm", liveToken, "--json",
    ], test.dependencies)).resolves.toBe(0);
    expect(JSON.parse(test.stdout[0]!)).toMatchObject({
      phase: "RESULT", applyResult: { outcome: "APPLIED_AND_VERIFIED", rpc: { callCount: 1 } },
    });
    expect(test.calls()).toMatchObject({
      readTargetCalls: 1, runApplyCalls: 1, applyTargetCalls: 1, factoryCalls: 1, promptCalls: 0,
    });
  });

  it("aceita somente token exato no fluxo TTY", async () => {
    const exact = harness({ tty: true });
    await expect(runFirstRemoteRegistryApplyCli([], exact.dependencies)).resolves.toBe(0);
    expect(exact.stdout.join("")).toContain("AUTOACHADO REGISTRY — FIRST REMOTE APPLY");
    expect(exact.calls()).toMatchObject({ promptCalls: 1, applyTargetCalls: 1, factoryCalls: 1 });

    const wrong = harness({ tty: true, entered: "yes" });
    await expect(runFirstRemoteRegistryApplyCli([], wrong.dependencies)).resolves.toBe(1);
    expect(wrong.stderr.join("")).toContain("REGISTRY_SYNC_CONFIRMATION_MISMATCH");
    expect(wrong.calls()).toMatchObject({ promptCalls: 1, applyTargetCalls: 0, factoryCalls: 0 });
  });

  it.each([["wrong"], [c4cToken]])(
    "rejeita token fornecido não-LIVE antes de apply target/factory: %s",
    async (token) => {
      const test = harness();
      await expect(runFirstRemoteRegistryApplyCli([
        "--confirm", token,
      ], test.dependencies)).resolves.toBe(1);
      expect(test.stderr.join("")).toContain("REGISTRY_SYNC_CONFIRMATION_MISMATCH");
      expect(test.calls()).toMatchObject({ applyTargetCalls: 0, factoryCalls: 0 });
    },
  );

  it("rejeita flags inválidas antes de credencial/read", async () => {
    const test = harness();
    await expect(runFirstRemoteRegistryApplyCli(["--remote"], test.dependencies)).resolves.toBe(2);
    expect(test.calls()).toMatchObject({ readTargetCalls: 0, runApplyCalls: 0 });
  });

  it("sanitiza erro inesperado sem vazar canário", async () => {
    const test = harness({ resolverError: new Error("sb_secret_fake_canary Authorization Bearer") });
    await expect(runFirstRemoteRegistryApplyCli(["--preview", "--json"], test.dependencies)).resolves.toBe(1);
    const output = [...test.stdout, ...test.stderr].join("");
    expect(output).toContain("REGISTRY_SYNC_DRY_RUN_FAILED");
    expect(output).not.toMatch(/sb_secret_|Authorization|Bearer/);
  });
});
