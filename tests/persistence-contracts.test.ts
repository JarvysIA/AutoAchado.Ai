import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  LegacyAutomotiveCategoryPriority,
  RegistryCategoryPriorityTier,
  VerticalCategoryMappingRecord,
} from "../src/persistence/contracts.js";

describe("commerce registry persistence contracts", () => {
  it("keeps registry priority nullable and separate from legacy EXCLUDED", () => {
    expectTypeOf<VerticalCategoryMappingRecord["priorityTier"]>()
      .toEqualTypeOf<RegistryCategoryPriorityTier | null>();

    const registryValues: readonly (RegistryCategoryPriorityTier | null)[] = ["A", "B", "C", null];
    const legacyValue: LegacyAutomotiveCategoryPriority = "EXCLUDED";

    // @ts-expect-error EXCLUDED is a scope, not a registry priority tier.
    const invalidRegistryValue: RegistryCategoryPriorityTier = "EXCLUDED";

    expect(registryValues).toEqual(["A", "B", "C", null]);
    expect(legacyValue).toBe("EXCLUDED");
    expect(invalidRegistryValue).toBe("EXCLUDED");
  });
});
