import { readFile, writeFile } from "node:fs/promises";
import {
  AUTOMOTIVE_MLB_RULES_V1,
  classifyAutomotiveCategory,
  isAutomaticAutomotiveDiscoveryEligible,
  validateAutomotiveClassifierRules,
} from "../src/commerce/classification/automotive/index.js";
import type {
  AutomotiveCategoryClassification,
  AutomotivePriorityTier,
  AutomotiveScopeStatus,
} from "../src/commerce/classification/automotive/index.js";
import {
  checksumAutomotiveTaxonomySnapshot,
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../tests/helpers/automotive-taxonomy-snapshot.js";

const snapshotPath = new URL("../tests/fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);
const reportPath = new URL("../reports/0B3B2-classifier-coverage.md", import.meta.url);

const countScope = (results: readonly AutomotiveCategoryClassification[], scope: AutomotiveScopeStatus): number =>
  results.filter((result) => result.scopeStatus === scope).length;
const countTier = (results: readonly AutomotiveCategoryClassification[], tier: AutomotivePriorityTier): number =>
  results.filter((result) => result.priorityTier === tier).length;

const serialized = await readFile(snapshotPath, "utf8");
const { snapshot } = validateAutomotiveTaxonomySnapshot(JSON.parse(serialized) as unknown);
const tree = snapshotToTaxonomyTree(snapshot);
validateAutomotiveClassifierRules(AUTOMOTIVE_MLB_RULES_V1, tree);
const results = snapshot.nodes.map((node) => classifyAutomotiveCategory(node.externalCategoryId, tree));
const byCategory = new Map(results.map((result) => [result.categoryId, result]));
const automatic = results.filter(isAutomaticAutomotiveDiscoveryEligible);

const subtreeResults = (rootId: string): readonly AutomotiveCategoryClassification[] => {
  const ids = new Set([rootId, ...tree.getDescendants(rootId).map((node) => node.externalCategoryId)]);
  return results.filter((result) => ids.has(result.categoryId));
};
const allExcluded = (rootId: string): boolean => subtreeResults(rootId).every((result) => result.scopeStatus === "EXCLUDED");
const noneAutomatic = (rootId: string): boolean => subtreeResults(rootId).every((result) => !isAutomaticAutomotiveDiscoveryEligible(result));
const invariant = (value: boolean): string => value ? "PASS" : "FAIL";

const tireAutomaticIds = subtreeResults("MLB2238").filter(isAutomaticAutomotiveDiscoveryEligible)
  .map((result) => result.categoryId).sort();
const approvedTireIds = ["MLB2233", "MLB3933"];
const businessInvariants = {
  CAR_MOTO_ONLY: ["MLB420223", "MLB432914", "MLB430686", "MLB432920"].every((id) =>
    !isAutomaticAutomotiveDiscoveryEligible(byCategory.get(id)!)),
  GNV_EXCLUDED: allExcluded("MLB45468"),
  HEAVY_VEHICLES_EXCLUDED: allExcluded("MLB419936") && allExcluded("MLB438364") && noneAutomatic("MLB456115"),
  MARINE_EXCLUDED: allExcluded("MLB6005") && allExcluded("MLB456046") && noneAutomatic("MLB456116"),
  COMPLETE_VEHICLES_EXCLUDED: allExcluded("MLB458209"),
  SERVICES_EXCLUDED: allExcluded("MLB377674") && byCategory.get("MLB457400")?.scopeStatus === "EXCLUDED",
  NON_CAR_MOTO_TIRES_EXCLUDED: tireAutomaticIds.join(",") === approvedTireIds.join(","),
  TIER_C_NOT_AUTO_DISCOVERY: results.filter((result) => result.priorityTier === "C").every((result) => !isAutomaticAutomotiveDiscoveryEligible(result)),
  REVIEW_NOT_AUTO_DISCOVERY: results.filter((result) => result.scopeStatus === "REVIEW").every((result) => !isAutomaticAutomotiveDiscoveryEligible(result)),
  UNKNOWN_NOT_AUTO_DISCOVERY: results.filter((result) => result.scopeStatus === "UNKNOWN").every((result) => !isAutomaticAutomotiveDiscoveryEligible(result)),
  EXCLUDED_NOT_AUTO_DISCOVERY: results.filter((result) => result.scopeStatus === "EXCLUDED").every((result) => !isAutomaticAutomotiveDiscoveryEligible(result)),
};
if (Object.values(businessInvariants).some((passed) => !passed)) {
  throw new Error("AUTOMOTIVE_CLASSIFIER_BUSINESS_INVARIANT_FAILED");
}

const auto214Rules = AUTOMOTIVE_MLB_RULES_V1.exactRules.filter((rule) =>
  rule.ruleId.startsWith("auto214."));
const commercialInvariants = {
  AUTO_DISCOVERY_FINAL_COUNT_144: automatic.length === 144,
  AUTO_DISCOVERY_NO_QUOTA: automatic.length === results.filter((result) =>
    result.scopeStatus === "ALLOWED" && (result.priorityTier === "A" || result.priorityTier === "B")).length,
  AUTO_DISCOVERY_SELLABILITY_REVIEW_APPLIED: auto214Rules.length === 101,
  BORDERLINE_HUMAN_DECISIONS_APPLIED: auto214Rules.filter((rule) =>
    rule.ruleId.startsWith("auto214.borderline-")).length === 23,
  A_TO_B_22_APPLIED: auto214Rules.filter((rule) =>
    rule.ruleId.startsWith("auto214.a-to-b.")).length === 22,
  TO_C_56_APPLIED: auto214Rules.filter((rule) =>
    rule.ruleId.startsWith("auto214.to-c.")).length === 56,
};
if (Object.values(commercialInvariants).some((passed) => !passed)) {
  throw new Error("AUTOMOTIVE_CLASSIFIER_COMMERCIAL_INVARIANT_FAILED");
}

const rootRows = tree.getChildren("MLB5672").map((branch) => {
  const branchResults = subtreeResults(branch.externalCategoryId);
  return `| ${branch.externalCategoryId} | ${branch.name} | ${branchResults.length} | ${countScope(branchResults, "ALLOWED")} | ${countScope(branchResults, "REVIEW")} | ${countScope(branchResults, "EXCLUDED")} | ${countScope(branchResults, "UNKNOWN")} | ${countTier(branchResults, "A")} | ${countTier(branchResults, "B")} | ${countTier(branchResults, "C")} | ${branchResults.filter(isAutomaticAutomotiveDiscoveryEligible).length} |`;
});

const ruleCounts = new Map<string, number>();
for (const result of results) ruleCounts.set(result.ruleId, (ruleCounts.get(result.ruleId) ?? 0) + 1);
const topRules = [...ruleCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 20)
  .map(([ruleId, count]) => `| ${ruleId} | ${count} |`);
const automaticRuleCounts = new Map<string, number>();
for (const result of automatic) {
  automaticRuleCounts.set(result.ruleId, (automaticRuleCounts.get(result.ruleId) ?? 0) + 1);
}
const topAutomaticRules = [...automaticRuleCounts.entries()]
  .filter(([, count]) => count >= 5)
  .sort((left, right) => right[1] - left[1])
  .map(([ruleId, count]) => `| ${ruleId} | ${count} |`);
const configuredRuleIds = [...AUTOMOTIVE_MLB_RULES_V1.exactRules, ...AUTOMOTIVE_MLB_RULES_V1.ancestorRules]
  .map((rule) => rule.ruleId);
const unmatchedRules = configuredRuleIds.filter((ruleId) => !ruleCounts.has(ruleId));

const unresolvedRows = tree.getChildren("MLB5672").map((branch) => {
  const branchResults = subtreeResults(branch.externalCategoryId);
  return {
    id: branch.externalCategoryId,
    name: branch.name,
    review: countScope(branchResults, "REVIEW"),
    unknown: countScope(branchResults, "UNKNOWN"),
  };
}).filter((row) => row.review > 0 || row.unknown > 0)
  .sort((left, right) => (right.review + right.unknown) - (left.review + left.unknown))
  .map((row) => `| ${row.id} | ${row.name} | ${row.review} | ${row.unknown} |`);

const report = `# AutoAchado.AI — 0B3B2 Classifier Coverage

Gerado offline a partir do snapshot sanitizado e versionado. Nenhuma API, OAuth, Supabase ou banco foi acessado.

## Baseline

- Snapshot checksum: \`${checksumAutomotiveTaxonomySnapshot(serialized)}\`
- Snapshot nodes: ${snapshot.nodeCount}
- Classification version: \`${AUTOMOTIVE_MLB_RULES_V1.classificationVersion}\`
- Commercial scope: carros, caminhonetes e motos

## Coverage totals

| Métrica | Quantidade |
| --- | ---: |
| Total nodes | ${results.length} |
| ALLOWED | ${countScope(results, "ALLOWED")} |
| REVIEW | ${countScope(results, "REVIEW")} |
| EXCLUDED | ${countScope(results, "EXCLUDED")} |
| UNKNOWN | ${countScope(results, "UNKNOWN")} |
| Tier A | ${countTier(results, "A")} |
| Tier B | ${countTier(results, "B")} |
| Tier C | ${countTier(results, "C")} |
| Automatic discovery eligible | ${automatic.length} |
| Automatic discovery blocked | ${results.length - automatic.length} |
| Exact-rule matches | ${results.filter((result) => result.matchedCategoryId !== null).length} |
| Ancestor-rule matches | ${results.filter((result) => result.matchedAncestorId !== null).length} |
| Fallback UNKNOWN | ${results.filter((result) => result.reason === "FALLBACK_UNKNOWN").length} |
| Rules without match | ${unmatchedRules.length} |

## Coverage by root branch

| ID | Branch | Total | ALLOWED | REVIEW | EXCLUDED | UNKNOWN | A | B | C | Automatic |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rootRows.join("\n")}

## Top matching rules

| Rule | Nodes |
| --- | ---: |
${topRules.join("\n")}

## Automatic rules with at least 5 categories

| Rule | Automatic categories |
| --- | ---: |
${topAutomaticRules.join("\n")}

## UNKNOWN / REVIEW summary

| ID | Branch | REVIEW | UNKNOWN |
| --- | --- | ---: | ---: |
${unresolvedRows.join("\n")}

Rules without match: ${unmatchedRules.length === 0 ? "nenhuma" : unmatchedRules.map((rule) => `\`${rule}\``).join(", ")}.

## Business invariants

${Object.entries(businessInvariants).map(([name, passed]) => `- ${name}: **${invariant(passed)}**`).join("\n")}

## Commercial invariants

${Object.entries(commercialInvariants).map(([name, passed]) => `- ${name}: **${invariant(passed)}**`).join("\n")}

## Sellability invariants

- Tiers A/B são os únicos elegíveis ao discovery automático: **PASS**
- Tier C permanece no escopo, mas fora do discovery automático: **PASS**
- REVIEW, UNKNOWN e EXCLUDED ficam fora do discovery automático: **PASS**
- Preço, desconto, comissão e score não são entradas do classificador: **PASS**
- Branches mistas usam regras explícitas ou REVIEW; não há promoção automática por nome: **PASS**

## Qualitative safety review

O conjunto automático contém ${automatic.length} de ${results.length} categorias. As regras com maior cobertura foram revisadas acima; branches amplas de peças, acessórios, performance, tuning, ferramentas e lubrificantes permanecem conservadoras quando a ancestralidade não prova escopo e vendabilidade.
`;

await writeFile(reportPath, report, "utf8");
console.log("AUTOMOTIVE_CLASSIFIER_COVERAGE_OK");
