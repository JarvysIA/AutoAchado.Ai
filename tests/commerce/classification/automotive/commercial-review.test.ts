import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AUTOMOTIVE_MLB_RULES_V1,
  classifyAutomotiveCategory,
  isAutomaticAutomotiveDiscoveryEligible,
} from "../../../../src/commerce/classification/automotive/index.js";
import type {
  AutomotivePriorityTier,
  AutomotiveScopeStatus,
} from "../../../../src/commerce/classification/automotive/index.js";
import type { TaxonomyTree } from "../../../../src/taxonomy/tree.js";
import {
  snapshotToTaxonomyTree,
  validateAutomotiveTaxonomySnapshot,
} from "../../../helpers/automotive-taxonomy-snapshot.js";

const snapshotUrl = new URL("../../../fixtures/meli-automotive-taxonomy.snapshot.json", import.meta.url);
let tree: TaxonomyTree;

beforeAll(async () => {
  const parsed: unknown = JSON.parse(await readFile(snapshotUrl, "utf8"));
  tree = snapshotToTaxonomyTree(validateAutomotiveTaxonomySnapshot(parsed).snapshot);
});

const A_TO_B_IDS = [
  "MLB2219", "MLB22723", "MLB263728", "MLB270872", "MLB271174", "MLB363814",
  "MLB392348", "MLB429409", "MLB430552", "MLB430584", "MLB433258", "MLB455776",
  "MLB370798", "MLB63533", "MLB179794", "MLB431319", "MLB438870", "MLB456124",
  "MLB456128", "MLB456142", "MLB457915", "MLB457979",
] as const;

const TO_C_IDS = [
  "MLB418751", "MLB459196", "MLB459362", "MLB459363", "MLB459364", "MLB459367",
  "MLB46596", "MLB46670", "MLB116341", "MLB116342", "MLB431132", "MLB437796",
  "MLB437797", "MLB455307", "MLB455313", "MLB115699", "MLB22369", "MLB251640",
  "MLB277344", "MLB418061", "MLB419998", "MLB420074", "MLB420089", "MLB433784",
  "MLB440301", "MLB440306", "MLB278120", "MLB431961", "MLB191728", "MLB194836",
  "MLB22645", "MLB458221", "MLB458237", "MLB458238", "MLB458239", "MLB458240",
  "MLB458241", "MLB458242", "MLB458246", "MLB47099", "MLB47100", "MLB63581",
  "MLB127436", "MLB430193", "MLB433273", "MLB438488", "MLB438558", "MLB438559",
  "MLB45320", "MLB61635", "MLB120497", "MLB120498", "MLB271557", "MLB271558",
  "MLB49555", "MLB49557",
] as const;

type ExpectedDecision = {
  readonly id: string;
  readonly scope: AutomotiveScopeStatus;
  readonly tier: AutomotivePriorityTier | null;
  readonly automatic: boolean;
};

