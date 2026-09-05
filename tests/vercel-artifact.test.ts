import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it("mantém apenas api/index.js como entrypoint de deploy", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      framework?: unknown;
      routes?: { src: string; dest: string }[];
      builds?: unknown;
    };
    const apiEntrypoints = readdirSync("api", { recursive: true })
      .map(String)
      .filter((path) => /\.(?:js|mjs|cjs|ts|mts|cts)$/.test(path.replaceAll("\\", "/")));


    expect(config.framework).toBeNull();
    expect(config.routes).toEqual([
      { src: "/dashboard", dest: "/api/index.js" },
      { src: "/api/(.*)", dest: "/api/index.js" },
      { src: "/auth/(.*)", dest: "/api/index.js" },
      { src: "/(.*)", dest: "/api/index.js" },
    ]);
    expect(config.builds).toBeUndefined();
    expect(apiEntrypoints).toEqual(["index.js"]);
    expect(existsSync("src/app.js")).toBe(false);
    expect(existsSync("dist/src/app.js")).toBe(false);
  });
});
