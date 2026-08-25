import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RegistrySyncError } from "../src/commerce/registry/errors.js";
import {
  prepareFirstRemoteRegistryApplyPreview,
  runFirstRemoteRegistryApply,
  type FirstRemoteRegistryApplyResultEnvelope,
  type FirstRemoteRegistryPreviewEnvelope,
  type RunFirstRemoteRegistryApplyInput,
} from "../src/server/registry/first-remote-sync-apply.js";
import { resolveRemoteRegistryAdminTarget } from "../src/server/registry/remote-admin-target.js";
import type { ResolvedFirstRemoteRegistryApplyTarget } from "../src/server/registry/remote-live-target.js";
import {
  RegistrySyncDryRunError,
  registrySyncDryRunError,
} from "../src/server/registry/sync-orchestrator.js";

export interface FirstRemoteRegistryApplyCliOptions {
  readonly preview: boolean;
  readonly json: boolean;
  readonly confirmationToken: string | null;
}

export interface FirstRemoteRegistryApplyCliDependencies {
  readonly resolveRemoteReadTarget: typeof resolveRemoteRegistryAdminTarget;
  readonly preparePreview: typeof prepareFirstRemoteRegistryApplyPreview;
  readonly runApply: (
    input: RunFirstRemoteRegistryApplyInput,
  ) => Promise<Readonly<FirstRemoteRegistryApplyResultEnvelope>>;
  readonly resolveRemoteApplyTarget: (
    expectedTarget: RunFirstRemoteRegistryApplyInput["target"],
  ) => ResolvedFirstRemoteRegistryApplyTarget
    | PromiseLike<ResolvedFirstRemoteRegistryApplyTarget>;
  readonly isTty: () => boolean;
  readonly readConfirmationToken: (expectedToken: string) => Promise<string>;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

async function readInteractiveConfirmation(expectedToken: string): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const prompt = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return await prompt.question(
      "ATENÇÃO: digitar o token LIVE autoriza uma escrita remota.\nDigite exatamente "
        + expectedToken + "\n> ",
    );
  } finally {
    prompt.close();
  }
}

const defaultDependencies: FirstRemoteRegistryApplyCliDependencies = {
  resolveRemoteReadTarget: resolveRemoteRegistryAdminTarget,
  preparePreview: prepareFirstRemoteRegistryApplyPreview,
  runApply: runFirstRemoteRegistryApply,
  resolveRemoteApplyTarget: async (expectedTarget) => {
    const { resolveFirstRemoteRegistryApplyTarget } = await import(
      "../src/server/registry/remote-live-target.js"
    );
    return resolveFirstRemoteRegistryApplyTarget(expectedTarget);
  },
  isTty: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
  readConfirmationToken: readInteractiveConfirmation,
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

export function parseFirstRemoteRegistryApplyCliArgs(
  argv: readonly string[],
): Readonly<FirstRemoteRegistryApplyCliOptions> {
  const seen = new Set<string>();
  let preview = false;
  let json = false;
  let confirmSeen = false;
  let confirmationToken: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!["--", "--preview", "--json", "--confirm"].includes(argument) || seen.has(argument)) {
      throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Argumentos LIVE inválidos");
    }
    seen.add(argument);
    if (argument === "--") continue;
    if (argument === "--preview") preview = true;
    if (argument === "--json") json = true;
    if (argument === "--confirm") {
      confirmSeen = true;
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Argumentos LIVE inválidos");
      }
      confirmationToken = value;
      index += 1;
    }
  }
  if (preview && confirmSeen) {
    throw registrySyncDryRunError("REGISTRY_SYNC_INVALID_ARGUMENTS", "Preview não aceita confirmação");
  }
  return Object.freeze({ preview, json, confirmationToken });
}

export function renderFirstRemoteRegistryPreview(
  envelope: Readonly<FirstRemoteRegistryPreviewEnvelope>,
): string {
  const preview = envelope.preview;
  return [
    "AUTOACHADO REGISTRY — FIRST REMOTE APPLY",
    "",
    "PROJECT",
    "  " + envelope.projectRef,
    "",
    "CURRENT",
    "  Categories: " + preview.current.categories,
    "  Mappings: " + preview.current.mappings,
    "",
    "WILL INSERT",
    "  Categories: " + preview.changes.categories.insert,
    "  Mappings: " + preview.changes.mappings.insert,
    "",
    "PAYLOAD",
    "  Bytes: " + preview.payload.bytes,
    "  SHA-256: " + preview.payload.sha256,
    "",
    "RPC",
    "  WILL EXECUTE EXACTLY 1",
    "  RETRY: 0",
    "",
    "LIVE TOKEN",
    "  " + envelope.liveConfirmation.token,
    "",
    "REMOTE WRITE",
    "  NOT EXECUTED",
    "",
  ].join("\n");
}