const BORDERLINE_DECISIONS: readonly ExpectedDecision[] = [
  { id: "MLB116501", scope: "REVIEW", tier: null, automatic: false },
  { id: "MLB22675", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB271259", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB458058", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB392346", scope: "ALLOWED", tier: "B", automatic: true },
  { id: "MLB440131", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB437338", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB437340", scope: "EXCLUDED", tier: null, automatic: false },
  { id: "MLB440302", scope: "REVIEW", tier: null, automatic: false },
  { id: "MLB194016", scope: "REVIEW", tier: null, automatic: false },
  { id: "MLB458223", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB458233", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB458235", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB458244", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB458249", scope: "ALLOWED", tier: "B", automatic: true },
  { id: "MLB3386", scope: "ALLOWED", tier: "B", automatic: true },
  { id: "MLB45372", scope: "ALLOWED", tier: "C", automatic: false },
  { id: "MLB194028", scope: "ALLOWED", tier: "B", automatic: true },
  { id: "MLB429227", scope: "ALLOWED", tier: "B", automatic: true },
  { id: "MLB432538", scope: "ALLOWED", tier: "A", automatic: true },
  { id: "MLB439465", scope: "ALLOWED", tier: "B", automatic: true },
  { id: "MLB456123", scope: "ALLOWED", tier: "A", automatic: true },
  { id: "MLB8532", scope: "ALLOWED", tier: "B", automatic: true },
];

describe("revisão comercial AUTO214", () => {
  it("aplica exatamente os 22 rebaixamentos A para B", () => {
    expect(A_TO_B_IDS).toHaveLength(22);
    for (const id of A_TO_B_IDS) {
      const result = classifyAutomotiveCategory(id, tree);
      expect(result.scopeStatus, id).toBe("ALLOWED");
      expect(result.priorityTier, id).toBe("B");
      expect(result.ruleId, id).toBe(`auto214.a-to-b.${id}`);
      expect(isAutomaticAutomotiveDiscoveryEligible(result), id).toBe(true);
    }
  });

  it("aplica exatamente os 56 rebaixamentos para C", () => {
    expect(TO_C_IDS).toHaveLength(56);
    for (const id of TO_C_IDS) {
      const result = classifyAutomotiveCategory(id, tree);
      expect(result.scopeStatus, id).toBe("ALLOWED");
      expect(result.priorityTier, id).toBe("C");
      expect(result.ruleId, id).toBe(`auto214.to-c.${id}`);
      expect(isAutomaticAutomotiveDiscoveryEligible(result), id).toBe(false);
    }
  });

  it("aplica exatamente as 23 decisões humanas finais", () => {
    expect(BORDERLINE_DECISIONS).toHaveLength(23);
    for (const expected of BORDERLINE_DECISIONS) {
      const result = classifyAutomotiveCategory(expected.id, tree);
      expect(result.scopeStatus, expected.id).toBe(expected.scope);
      expect(result.priorityTier, expected.id).toBe(expected.tier);
      expect(isAutomaticAutomotiveDiscoveryEligible(result), expected.id).toBe(expected.automatic);
    }
    expect(BORDERLINE_DECISIONS.filter((decision) => decision.tier === "A")).toHaveLength(2);
    expect(BORDERLINE_DECISIONS.filter((decision) => decision.tier === "B")).toHaveLength(7);
    expect(BORDERLINE_DECISIONS.filter((decision) => decision.tier === "C")).toHaveLength(10);
    expect(BORDERLINE_DECISIONS.filter((decision) => decision.scope === "REVIEW")).toHaveLength(3);
    expect(BORDERLINE_DECISIONS.filter((decision) => decision.scope === "EXCLUDED")).toHaveLength(1);
    expect(BORDERLINE_DECISIONS.filter((decision) => decision.automatic)).toHaveLength(9);
  });

  it("mantém a exclusão de elásticos pontual", () => {
    expect(classifyAutomotiveCategory("MLB437340", tree).scopeStatus).toBe("EXCLUDED");
    expect(classifyAutomotiveCategory("MLB437338", tree).scopeStatus).toBe("ALLOWED");
    expect(classifyAutomotiveCategory("MLB2239", tree).scopeStatus).toBe("ALLOWED");
  });

  it("fecha o conjunto automático em 144 sem quota no helper", async () => {
    const parsed: unknown = JSON.parse(await readFile(snapshotUrl, "utf8"));
    const snapshot = validateAutomotiveTaxonomySnapshot(parsed).snapshot;
    const automatic = snapshot.nodes
      .map((node) => classifyAutomotiveCategory(node.externalCategoryId, tree))
      .filter(isAutomaticAutomotiveDiscoveryEligible);
    expect(automatic).toHaveLength(144);
    expect(automatic.every((result) => result.scopeStatus === "ALLOWED"
      && (result.priorityTier === "A" || result.priorityTier === "B"))).toBe(true);
  });

  it("mantém as contagens declaradas de overrides comerciais", () => {
    const auto214Rules = AUTOMOTIVE_MLB_RULES_V1.exactRules.filter((rule) =>
      rule.ruleId.startsWith("auto214."));
    expect(auto214Rules.filter((rule) => rule.ruleId.startsWith("auto214.a-to-b."))).toHaveLength(22);
    expect(auto214Rules.filter((rule) => rule.ruleId.startsWith("auto214.to-c."))).toHaveLength(56);
    expect(auto214Rules.filter((rule) => rule.ruleId.startsWith("auto214.borderline-"))).toHaveLength(23);
  });
});