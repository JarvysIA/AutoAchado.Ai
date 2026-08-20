import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("artefato da função Vercel", () => {
  it("é autocontido e não possui imports internos de runtime", () => {
    const artifact = readFileSync("api/index.js", "utf8");
    expect(artifact).toMatch(/export\s*\{[\s\S]*\bas default\b[\s\S]*\}/);
    expect(artifact).not.toMatch(/(?:from\s+|import\s*\()["']\.{1,2}\//);
    expect(artifact).not.toContain('from "./config"');
    expect(artifact).not.toContain('from "./app"');
    expect(artifact).not.toContain("../src/");
  });
});
