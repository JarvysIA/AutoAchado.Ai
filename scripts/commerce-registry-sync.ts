import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RegistrySyncError } from "../src/commerce/registry/errors.js";
import {
  resolveLocalRegistryAdminTarget,
  resolveLocalRegistryApplyTarget,
} from "../src/server/registry/admin-target.js";
import { automotiveRegistryDryRunPreset } from "../src/server/registry/automotive-registry-preset.js";
import type {
  RegistrySyncApplyRunResult,
  RunRegistrySyncApplyInput,
} from "../src/server/registry/sync-apply.js";
import {
  RegistrySyncDryRunError,
  registrySyncDryRunError,
  runRegistrySyncDryRun,
} from "../src/server/registry/sync-orchestrator.js";
import type { RegistrySyncPreview } from "../src/server/registry/sync-preview.js";

export interface RegistrySyncCliOptions {
  readonly json: boolean;
  readonly firstSync: boolean;
  readonly apply: boolean;
  readonly confirmationToken: string | null;
}

export interface RegistrySyncCliDependencies {
  readonly resolveTarget: typeof resolveLocalRegistryAdminTarget;
  readonly resolveApplyTarget: typeof resolveLocalRegistryApplyTarget;
  readonly runDryRun: typeof runRegistrySyncDryRun;
  readonly runApply: (input: RunRegistrySyncApplyInput) => Promise<Readonly<RegistrySyncApplyRunResult>>;
  readonly isTty: () => boolean;
  readonly readConfirmationToken: (expectedToken: string) => Promise<string>;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

async function readInteractiveConfirmation(expectedToken: string): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await prompt.question(`Digite exatamente o token ${expectedToken}\n> `);
  } finally {
    prompt.close();
  }
}

const defaultDependencies: RegistrySyncCliDependencies = {
  resolveTarget: resolveLocalRegistryAdminTarget,
  resolveApplyTarget: resolveLocalRegistryApplyTarget,
  runDryRun: runRegistrySyncDryRun,
  runApply: async (input) => (await import("../src/server/registry/sync-apply.js")).runRegistrySyncApply(input),
  isTty: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
  readConfirmationToken: readInteractiveConfirmation,
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

export function parseRegistrySyncCliArgs(argv: readonly string[]): Readonly<RegistrySyncCliOptions> {
  const seen = new Set<string>();
  let json = false;
  let firstSync = false;
  let remote = false;
  let apply = false;
  let confirmSeen = false;
  let confirmationToken: string | null = null;
  let confirmValueMissing = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!["--", "--json", "--first-sync", "--remote", "--apply", "--confirm"].includes(argument)) {
      throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Argumentos inválidos");
    }
    if (seen.has(argument)) {
      throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Argumentos inválidos");
    }
    seen.add(argument);
    if (argument === "--") continue;
    if (argument === "--json") json = true;
    if (argument === "--first-sync") firstSync = true;
    if (argument === "--remote") remote = true;
    if (argument === "--apply") apply = true;
    if (argument === "--confirm") {
      confirmSeen = true;
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        confirmValueMissing = true;
      } else {
        confirmationToken = value;
        index += 1;
      }
    }
  }
  if (remote) {
    throw registrySyncDryRunError("REGISTRY_SYNC_REMOTE_NOT_ENABLED", "Remote indisponível neste build");
  }
  if (confirmValueMissing || (confirmSeen && !apply)) {
    throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Argumentos inválidos");
  }
  return Object.freeze({ json, firstSync, apply, confirmationToken });
}

export function renderRegistrySyncPreview(preview: RegistrySyncPreview): string {
  const category = preview.changes.categories;
  const mapping = preview.changes.mappings;
  const scope = preview.desired.scope;
  const tiers = preview.desired.tiers;
  const finalStatus = preview.safety.previewStatus === "READY"
    ? "DRY_RUN_OK"
    : `BLOCKED:${preview.safety.blockers[0] ?? "REGISTRY_SYNC_DRY_RUN_FAILED"}`;
  return [
    "AUTOACHADO REGISTRY SYNC — DRY RUN",
    "",
    "TARGET",
    `  ${preview.target.label}`,
    "",
    "SOURCE",
    `  Preset: ${preview.presetId}`,
    `  Snapshot: ${preview.source.checksum}`,
    `  Source version: ${preview.source.sourceVersion}`,
    `  Checked at: ${preview.source.checkedAt}`,
    "",
    "CURRENT",
    `  Categories: ${preview.current.categories}`,
    `  Mappings: ${preview.current.mappings}`,
    "",
    "DESIRED",
    `  Categories: ${preview.desired.categoryCount}`,
    `  Mappings: ${preview.desired.mappingCount}`,
    `  Scope: ${scope.allowed}/${scope.review}/${scope.excluded}/${scope.unknown}`,
    `  Tiers A/B/C: ${tiers.A}/${tiers.B}/${tiers.C}`,
    `  Automatic: ${preview.desired.automaticEligibleCount}`,
    "",
    "CHANGES",
    `  Categories I/U/R/N: ${category.insert}/${category.update}/${category.reactivate}/${category.unchanged}`,
    `  Mappings I/U/R/X/M/N: ${mapping.insert}/${mapping.update}/${mapping.reactivate}/${mapping.inactivate}/${mapping.manual_override_skipped}/${mapping.unchanged}`,
    "",
    "PAYLOAD",
    `  Bytes: ${preview.payload.bytes}`,
    `  SHA-256: ${preview.payload.sha256}`,
    `  RPC wrapper estimate: ${preview.payload.rpcWrapperBytesEstimate}`,
    "",
    "SAFETY",
    `  Preview: ${preview.safety.previewStatus}`,
    `  Write capability: ${preview.safety.writeCapability}`,
    `  RPC apply calls: ${preview.safety.rpcApplyCalls}`,
    "",
    "FINGERPRINT",
    `  SHA-256: ${preview.fingerprint.value}`,
    `  Token: ${preview.fingerprint.token}`,
    "",
    finalStatus,
    "",
  ].join("\n");
}

