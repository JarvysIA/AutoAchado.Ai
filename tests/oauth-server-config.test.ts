import { describe, expect, it } from "vitest";
import { loadMeliRotationConfig } from "../src/server/oauth/config.js";
import { loadSupabaseServerConfig } from "../src/server/supabase/config.js";

describe("configuração server-only 0B2B", () => {
  it("é lazy, válida e não ecoa valores inválidos", () => {
    expect(() => loadSupabaseServerConfig({})).toThrow("CONFIG_SUPABASE_URL_MISSING");
    expect(() => loadSupabaseServerConfig({ SUPABASE_URL: "not-a-url", SUPABASE_SECRET_KEY: "sensitive" })).toThrow(
      "CONFIG_SUPABASE_URL_INVALID",
    );
    expect(() => loadSupabaseServerConfig({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: "sensitive" })).toThrow(
      "CONFIG_SUPABASE_SECRET_KEY_INVALID",
    );
    expect(loadSupabaseServerConfig({ SUPABASE_URL: "https://project.supabase.co/", SUPABASE_SECRET_KEY: "sb_secret_fake" })).toEqual({
      url: "https://project.supabase.co",
      secretKey: "sb_secret_fake",
    });
  });

  it("valida seller esperado sem tornar a configuração global obrigatória", () => {
    expect(() => loadMeliRotationConfig({ MELI_CLIENT_ID: "831976763519093", MELI_CLIENT_SECRET: "fake" })).toThrow(
      "CONFIG_MELI_EXPECTED_USER_ID_MISSING",
    );
    expect(() => loadMeliRotationConfig({
      MELI_EXPECTED_USER_ID: "not-an-id",
      MELI_CLIENT_ID: "831976763519093",
      MELI_CLIENT_SECRET: "fake",
    })).toThrow("CONFIG_MELI_EXPECTED_USER_ID_INVALID");
    expect(loadMeliRotationConfig({
      MELI_EXPECTED_USER_ID: "296984475",
      MELI_CLIENT_ID: "831976763519093",
      MELI_CLIENT_SECRET: "fake",
    }).expectedUserId).toBe(296984475);
  });
});
