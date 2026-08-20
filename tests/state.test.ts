import { describe, expect, it } from "vitest";
import { generateState, isStateFresh, validateState } from "../src/oauth/pkce.js";

describe("state OAuth", () => {
  it("valida somente state idêntico", () => {
    const state = generateState();
    expect(validateState(state, state)).toBe(true);
    expect(validateState(state, `${state}x`)).toBe(false);
    expect(validateState(state, generateState())).toBe(false);
  });

  it("rejeita state expirado ou com timestamp futuro", () => {
    const now = 1_000_000;
    expect(isStateFresh(now - 60_000, now, 120_000)).toBe(true);
    expect(isStateFresh(now - 121_000, now, 120_000)).toBe(false);
    expect(isStateFresh(now + 1, now, 120_000)).toBe(false);
  });
});
