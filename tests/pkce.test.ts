import { describe, expect, it } from "vitest";
import { createCodeChallenge, generateCodeVerifier } from "../src/oauth/pkce.js";

describe("PKCE", () => {
  it("gera code_verifier seguro no intervalo aceito pelo PKCE", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateCodeVerifier()).not.toBe(verifier);
  });

  it("gera code_challenge S256 do exemplo conhecido", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(createCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