export function renderRegistrySyncApplyResult(
  result: RegistrySyncApplyRunResult,
  includePreview = true,
): string {
  const rpc = result.rpc.result;
  const post = result.post.currentSummary;
  const lines = ["AUTOACHADO REGISTRY SYNC — LOCAL APPLY", ""];
  if (includePreview) lines.push(renderRegistrySyncPreview(result.preview).trimEnd(), "");
  lines.push(
    "CONFIRMATION",
    `  Mode: ${result.confirmation.mode}`,
    `  Verified: ${result.confirmation.verified}`,
    "",
    "RPC RESULT",
    `  Calls: ${result.rpc.callCount}`,
    `  Retries: ${result.rpc.retryCount}`,
    `  Error: ${result.rpc.errorCode ?? "none"}`,
    `  Categories I/U/R/N: ${rpc ? `${rpc.categories.inserted}/${rpc.categories.updated}/${rpc.categories.reactivated}/${rpc.categories.unchanged}` : "n/a"}`,
    `  Mappings I/U/R/X/M/N: ${rpc ? `${rpc.mappings.inserted}/${rpc.mappings.updated}/${rpc.mappings.reactivated}/${rpc.mappings.inactivated}/${rpc.mappings.manualOverrideSkipped}/${rpc.mappings.unchanged}` : "n/a"}`,
    "",
    "POST STATE",
    `  Read: ${result.post.readSucceeded ? "PASS" : "FAILED"}`,
    `  Categories: ${post?.categories ?? "n/a"}`,
    `  Mappings: ${post?.mappings ?? "n/a"}`,
    `  Active mappings: ${post?.activeMappings ?? "n/a"}`,
    "",
    "CONVERGENCE",
    `  Converged: ${result.post.converged}`,
    `  RPC/pre consistent: ${result.post.rpcPreConsistent}`,
    `  Effective consistent: ${result.post.effectiveConsistent}`,
    "",
    "TIMINGS",
    `  Initial prepare ms: ${result.performance.initialPrepareMs.toFixed(3)}`,
    `  Refreshed prepare ms: ${result.performance.refreshedPrepareMs.toFixed(3)}`,
    `  RPC ms: ${result.performance.rpcMs.toFixed(3)}`,
    `  Post-read ms: ${result.performance.postReadMs.toFixed(3)}`,
    `  Post-diff ms: ${result.performance.postDiffMs.toFixed(3)}`,
    `  Execution ms: ${result.performance.executionMs.toFixed(3)}`,
    "",
    "FINAL STATUS",
    result.outcome,
    "",
  );
  return lines.join("\n");
}

function errorCode(error: unknown): string {
  if (error instanceof RegistrySyncDryRunError || error instanceof RegistrySyncError) return error.code;
  return "REGISTRY_SYNC_DRY_RUN_FAILED";
}

export async function runCommerceRegistrySyncCli(
  argv: readonly string[],
  dependencies: RegistrySyncCliDependencies = defaultDependencies,
): Promise<number> {
  const jsonRequested = argv.filter((value) => value === "--json").length === 1;
  try {
    const options = parseRegistrySyncCliArgs(argv);
    const interactive = options.apply && !options.json && options.confirmationToken === null
      && dependencies.isTty();
    if (options.apply && options.confirmationToken === null && !interactive) {
      throw registrySyncDryRunError(
        "REGISTRY_SYNC_CONFIRMATION_REQUIRED",
        "Confirmação explícita obrigatória",
      );
    }

    const resolved = dependencies.resolveTarget();
    if (!options.apply) {
      const preview = await dependencies.runDryRun({
        target: resolved.target,
        readClient: resolved.readClient,
        preset: automotiveRegistryDryRunPreset,
        firstSync: options.firstSync,
      });
      dependencies.stdout(options.json ? `${JSON.stringify(preview)}\n` : renderRegistrySyncPreview(preview));
      return preview.safety.previewStatus === "READY" ? 0 : 1;
    }

    let initialPreviewPrinted = false;
    const result = await dependencies.runApply({
      target: resolved.target,
      readClient: resolved.readClient,
      preset: automotiveRegistryDryRunPreset,
      firstSync: options.firstSync,
      confirmationMode: options.confirmationToken === null
        ? "INTERACTIVE_EXACT_TOKEN"
        : "PROVIDED_EXACT_TOKEN",
      readConfirmationToken: async (preview) => {
        if (options.confirmationToken !== null) return options.confirmationToken;
        dependencies.stdout(renderRegistrySyncPreview(preview));
        initialPreviewPrinted = true;
        return dependencies.readConfirmationToken(preview.fingerprint.token);
      },
      resolveApplyTarget: dependencies.resolveApplyTarget,
    });
    dependencies.stdout(options.json
      ? `${JSON.stringify(result)}\n`
      : renderRegistrySyncApplyResult(result, !initialPreviewPrinted));
    return result.outcome === "APPLIED_AND_VERIFIED" ? 0 : 1;
  } catch (error) {
    const code = errorCode(error);
    const output = jsonRequested ? `${JSON.stringify({ error: { code } })}\n` : `${code}\n`;
    dependencies.stderr(output);
    return code === "REGISTRY_SYNC_INVALID_ARGUMENTS" ? 2 : 1;
  }
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  process.exitCode = await runCommerceRegistrySyncCli(process.argv.slice(2));
}
