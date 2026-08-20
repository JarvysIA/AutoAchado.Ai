import { describe, expect, it } from "vitest";
import { reportContainsSecret, sanitizeForReport } from "../src/report/redaction";

describe("segurança do relatório", () => {
  it("não persiste tokens depois da sanitização", () => {
    const token = "APP_USR-super-secret-123";
    const safe = JSON.stringify(sanitizeForReport({ access_token: token, error: `Bearer ${token}` }));
    expect(safe).not.toContain(token);
    expect(reportContainsSecret(safe, [token])).toBe(false);
  });

  it("detecta segredo conhecido por defesa adicional", () => {
    expect(reportContainsSecret("texto secret-value", ["secret-value"])).toBe(true);
  });
});
