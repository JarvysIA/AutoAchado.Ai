import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("fronteira server-only OAuth", () => {
  it("conecta somente autorização inicial ao callback e não expõe rotação", () => {
    const app = readFileSync("src/app.ts", "utf8");
    expect(app).not.toContain("rotateMeliAccessToken");
    expect(app).not.toMatch(/\/refresh|\/rotate|\/token/);
    expect(app).toContain("createMeliInitialAuthorizationService");
  });

  it("mantém módulos sensíveis apenas sob src/server", () => {
    const serverFiles = readdirSync("src/server", { recursive: true }).map(String);
    expect(serverFiles).toContain(join("oauth", "factory.ts"));
    expect(serverFiles).toContain(join("supabase", "client.ts"));
  });

  it("não contém valores inline de credenciais no source server", () => {
    const files = readdirSync("src/server", { recursive: true })
      .map(String)
      .filter((file) => file.endsWith(".ts"));
    const source = files.map((file) => readFileSync(join("src/server", file), "utf8")).join("\n");
    expect(source).not.toMatch(/sb_secret_[A-Za-z0-9]{16,}/);
    expect(source).not.toContain("APP_USR-");
    expect(source).not.toContain("TG-");
  });

  it("mantém somente confirmação sanitizada na sessão persistente", () => {
    const session = readFileSync("src/oauth/session.ts", "utf8");
    expect(session).toContain("authorizedAt");
    expect(session).not.toMatch(/accessToken|refreshToken|access_token|refresh_token/);
  });
});
