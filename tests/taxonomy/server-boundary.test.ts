import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fronteira server-side da taxonomia", () => {
  it("não conecta adapter a rota pública, UI, OAuth ou persistência", () => {
    for (const file of [
      "src/app.ts",
      "src/ui/pages.ts",
      "src/oauth/client.ts",
      "src/persistence/contracts.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/taxonomy-adapter|src\/taxonomy|\.\/taxonomy/);
    }
  });

  it("mantém parser e árvore livres de Supabase, rede e classificação comercial", () => {
    for (const file of [
      "src/taxonomy/parser.ts",
      "src/taxonomy/tree.ts",
      "src/taxonomy/types.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/supabase|\bfetch\b|scopeStatus|familyKey|priorityTier|["'](?:ALLOWED|REVIEW|UNKNOWN|EXCLUDED)["']/i);
    }
  });
});
