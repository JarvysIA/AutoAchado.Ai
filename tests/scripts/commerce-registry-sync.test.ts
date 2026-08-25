import { describe, expect, it } from "vitest";
import type { RegistryReadClient } from "../../src/server/registry/current-state.js";
import type { RegistryApplyRpcClient } from "../../src/server/registry/executor.js";
import type { RegistrySyncApplyRunResult } from "../../src/server/registry/sync-apply.js";
import type { RegistrySyncPreview } from "../../src/server/registry/sync-preview.js";
import { registrySyncDryRunError } from "../../src/server/registry/sync-orchestrator.js";
import {
  parseRegistrySyncCliArgs,
  runCommerceRegistrySyncCli,
  type RegistrySyncCliDependencies,
} from "../../scripts/commerce-registry-sync.js";

const readClient = {} as RegistryReadClient;
const applyClient = {} as RegistryApplyRpcClient;
const target = Object.freeze({
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

function preview(status: "READY" | "BLOCKED" = "READY"): RegistrySyncPreview {
  return {
    contractVersion: "commerce-registry-sync-preview/v1",
    mode: "DRY_RUN",
    target,
    presetId: "AUTOMOTIVE_MLB_FROZEN_V1",
    firstSync: false,
    context: { marketplaceKey: "MERCADO_LIVRE", siteId: "MLB", verticalKey: "AUTOMOTIVE",
      rootExternalCategoryId: "MLB5672", sourceVersion: "source", expectedClassificationVersion: "classifier",
      configVersion: "config", checkedAt: "2026-08-21T17:03:43.000Z" },
    source: { schemaVersion: "snapshot/v1", checksum: "checksum", sourceVersion: "source",
      sourceContentCreated: "2026-08-21T17:03:43.000Z", checkedAt: "2026-08-21T17:03:43.000Z", nodeCount: 3_269 },
    current: { categories: 0, mappings: 0, controlledMappings: 0, digest: "digest" },
    desired: { categoryCount: 3_269, mappingCount: 3_269,
      scope: { allowed: 470, review: 1_950, excluded: 849, unknown: 0 },
      tiers: { A: 28, B: 116, C: 326 }, automaticEligibleCount: 144,
      rootExternalCategoryId: "MLB5672", sourceVersion: "source",
      classificationVersion: "classifier", configVersion: "config" },
    changes: { categories: { insert: 3_269, update: 0, unchanged: 0, reactivate: 0 },
      mappings: { insert: 3_269, update: 0, unchanged: 0, reactivate: 0, inactivate: 0, manual_override_skipped: 0 } },
    payload: { bytes: 1_603_538, kibibytes: 1_566, mebibytes: 1.529,
      sha256: "payload", rpcWrapperBytesEstimate: 1_603_552 },
    samples: { categories: { insert: [], update: [], unchanged: [], reactivate: [] },
      mappings: { insert: [], update: [], unchanged: [], reactivate: [], inactivate: [], manual_override_skipped: [] } },
    safety: { previewStatus: status, writeCapability: "DISABLED_IN_THIS_BUILD", rpcApplyCalls: 0,
      warnings: [], blockers: status === "READY" ? [] : ["REGISTRY_SYNC_EXPECTATION_MISMATCH"] },
    fingerprint: { algorithm: "sha256", value: "abcdef", token: "AUTOACHADO:LOCAL:MLB5672:3269:ABCDEF" },
    performance: { sourceLoadMs: 1, plannerMs: 1, payloadBuildMs: 1, payloadSerializationMs: 1,
      currentReadMs: 1, diffMs: 1, previewMs: 1, totalMs: 7 },
  };
}

function applyResult(value = preview()): RegistrySyncApplyRunResult {
  return {
    contractVersion: "commerce-registry-sync-apply-run/v1",
    outcome: "APPLIED_AND_VERIFIED",
    preview: value,
    confirmation: { mode: "PROVIDED_EXACT_TOKEN", verified: true },
    rpc: { result: null, errorCode: null, callCount: 1, retryCount: 0 },
    post: { readAttempted: true, readSucceeded: true, currentSummary: null, currentDigest: "post",
      diffSummary: null, converged: true, rpcPreConsistent: true, effectiveConsistent: true },
    performance: { initialPrepareMs: 1, confirmationWaitMs: 0, refreshedPrepareMs: 1,
      rpcMs: 1, postReadMs: 1, postDiffMs: 1, executionMs: 5 },
  };
}

function harness(value: RegistrySyncPreview = preview(), options: { tty?: boolean; entered?: string | undefined } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let targetCalls = 0;
  let remoteTargetCalls = 0;
  let applyTargetCalls = 0;
  let dryCalls = 0;
  let applyCalls = 0;
  let promptCalls = 0;
  let applyFactoryCalls = 0;
  let firstSync: boolean | null = null;
  const dependencies: RegistrySyncCliDependencies = {
    resolveLocalTarget: () => { targetCalls += 1; return { target, readClient }; },
    resolveRemoteTarget: () => {
      remoteTargetCalls += 1;
      return { target: remoteTarget, readClient, credentialResolveMs: 1 };
    },
    resolveLocalApplyTarget: () => {
      applyTargetCalls += 1;
      return { target, readClient, createApplyClient: async () => { applyFactoryCalls += 1; return applyClient; } };
    },
    runDryRun: async (input) => { dryCalls += 1; firstSync = input.firstSync; return value; },
    runApply: async (input) => {
      applyCalls += 1;
      firstSync = input.firstSync;
      const supplied = await input.readConfirmationToken(value);
      if (supplied !== value.fingerprint.token) {
        throw registrySyncDryRunError("REGISTRY_SYNC_CONFIRMATION_MISMATCH", "mismatch");
      }
      return { ...applyResult(value), confirmation: { mode: input.confirmationMode, verified: true } };
    },
    isTty: () => options.tty === true,
    readConfirmationToken: async () => { promptCalls += 1; return options.entered ?? value.fingerprint.token; },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  };
  return { dependencies, stdout, stderr, calls: () => ({
    targetCalls, remoteTargetCalls, applyTargetCalls, dryCalls, applyCalls, promptCalls, applyFactoryCalls, firstSync,
  }) };
}

describe("commerce registry sync CLI", () => {
  it("parseia as flags C4C estritamente", () => {
    expect(parseRegistrySyncCliArgs([])).toEqual({
      json: false, firstSync: false, apply: false, remote: false, confirmationToken: null,
    });
    expect(parseRegistrySyncCliArgs(["--apply", "--confirm", " token "])).toEqual({
      json: false, firstSync: false, apply: true, remote: false, confirmationToken: " token ",
    });
    expect(parseRegistrySyncCliArgs(["--", "--first-sync", "--json"])).toEqual({
      json: true, firstSync: true, apply: false, remote: false, confirmationToken: null,
    });
    expect(parseRegistrySyncCliArgs(["--remote", "--first-sync"])).toEqual({
      json: false, firstSync: true, apply: false, remote: true, confirmationToken: null,
    });
    for (const args of [
      ["--confirm"], ["--confirm", "token"], ["--wat"], ["--json", "--json"],
      ["--apply", "--confirm", "one", "--confirm", "two"],
    ]) expect(() => parseRegistrySyncCliArgs(args)).toThrowError(/Argumentos inválidos/);
    expect(() => parseRegistrySyncCliArgs(["--remote", "--apply", "--confirm", "anything"]))
      .toThrowError(/Apply remoto indisponível/);
  });

  it.each([
    [["--remote", "--apply"], "REGISTRY_SYNC_REMOTE_APPLY_NOT_ENABLED", 1],
    [["--remote", "--apply", "--confirm", "anything"], "REGISTRY_SYNC_REMOTE_APPLY_NOT_ENABLED", 1],
    [["--remote", "--confirm", "anything"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
    [["--confirm", "token"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
    [["--wat"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
    [["--json", "--json"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
  ] as const)("bloqueia %j antes de target/read/apply", async (args, marker, exitCode) => {
    const test = harness();
    await expect(runCommerceRegistrySyncCli(args, test.dependencies)).resolves.toBe(exitCode);
    expect(test.calls()).toMatchObject({ targetCalls: 0, remoteTargetCalls: 0, applyTargetCalls: 0, dryCalls: 0, applyCalls: 0 });
    expect(test.stderr.join("")).toContain(marker);
  });

  it.each([["--apply"], ["--apply", "--json"]])(
    "exige confirmação antes do target em %j",
    async (...args) => {
      const test = harness();
      await expect(runCommerceRegistrySyncCli(args, test.dependencies)).resolves.toBe(1);
      expect(test.stderr.join("")).toContain("REGISTRY_SYNC_CONFIRMATION_REQUIRED");
      expect(test.calls()).toMatchObject({ targetCalls: 0, applyTargetCalls: 0, applyCalls: 0 });
    },
  );

  it("preserva default e first-sync como dry-run com zero apply", async () => {
    const plain = harness();
    await expect(runCommerceRegistrySyncCli([], plain.dependencies)).resolves.toBe(0);
    expect(plain.calls()).toMatchObject({ targetCalls: 1, dryCalls: 1, applyCalls: 0, firstSync: false });
    expect(plain.stdout.join("")).toContain("DRY_RUN_OK");
    const first = harness();
    await expect(runCommerceRegistrySyncCli(["--first-sync"], first.dependencies)).resolves.toBe(0);
    expect(first.calls()).toMatchObject({ targetCalls: 1, dryCalls: 1, applyCalls: 0, firstSync: true });
  });

  it("emite exatamente um objeto no JSON dry-run", async () => {
    const test = harness();
    await expect(runCommerceRegistrySyncCli(["--json"], test.dependencies)).resolves.toBe(0);
    expect(test.stderr).toEqual([]);
    expect(test.stdout).toHaveLength(1);
    expect(JSON.parse(test.stdout[0]!)).toMatchObject({ mode: "DRY_RUN", safety: { rpcApplyCalls: 0 } });
  });

  it.each([
    ["human", ["--remote"]],
    ["json", ["--remote", "--json"]],
    ["first-sync", ["--remote", "--first-sync"]],
    ["first-sync JSON", ["--remote", "--first-sync", "--json"]],
  ])("roteia remote dry-run read-only em %s", async (_name, args) => {
    const value = { ...preview(), target: remoteTarget,
      fingerprint: { algorithm: "sha256" as const, value: "remote", token: "AUTOACHADO:REMOTE:MLB5672:3269:ABCDEF123456" } };
    const test = harness(value);
    await expect(runCommerceRegistrySyncCli(args, test.dependencies)).resolves.toBe(0);
    expect(test.calls()).toMatchObject({ targetCalls: 0, remoteTargetCalls: 1, dryCalls: 1, applyCalls: 0 });
    const output = test.stdout.join("");
    if (args.includes("--json")) expect(JSON.parse(output)).toMatchObject({ target: { kind: "REMOTE" } });
    else expect(output).toContain("AUTOACHADO REGISTRY SYNC — REMOTE READ-ONLY");
  });

  it("encaminha token fornecido e emite um objeto JSON de apply", async () => {
    const test = harness();
    const token = preview().fingerprint.token;
    await expect(runCommerceRegistrySyncCli(["--apply", "--confirm", token, "--json"], test.dependencies)).resolves.toBe(0);
    expect(test.stdout).toHaveLength(1);
    expect(JSON.parse(test.stdout[0]!)).toMatchObject({ outcome: "APPLIED_AND_VERIFIED", rpc: { callCount: 1 } });
    expect(test.calls()).toMatchObject({ targetCalls: 1, applyCalls: 1, promptCalls: 0 });
  });

  it("aceita confirmação TTY exata e imprime preview uma única vez", async () => {
    const test = harness(preview(), { tty: true });
    await expect(runCommerceRegistrySyncCli(["--apply"], test.dependencies)).resolves.toBe(0);
    expect(test.calls()).toMatchObject({ targetCalls: 1, applyCalls: 1, promptCalls: 1 });
    expect(test.stdout.join("").match(/AUTOACHADO REGISTRY SYNC — DRY RUN/g)).toHaveLength(1);
    expect(test.stdout.join("")).toContain("APPLIED_AND_VERIFIED");
  });

  it.each([
    { args: ["--apply", "--confirm", "wrong"], tty: false, entered: undefined },
    { args: ["--apply"], tty: true, entered: "wrong" },
  ])("bloqueia confirmação divergente com zero sucesso de apply: $args", async ({ args, tty, entered }) => {
    const test = harness(preview(), { tty, entered });
    await expect(runCommerceRegistrySyncCli(args, test.dependencies)).resolves.toBe(1);
    expect(test.stderr.join("")).toContain("REGISTRY_SYNC_CONFIRMATION_MISMATCH");
    expect(test.calls()).toMatchObject({ targetCalls: 1, applyCalls: 1 });
  });

  it("propaga stale/blocked marker sanitizado e não cria output de sucesso", async () => {
    const test = harness();
    const dependencies: RegistrySyncCliDependencies = {
      ...test.dependencies,
      runApply: async () => {
        throw registrySyncDryRunError("REGISTRY_SYNC_CONFIRMATION_MISMATCH", "stale");
      },
    };
    await expect(runCommerceRegistrySyncCli([
      "--apply", "--confirm", preview().fingerprint.token, "--json",
    ], dependencies)).resolves.toBe(1);
    expect(test.stdout).toEqual([]);
    expect(JSON.parse(test.stderr[0]!)).toEqual({ error: { code: "REGISTRY_SYNC_CONFIRMATION_MISMATCH" } });
  });

  it("não vaza canário em falha operacional", async () => {
    const test = harness();
    const dependencies: RegistrySyncCliDependencies = {
      ...test.dependencies,
      resolveLocalTarget: () => { throw new Error("sb_secret_fake_canary Authorization apikey Bearer"); },
    };
    await expect(runCommerceRegistrySyncCli(["--json"], dependencies)).resolves.toBe(1);
    const output = [...test.stdout, ...test.stderr].join("");
    expect(output).toContain("REGISTRY_SYNC_DRY_RUN_FAILED");
    expect(output).not.toMatch(/sb_secret_|Authorization|apikey|Bearer/);
  });
});
