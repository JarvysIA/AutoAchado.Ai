import { describe, expect, it } from "vitest";
import type { RegistryReadClient } from "../../src/server/registry/current-state.js";
import type { RegistrySyncPreview } from "../../src/server/registry/sync-preview.js";
import {
  parseRegistrySyncCliArgs,
  runCommerceRegistrySyncCli,
  type RegistrySyncCliDependencies,
} from "../../scripts/commerce-registry-sync.js";

const readClient = {} as RegistryReadClient;

function preview(status: "READY" | "BLOCKED" = "READY"): RegistrySyncPreview {
  return {
    contractVersion: "commerce-registry-sync-preview/v1",
    mode: "DRY_RUN",
    target: { kind: "LOCAL", label: "LOCAL", projectRef: null, baseUrl: "http://127.0.0.1:54321" },
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

function harness(result: RegistrySyncPreview = preview()) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let targetCalls = 0;
  let runCalls = 0;
  let firstSync: boolean | null = null;
  const dependencies: RegistrySyncCliDependencies = {
    resolveTarget: () => { targetCalls += 1; return { target: result.target, readClient }; },
    runDryRun: async (input) => { runCalls += 1; firstSync = input.firstSync; return result; },
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
  };
  return { dependencies, stdout, stderr,
    calls: () => ({ targetCalls, runCalls, firstSync }) };
}

describe("commerce registry sync CLI", () => {
  it("aceita somente as flags read-only do C4A", () => {
    expect(parseRegistrySyncCliArgs([])).toEqual({ json: false, firstSync: false });
    expect(parseRegistrySyncCliArgs(["--json", "--first-sync"])).toEqual({ json: true, firstSync: true });
    expect(parseRegistrySyncCliArgs(["--", "--first-sync"])).toEqual({ json: false, firstSync: true });
    expect(() => parseRegistrySyncCliArgs(["--apply"])).toThrowError(/Apply indisponível/);
    expect(() => parseRegistrySyncCliArgs(["--remote"])).toThrowError(/Remote indisponível/);
    expect(() => parseRegistrySyncCliArgs(["--confirm", "token"])).toThrowError(/Argumentos inválidos/);
    expect(() => parseRegistrySyncCliArgs(["--wat"])).toThrowError(/Argumentos inválidos/);
    expect(() => parseRegistrySyncCliArgs(["--json", "--json"])).toThrowError(/Argumentos inválidos/);
  });

  it.each([
    [["--apply"], "REGISTRY_SYNC_APPLY_NOT_ENABLED", 1],
    [["--remote"], "REGISTRY_SYNC_REMOTE_NOT_ENABLED", 1],
    [["--confirm", "token"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
    [["--wat"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
    [["--json", "--json"], "REGISTRY_SYNC_INVALID_ARGUMENTS", 2],
  ] as const)("bloqueia %j antes de target/read", async (args, marker, exitCode) => {
    const test = harness();
    await expect(runCommerceRegistrySyncCli(args, test.dependencies)).resolves.toBe(exitCode);
    expect(test.calls()).toEqual({ targetCalls: 0, runCalls: 0, firstSync: null });
    expect(test.stderr.join("")).toContain(marker);
  });

  it("executa default local dry-run e encaminha first-sync", async () => {
    const plain = harness();
    await expect(runCommerceRegistrySyncCli([], plain.dependencies)).resolves.toBe(0);
    expect(plain.calls()).toEqual({ targetCalls: 1, runCalls: 1, firstSync: false });
    expect(plain.stdout.join("")).toContain("DRY_RUN_OK");

    const first = harness();
    await expect(runCommerceRegistrySyncCli(["--first-sync"], first.dependencies)).resolves.toBe(0);
    expect(first.calls()).toEqual({ targetCalls: 1, runCalls: 1, firstSync: true });
  });

  it("emite exatamente um objeto no JSON mode", async () => {
    const test = harness();
    await expect(runCommerceRegistrySyncCli(["--json"], test.dependencies)).resolves.toBe(0);
    expect(test.stderr).toEqual([]);
    expect(test.stdout).toHaveLength(1);
    expect(JSON.parse(test.stdout[0]!)).toMatchObject({ mode: "DRY_RUN", safety: { rpcApplyCalls: 0 } });
  });

  it("retorna blocker com exit 1", async () => {
    const test = harness(preview("BLOCKED"));
    await expect(runCommerceRegistrySyncCli([], test.dependencies)).resolves.toBe(1);
    expect(test.stdout.join("")).toContain("BLOCKED:REGISTRY_SYNC_EXPECTATION_MISMATCH");
  });

  it("sanitiza falha operacional e não propaga canário", async () => {
    const test = harness();
    const dependencies: RegistrySyncCliDependencies = {
      ...test.dependencies,
      resolveTarget: () => { throw new Error("sb_secret_fake_canary Authorization apikey"); },
    };
    await expect(runCommerceRegistrySyncCli(["--json"], dependencies)).resolves.toBe(1);
    const output = [...test.stdout, ...test.stderr].join("");
    expect(output).toContain("REGISTRY_SYNC_DRY_RUN_FAILED");
    expect(output).not.toMatch(/sb_secret_|Authorization|apikey/);
  });
});
