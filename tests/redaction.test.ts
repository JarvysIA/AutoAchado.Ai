import { describe, expect, it } from "vitest";
import { redactText, sanitizeForReport } from "../src/report/redaction.js";

describe("redaction", () => {
  it("remove Bearer e formatos conhecidos de token", () => {
    const input = "Authorization: Bearer abc.def-123 APP_USR-secret-123 TG-refresh-456";
    const output = redactText(input);
    expect(output).not.toContain("abc.def-123");
    expect(output).not.toContain("APP_USR-secret-123");
    expect(output).not.toContain("TG-refresh-456");
  });

  it("remove chaves sensíveis de objetos", () => {
    expect(sanitizeForReport({ access_token: "secret", apikey: "secret3", nested: { client_secret: "secret2", ok: 1 } })).toEqual({
      nested: { ok: 1 },
    });
  });

  it("remove Supabase Secret Key e URL de banco", () => {
    const output = redactText("SUPABASE_SECRET_KEY=sb_secret_fake_canary postgresql://fake_user:fake_pass@host/db");
    expect(output).not.toContain("sb_secret_fake_canary");
    expect(output).not.toContain("fake_user:fake_pass");
  });
});
