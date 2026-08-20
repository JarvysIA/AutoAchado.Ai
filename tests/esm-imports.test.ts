import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return extname(path) === ".ts" ? [path] : [];
  });
}

describe("imports ESM de produção", () => {
  it("exige extensão .js em todos os imports relativos de api e src", () => {
    const invalid: string[] = [];
    for (const file of [...typescriptFiles("api"), ...typescriptFiles("src")]) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?:from\s+|import\s*\()["'](\.{1,2}\/[^"']+)["']/g)) {
        if (!match[1]?.endsWith(".js")) invalid.push(`${file}: ${match[1] ?? "import desconhecido"}`);
      }
    }
    expect(invalid).toEqual([]);
  });
});
