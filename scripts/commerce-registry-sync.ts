import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { RegistrySyncError } from "../src/commerce/registry/errors.js";
import { resolveLocalRegistryAdminTarget } from "../src/server/registry/admin-target.js";
import { automotiveRegistryDryRunPreset } from "../src/server/registry/automotive-registry-preset.js";
import {
  RegistrySyncDryRunError,
  registrySyncDryRunError,
  runRegistrySyncDryRun,
} from "../src/server/registry/sync-orchestrator.js";
import type { RegistrySyncPreview } from "../src/server/registry/sync-preview.js";

export interface RegistrySyncCliOptions {
  readonly json: boolean;
  readonly firstSync: boolean;
}

export interface RegistrySyncCliDependencies {
  readonly resolveTarget: typeof resolveLocalRegistryAdminTarget;
  readonly runDryRun: typeof runRegistrySyncDryRun;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

const defaultDependencies: RegistrySyncCliDependencies = {
  resolveTarget: resolveLocalRegistryAdminTarget,
  runDryRun: runRegistrySyncDryRun,
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

export function parseRegistrySyncCliArgs(argv: readonly string[]): Readonly<RegistrySyncCliOptions> {
  const seen = new Set<string>();
  let json = false;
  let firstSync = false;
  let remote = false;
  let apply = false;
  let confirm = false;
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
      confirm = true;
      if (argv[index + 1] !== undefined && !argv[index + 1]!.startsWith("--")) index += 1;
    }
  }
  if (apply) throw registrySyncDryRunError("REGISTRY_SYNC_APPLY_NOT_ENABLED", "Apply indisponível neste build");
  if (remote) throw registrySyncDryRunError("REGISTRY_SYNC_REMOTE_NOT_ENABLED", "Remote indisponível neste build");
  if (confirm) throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Argumentos inválidos");
  return Object.freeze({ json, firstSync });
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
    const resolved = dependencies.resolveTarget();
    const preview = await dependencies.runDryRun({
      target: resolved.target,
      readClient: resolved.readClient,
      preset: automotiveRegistryDryRunPreset,
      firstSync: options.firstSync,
    });
    dependencies.stdout(options.json ? `${JSON.stringify(preview)}\n` : renderRegistrySyncPreview(preview));
    return preview.safety.previewStatus === "READY" ? 0 : 1;
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
