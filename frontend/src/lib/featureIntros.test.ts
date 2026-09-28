import { describe, expect, it } from "vitest";
import { FEATURE_INTROS, isFeatureSeen } from "./featureIntros";

describe("isFeatureSeen", () => {
  const def = FEATURE_INTROS[0]!; // feature_intro_daily_food, version 1

  it("is unseen when the key is missing entirely", () => {
    expect(isFeatureSeen({}, def)).toBe(false);
  });

  it("is seen when the stored version matches the definition's version", () => {
    expect(isFeatureSeen({ [def.key]: def.version }, def)).toBe(true);
  });

  it("is seen when the stored version is higher than required", () => {
    expect(isFeatureSeen({ [def.key]: def.version + 5 }, def)).toBe(true);
  });

  it("is unseen when the stored version is lower (a new sub-feature bumped the version)", () => {
    expect(isFeatureSeen({ [def.key]: def.version - 1 }, { ...def, version: def.version + 1 })).toBe(false);
  });

  it("all 9 canonical feature keys are unique", () => {
    const keys = FEATURE_INTROS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(9);
  });

  it("every definition has either a route or a trigger, never both, never neither", () => {
    for (const d of FEATURE_INTROS) {
      const hasRoute = Boolean(d.route);
      const hasTrigger = Boolean(d.trigger);
      expect(hasRoute !== hasTrigger).toBe(true);
    }
  });
});