export function renderFirstRemoteRegistryApplyResult(
  envelope: Readonly<FirstRemoteRegistryApplyResultEnvelope>,
): string {
  const result = envelope.applyResult;
  return [
    "AUTOACHADO REGISTRY — FIRST REMOTE APPLY",
    "",
    "PROJECT",
    "  " + envelope.projectRef,
    "",
    "CONFIRMATION",
    "  Mode: " + envelope.confirmation.mode,
    "  Verified: " + envelope.confirmation.verified,
    "",
    "RPC",
    "  Calls: " + result.rpc.callCount,
    "  Retry: " + result.rpc.retryCount,
    "",
    "POST-VERIFY",
    "  Read: " + (result.post.readSucceeded ? "PASS" : "FAILED"),
    "  Converged: " + result.post.converged,
    "",
    "FINAL STATUS",
    result.outcome,
    "",
  ].join("\n");
}

function errorCode(error: unknown): string {
  if (error instanceof RegistrySyncDryRunError || error instanceof RegistrySyncError) return error.code;
  return "REGISTRY_SYNC_DRY_RUN_FAILED";
}

export async function runFirstRemoteRegistryApplyCli(
  argv: readonly string[],
  dependencies: FirstRemoteRegistryApplyCliDependencies = defaultDependencies,
): Promise<number> {
  const jsonRequested = argv.filter((value) => value === "--json").length === 1;
  try {
    const options = parseFirstRemoteRegistryApplyCliArgs(argv);
    const interactive = !options.preview && !options.json && options.confirmationToken === null
      && dependencies.isTty();
    if (!options.preview && options.confirmationToken === null && !interactive) {
      throw registrySyncDryRunError(
        "REGISTRY_SYNC_CONFIRMATION_REQUIRED",
        "Confirmação LIVE explícita obrigatória",
      );
    }

    const resolved = dependencies.resolveRemoteReadTarget();
    if (options.preview) {
      const envelope = await dependencies.preparePreview({
        target: resolved.target,
        readClient: resolved.readClient,
      });
      dependencies.stdout(options.json
        ? JSON.stringify(envelope) + "\n"
        : renderFirstRemoteRegistryPreview(envelope));
      return 0;
    }

    const result = await dependencies.runApply({
      target: resolved.target,
      readClient: resolved.readClient,
      confirmationMode: options.confirmationToken === null
        ? "INTERACTIVE_EXACT_TOKEN"
        : "PROVIDED_EXACT_TOKEN",
      readConfirmationToken: async (preview, expectedToken) => {
        if (options.confirmationToken !== null) return options.confirmationToken;
        const envelope: FirstRemoteRegistryPreviewEnvelope = {
          contractVersion: "commerce-registry-first-remote-apply/v1",
          phase: "PREVIEW",
          projectRef: resolved.target.projectRef,
          preview,
          liveConfirmation: {
            fingerprint: preview.fingerprint.value,
            token: expectedToken,
            verified: false,
            mode: null,
          },
          performance: preview.performance,
        };
        dependencies.stdout(renderFirstRemoteRegistryPreview(envelope));
        return dependencies.readConfirmationToken(expectedToken);
      },
      resolveApplyTarget: dependencies.resolveRemoteApplyTarget,
    });
    dependencies.stdout(options.json
      ? JSON.stringify(result) + "\n"
      : renderFirstRemoteRegistryApplyResult(result));
    return result.applyResult.outcome === "APPLIED_AND_VERIFIED" ? 0 : 1;
  } catch (error) {
    const code = errorCode(error);
    const output = jsonRequested ? JSON.stringify({ error: { code } }) + "\n" : code + "\n";
    dependencies.stderr(output);
    return code === "REGISTRY_SYNC_INVALID_ARGUMENTS" ? 2 : 1;
  }
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  process.exitCode = await runFirstRemoteRegistryApplyCli(process.argv.slice(2));
}
