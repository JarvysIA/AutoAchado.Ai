import { describe, expect, it, vi } from "vitest";
import {
  CONTROL_PLANE_RESPONSE_INVALID,
  ControlPlaneError,
  SupabaseMeliOAuthControlPlane,
  type RpcInvoker,
} from "../src/server/oauth/control-plane.js";

const claimedRow = {
  outcome: "CLAIMED",
  external_user_id: 296984475,
  lease_id: "123e4567-e89b-42d3-a456-426614174000",
  expected_version: 3,
  refresh_token: "fake-refresh",
  lease_expires_at: "2026-08-20T20:00:00.000Z",
};

describe("adapter RPC Mercado Livre", () => {
  it("mapeia assinatura e shape exatos do claim", async () => {
    const invoke = vi.fn<RpcInvoker>().mockResolvedValue({ data: [claimedRow], error: null });
    const adapter = new SupabaseMeliOAuthControlPlane(invoke);
    await expect(adapter.claimRefresh(296984475)).resolves.toEqual({
      outcome: "CLAIMED",
      externalUserId: 296984475,
      leaseId: claimedRow.lease_id,
      expectedVersion: 3,
      refreshToken: "fake-refresh",
      leaseExpiresAt: claimedRow.lease_expires_at,
    });
    expect(invoke).toHaveBeenCalledWith("claim_meli_refresh", { p_external_user_id: 296984475 });
  });

  it("rejeita token em outcome não CLAIMED", async () => {
    const adapter = new SupabaseMeliOAuthControlPlane(async () => ({
      data: [{ ...claimedRow, outcome: "LOCK_BUSY", lease_id: null }],
      error: null,
    }));
    await expect(adapter.claimRefresh(296984475)).rejects.toMatchObject({ message: CONTROL_PLANE_RESPONSE_INVALID });
  });

  it("distingue resposta inválida de transporte ambíguo", async () => {
    const invalid = new SupabaseMeliOAuthControlPlane(async () => ({ data: [], error: null }));
    await expect(invalid.claimRefresh(1)).rejects.toMatchObject({ transportAmbiguous: false });
    const transport = new SupabaseMeliOAuthControlPlane(async () => { throw new Error("sensitive transport"); });
    await expect(transport.claimRefresh(1)).rejects.toBeInstanceOf(ControlPlaneError);
    await expect(transport.claimRefresh(1)).rejects.toMatchObject({ transportAmbiguous: true, message: "CONTROL_PLANE_REQUEST_FAILED" });
  });

  it("mapeia initialize, complete e fail sem retornar tokens", async () => {
    const rows: Record<string, unknown> = {
      initialize_meli_oauth_connection: [{ outcome: "INITIALIZED", external_user_id: 7, token_version: 1, status: "ACTIVE", reauth_required: false }],
      complete_meli_refresh: [{ outcome: "COMPLETED", external_user_id: 7, token_version: 2, status: "ACTIVE" }],
      fail_meli_refresh: [{ outcome: "FAILURE_RECORDED", external_user_id: 7, token_version: 1, status: "REAUTH_REQUIRED" }],
    };
    const adapter = new SupabaseMeliOAuthControlPlane(async (name) => ({ data: rows[name], error: null }));
    expect(JSON.stringify(await adapter.initializeConnection(7, "fake-refresh"))).not.toContain("fake-refresh");
    expect(JSON.stringify(await adapter.completeRefresh({ externalUserId: 7, leaseId: claimedRow.lease_id, expectedVersion: 1, newRefreshToken: "new-fake" }))).not.toContain("new-fake");
    expect((await adapter.failRefresh({ externalUserId: 7, leaseId: claimedRow.lease_id, expectedVersion: 1, errorCode: "INVALID_GRANT", outcomeClass: "REAUTH_REQUIRED" })).outcome).toBe("FAILURE_RECORDED");
  });
});
