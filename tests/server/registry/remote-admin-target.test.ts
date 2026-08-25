import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { RegistryReadClient } from "../../../src/server/registry/current-state.js";
import {
  AUTOACHADO_REMOTE_PROJECT_REF,
  AUTOACHADO_REMOTE_SUPABASE_URL,
  REMOTE_ADMIN_CREDENTIAL_MAX_BUFFER_BYTES,
  REMOTE_ADMIN_CREDENTIAL_TIMEOUT_MS,
  parseRemoteAdminSecret,
  resolveRemoteRegistryAdminTarget,
  validateRemoteRegistryUrl,
} from "../../../src/server/registry/remote-admin-target.js";

const fakeReadClient = Object.freeze({}) as RegistryReadClient;

describe("remote registry admin read target", () => {
  it("fixa projeto e URL canônicos com validação estrita", () => {
    expect(AUTOACHADO_REMOTE_PROJECT_REF).toBe("nrwhzfahjypybjyajmrj");
    expect(AUTOACHADO_REMOTE_SUPABASE_URL).toBe("https://nrwhzfahjypybjyajmrj.supabase.co");
    expect(validateRemoteRegistryUrl(`${AUTOACHADO_REMOTE_SUPABASE_URL}/`)).toBe(AUTOACHADO_REMOTE_SUPABASE_URL);
    for (const value of [
      "http://nrwhzfahjypybjyajmrj.supabase.co",
      "https://other.supabase.co",
      `${AUTOACHADO_REMOTE_SUPABASE_URL}:444`,
      `${AUTOACHADO_REMOTE_SUPABASE_URL}/rest/v1`,
      `${AUTOACHADO_REMOTE_SUPABASE_URL}/?x=1`,
      `${AUTOACHADO_REMOTE_SUPABASE_URL}/#x`,
    ]) expect(() => validateRemoteRegistryUrl(value)).toThrowError(/Target remoto inválido/);
  });

  it("seleciona exatamente uma secret moderna e rejeita shapes inseguros", () => {
    expect(parseRemoteAdminSecret(JSON.stringify([
      { type: "publishable", api_key: "sb_publishable_fake" },
      { type: "secret", api_key: "sb_secret_fake_modern" },
      { name: "service_role", api_key: "header.payload.signature" },
    ]))).toBe("sb_secret_fake_modern");
    for (const value of [
      "not-json",
      JSON.stringify({ type: "secret", api_key: "sb_secret_fake" }),
      JSON.stringify([]),
      JSON.stringify([{ name: "service_role", api_key: "header.payload.signature" }]),
      JSON.stringify([{ type: "secret", api_key: "bad" }]),
      JSON.stringify([
        { type: "secret", api_key: "sb_secret_fake_one" },
        { type: "secret", api_key: "sb_secret_fake_two" },
      ]),
    ]) expect(() => parseRemoteAdminSecret(value)).toThrowError(/Credencial administrativa remota indisponível/);
  });

  it("mantém secret em memória e retorna somente target/read client/timing", () => {
    let capturedSecret = "";
    let calls = 0;
    const resolved = resolveRemoteRegistryAdminTarget({
      runApiKeys: () => {
        calls += 1;
        return { status: 0, stdout: JSON.stringify([{ type: "secret", api_key: "sb_secret_fake_canary" }]) };
      },
      createReadClient: (url, secret) => {
        expect(url).toBe(AUTOACHADO_REMOTE_SUPABASE_URL);
        capturedSecret = secret;
        return fakeReadClient;
      },
      nowMs: (() => { let time = 10; return () => time += 5; })(),
    });
    expect(calls).toBe(1);
    expect(capturedSecret).toBe("sb_secret_fake_canary");
    expect(resolved).toEqual({
      target: {
        kind: "REMOTE", label: "REMOTE", projectRef: AUTOACHADO_REMOTE_PROJECT_REF,
        baseUrl: AUTOACHADO_REMOTE_SUPABASE_URL,
      },
      readClient: fakeReadClient,
      credentialResolveMs: 5,
    });
    expect(JSON.stringify(resolved)).not.toContain("sb_secret_fake_canary");
  });

  it("sanitiza falha de autenticação sem propagar stdout cru", () => {
    expect(() => resolveRemoteRegistryAdminTarget({
      runApiKeys: () => ({ status: 1, stdout: "sb_secret_fake_canary Authorization Bearer" }),
    })).toThrowError(/Autenticação administrativa remota indisponível/);
    try {
      resolveRemoteRegistryAdminTarget({
        runApiKeys: () => ({ status: 1, stdout: "sb_secret_fake_canary Authorization Bearer" }),
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toMatch(/sb_secret_fake_canary|Authorization|Bearer/);
    }
  });

  it("usa limites e mantém o provider sem superfícies de write", async () => {
    expect(REMOTE_ADMIN_CREDENTIAL_TIMEOUT_MS).toBe(30_000);
    expect(REMOTE_ADMIN_CREDENTIAL_MAX_BUFFER_BYTES).toBe(1024 * 1024);
    const source = await readFile(
      new URL("../../../src/server/registry/remote-admin-target.ts", import.meta.url), "utf8",
    );
    const credentialSource = await readFile(
      new URL("../../../src/server/registry/remote-admin-credential.ts", import.meta.url), "utf8",
    );
    expect(credentialSource).toContain('"projects"');
    expect(credentialSource).toContain('"api-keys"');
    expect(credentialSource).toContain('"--reveal"');
    expect(credentialSource).toContain("shell: false");
    expect(source).not.toMatch(/\.rpc\s*\(/);
    expect(source).not.toMatch(/\.(?:insert|update|upsert|delete)\s*\(/);
    expect(source).not.toContain("registryApplyClientFromSupabase");
    expect(source).not.toContain("callAtomicRegistryApplyRpc");
    expect(source).not.toContain("./executor");
    expect(source).not.toContain("./sync-apply");
  });
});
