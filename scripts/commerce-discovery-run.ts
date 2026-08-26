import { pathToFileURL } from "node:url";
import { AUTOMOTIVE_MLB_DISCOVERY_V1, planDiscoveryRun } from "../src/commerce/discovery/planner.js";
import {
  DiscoveryError,
  type DiscoveryEligibleCategory,
  type DiscoveryRunMode,
  type DiscoveryRunResult,
  type MarketplaceDiscoveryAdapter,
} from "../src/commerce/discovery/types.js";
import { runDiscoveryOrchestrator } from "../src/server/discovery/orchestrator.js";

export interface DiscoveryCliOptions {
  readonly mode: DiscoveryRunMode;
  readonly persist: boolean;
  readonly json: boolean;
}

export interface DiscoveryCliDependencies {
  readonly loadEligibleCategories: () => Promise<readonly DiscoveryEligibleCategory[]>;
  readonly adapter: MarketplaceDiscoveryAdapter;
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
}

function invalid(): never {
  throw new DiscoveryError("DISCOVERY_INVALID_ARGUMENTS", "Argumentos inválidos");
}

export function parseDiscoveryCliOptions(args: readonly string[]): DiscoveryCliOptions {
  const supported = new Set(["--smoke", "--full-sweep", "--persist", "--json"]);
  const seen = new Set<string>();
  for (const arg of args) {
    if (!supported.has(arg) || seen.has(arg)) invalid();
    seen.add(arg);
  }
  if (seen.has("--smoke") && seen.has("--full-sweep")) invalid();
  return Object.freeze({
    mode: seen.has("--full-sweep") ? "FULL_SWEEP" : "SMOKE",
    persist: seen.has("--persist"),
    json: seen.has("--json"),
  });
}

function boundedResult(result: DiscoveryRunResult): object {
  return {
    contractVersion: result.contractVersion,
    mode: result.mode,
    persistenceMode: result.persistenceMode,
    registryDigest: result.registryDigest,
    registry: { eligibleCategories: result.metrics.eligibleCategories },
    plan: { selectedCategories: result.metrics.selectedCategories },
    categoryOutcomes: result.outcomes,
    metrics: result.metrics,
    samples: {
      productCandidates: result.candidates.slice(0, 10),
      itemOccurrences: result.occurrences.filter((value) => value.highlightType === "ITEM").slice(0, 10),
      userProductOccurrences: result.occurrences.filter((value) => value.highlightType === "USER_PRODUCT").slice(0, 10),
      errors: result.outcomes.filter((value) => value.errorCode !== null).slice(0, 10),
    },
    fatalErrorCode: result.fatalErrorCode,
  };
}

function human(result: DiscoveryRunResult): string {
  return [
    "AUTOACHADO COMMERCE DISCOVERY — DRY RUN",
    "",
    `MODE: ${result.mode}`,
    `ELIGIBLE: ${result.metrics.eligibleCategories}`,
    `SELECTED: ${result.metrics.selectedCategories}`,
    `UNIQUE PRODUCT CANDIDATES: ${result.metrics.uniqueCandidates}`,
    `FAILED CATEGORIES: ${result.metrics.failedCategories}`,
    "",
    "DRY_RUN: NO DISCOVERY DATA PERSISTED",
    "LIVE MARKETPLACE: NOT EXECUTED BY BUILD GATE",
  ].join("\n");
}

export async function runCommerceDiscoveryCli(
  args: readonly string[],
  dependencies: DiscoveryCliDependencies,
): Promise<number> {
  const out = dependencies.stdout ?? ((text) => process.stdout.write(`${text}\n`));
  const err = dependencies.stderr ?? ((text) => process.stderr.write(`${text}\n`));
  let options: DiscoveryCliOptions | undefined;
  try {
    options = parseDiscoveryCliOptions(args);
    if (options.persist) {
      throw new DiscoveryError("DISCOVERY_PERSISTENCE_NOT_ENABLED", "Persistência desabilitada neste build");
    }
    const eligible = await dependencies.loadEligibleCategories();
    const plan = planDiscoveryRun(eligible, options.mode, AUTOMOTIVE_MLB_DISCOVERY_V1);
    const result = await runDiscoveryOrchestrator({ plan, adapter: dependencies.adapter });
    out(options.json ? JSON.stringify(boundedResult(result)) : human(result));
    return result.fatalErrorCode === null ? 0 : 1;
  } catch (error) {
    const safe = error instanceof DiscoveryError
      ? { error: error.code, message: error.message }
      : { error: "DISCOVERY_PLAN_INVALID", message: "Falha sanitizada" };
    if (options?.json) out(JSON.stringify(safe));
    else err(`${safe.error}: ${safe.message}`);
    return safe.error === "DISCOVERY_INVALID_ARGUMENTS" ? 2 : 1;
  }
}

function disabledDependencies(): DiscoveryCliDependencies {
  const unavailable = async (): Promise<never> => {
    throw new DiscoveryError("DISCOVERY_LIVE_NOT_ENABLED", "Runtime live aguarda o gate 0B3D-B");
  };
  return {
    loadEligibleCategories: unavailable,
    adapter: { discoverCategory: unavailable },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCommerceDiscoveryCli(process.argv.slice(2), disabledDependencies());
}
