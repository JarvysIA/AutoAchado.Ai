import { createHash } from "node:crypto";
import {
  COMMERCE_DISCOVERY_RUN_CONTRACT,
  DiscoveryError,
  type DiscoveryEligibleCategory,
  type DiscoveryRunConfig,
  type DiscoveryRunMode,
  type DiscoveryRunPlan,
} from "./types.js";

export const AUTOMOTIVE_MLB_DISCOVERY_V1: DiscoveryRunConfig = Object.freeze({
  configVersion: "automotive-mlb-discovery/v1",
  adapterVersion: "meli-highlights-discovery/v1",
  marketplaceKey: "MERCADO_LIVRE",
  siteId: "MLB",
  verticalKey: "AUTOMOTIVE",
  expectedEligibleCategories: 144,
  smokeCategoriesPerTier: 2,
  concurrency: 2,
  candidateTypes: Object.freeze(["PRODUCT"] as const),
  knownOccurrenceTypes: Object.freeze(["PRODUCT", "ITEM", "USER_PRODUCT"] as const),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_ID = /^MLB[0-9]+$/;

function invalid(message: string, details: Record<string, string | number> = {}): never {
  throw new DiscoveryError("DISCOVERY_PLAN_INVALID", message, details);
}

function tierOrder(tier: "A" | "B"): number {
  return tier === "A" ? 0 : 1;
}

export function compareDiscoveryCategories(left: DiscoveryEligibleCategory, right: DiscoveryEligibleCategory): number {
  return tierOrder(left.priorityTier) - tierOrder(right.priorityTier)
    || left.externalCategoryId.localeCompare(right.externalCategoryId);
}

function validateConfig(config: DiscoveryRunConfig): void {
  if (!config.configVersion || !config.adapterVersion || !config.marketplaceKey || !config.siteId || !config.verticalKey
    || !Number.isInteger(config.expectedEligibleCategories) || config.expectedEligibleCategories < 1
    || !Number.isInteger(config.smokeCategoriesPerTier) || config.smokeCategoriesPerTier < 1
    || !Number.isInteger(config.concurrency) || config.concurrency < 1) {
    invalid("Configuração de discovery inválida");
  }
  if (config.candidateTypes.length !== 1 || config.candidateTypes[0] !== "PRODUCT") {
    invalid("Tipos candidatos inválidos");
  }
}

function validateCategories(categories: readonly DiscoveryEligibleCategory[], config: DiscoveryRunConfig): void {
  if (categories.length !== config.expectedEligibleCategories) {
    throw new DiscoveryError("DISCOVERY_REGISTRY_ELIGIBILITY_MISMATCH", "Contagem elegível divergente", {
      expected: config.expectedEligibleCategories,
      actual: categories.length,
    });
  }
  const uuids = new Set<string>();
  const externalIds = new Set<string>();
  for (const category of categories) {
    if (category.marketplaceKey !== config.marketplaceKey || category.siteId !== config.siteId
      || category.verticalKey !== config.verticalKey) invalid("Contexto de categoria divergente");
    if (!UUID.test(category.marketplaceCategoryId) || !CATEGORY_ID.test(category.externalCategoryId)) {
      invalid("Identidade de categoria inválida");
    }
    if (category.priorityTier !== "A" && category.priorityTier !== "B") invalid("Tier inelegível");
    if (!category.classificationVersion || !category.categoryConfigVersion
      || !category.marketplaceConfigVersion || !category.verticalConfigVersion) invalid("Versão de registry ausente");
    if (category.manualOverride !== (category.decisionSource === "MANUAL")) invalid("Origem de decisão inconsistente");
    if (uuids.has(category.marketplaceCategoryId) || externalIds.has(category.externalCategoryId)) {
      invalid("Categoria elegível duplicada", { externalCategoryId: category.externalCategoryId });
    }
    uuids.add(category.marketplaceCategoryId);
    externalIds.add(category.externalCategoryId);
  }
}

function digest(categories: readonly DiscoveryEligibleCategory[], config: DiscoveryRunConfig): string {
  const value = {
    config: {
      configVersion: config.configVersion,
      adapterVersion: config.adapterVersion,
      marketplaceKey: config.marketplaceKey,
      siteId: config.siteId,
      verticalKey: config.verticalKey,
      concurrency: config.concurrency,
      candidateTypes: [...config.candidateTypes],
      knownOccurrenceTypes: [...config.knownOccurrenceTypes],
    },
    categories: categories.map((category) => ({
      marketplaceCategoryId: category.marketplaceCategoryId,
      externalCategoryId: category.externalCategoryId,
      priorityTier: category.priorityTier,
      manualOverride: category.manualOverride,
      decisionSource: category.decisionSource,
      classificationVersion: category.classificationVersion,
      sourceVersion: category.sourceVersion,
      categoryConfigVersion: category.categoryConfigVersion,
      marketplaceConfigVersion: category.marketplaceConfigVersion,
      verticalConfigVersion: category.verticalConfigVersion,
    })),
  };
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function planDiscoveryRun(
  eligibleCategories: readonly DiscoveryEligibleCategory[],
  mode: DiscoveryRunMode,
  config: DiscoveryRunConfig = AUTOMOTIVE_MLB_DISCOVERY_V1,
): DiscoveryRunPlan {
  validateConfig(config);
  if (mode !== "SMOKE" && mode !== "FULL_SWEEP") invalid("Modo de discovery inválido");
  validateCategories(eligibleCategories, config);
  const ordered = Object.freeze([...eligibleCategories].sort(compareDiscoveryCategories));
  const selected = mode === "FULL_SWEEP"
    ? ordered
    : Object.freeze([
      ...ordered.filter((category) => category.priorityTier === "A").slice(0, config.smokeCategoriesPerTier),
      ...ordered.filter((category) => category.priorityTier === "B").slice(0, config.smokeCategoriesPerTier),
    ]);
  if (mode === "SMOKE" && selected.length !== config.smokeCategoriesPerTier * 2) {
    throw new DiscoveryError("DISCOVERY_REGISTRY_ELIGIBILITY_MISMATCH", "Smoke exige categorias A e B suficientes");
  }
  return Object.freeze({
    contractVersion: COMMERCE_DISCOVERY_RUN_CONTRACT,
    mode,
    config,
    eligibleCategories: ordered,
    selectedCategories: selected,
    registryDigest: digest(ordered, config),
  });
}
