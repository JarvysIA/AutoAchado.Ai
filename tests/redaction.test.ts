import { describe, expect, it } from "vitest";
import { redactText, sanitizeForReport } from "../src/report/redaction";

describe("redaction", () => {
  it("remove Bearer e formatos conhecidos de token", () => {
    const input = "Authorization: Bearer abc.def-123 APP_USR-secret-123 TG-refresh-456";
    const output = redactText(input);
    expect(output).not.toContain("abc.def-123");
    expect(output).not.toContain("APP_USR-secret-123");
    expect(output).not.toContain("TG-refresh-456");
  });

  it("remove chaves sensíveis de objetos", () => {
    expect(sanitizeForReport({ access_token: "secret", nested: { client_secret: "secret2", ok: 1 } })).toEqual({
      nested: { ok: 1 },
    });
  });
});
