import { describe, expect, it, vi } from "vitest";
import { MeliHttpTokenProvider, MeliTokenProviderError } from "../src/server/oauth/token-provider.js";

const options = (fetchImpl: typeof fetch) => ({ clientId: "831976763519093", clientSecret: "fake-client-secret", fetchImpl });
const jsonResponse = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("provider oficial de refresh Mercado Livre", () => {
  it("usa POST form-urlencoded, timeout e não repete", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      access_token: "fake-access", refresh_token: "fake-next-refresh", expires_in: 21600, user_id: 296984475,
    }, 200));
    const provider = new MeliHttpTokenProvider(options(fetchImpl));
    await expect(provider.refresh("fake-current-refresh")).resolves.toMatchObject({ accessToken: "fake-access", refreshToken: "fake-next-refresh" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.mercadolibre.com/oauth/token");
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_secret")).toBe("fake-client-secret");
  });

  it.each([
    [400, { error: "invalid_grant" }, "INVALID_GRANT", "REAUTH_REQUIRED"],
    [401, { error: "invalid_client" }, "INVALID_CLIENT", "CONFIG_ERROR"],
    [429, { error: "rate_limit" }, "RATE_LIMITED", "OUTCOME_UNKNOWN"],
    [503, { error: "unavailable" }, "UPSTREAM_UNAVAILABLE", "OUTCOME_UNKNOWN"],
  ] as const)("classifica HTTP %s sem retry", async (status, body, code, disposition) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status));
    const provider = new MeliHttpTokenProvider(options(fetchImpl));
    await expect(provider.refresh("fake-refresh")).rejects.toMatchObject({ errorCode: code, disposition });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fecha em OUTCOME_UNKNOWN para transporte e resposta 200 inválida", async () => {
    const network = new MeliHttpTokenProvider(options(vi.fn<typeof fetch>().mockRejectedValue(new Error("reset"))));
    await expect(network.refresh("fake-refresh")).rejects.toMatchObject({
      disposition: "OUTCOME_UNKNOWN", category: "AMBIGUOUS_TRANSPORT_FAILURE",
    });
    const invalid = new MeliHttpTokenProvider(options(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ access_token: "only" }, 200))));
    await expect(invalid.refresh("fake-refresh")).rejects.toBeInstanceOf(MeliTokenProviderError);
    await expect(invalid.refresh("fake-refresh")).rejects.toMatchObject({ errorCode: "RESPONSE_INVALID", disposition: "OUTCOME_UNKNOWN" });
  });
});
