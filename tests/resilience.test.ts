import { describe, expect, it, vi } from "vitest";
import { MeliApiError, MeliClient } from "../src/meli/client.js";
import { retryDecision } from "../src/meli/resilience.js";

describe("retry e backoff", () => {
  it("usa Retry-After e não repete 400/401/403/404", () => {
    expect(retryDecision(429, 0, "2", () => 0)).toEqual({ retry: true, delayMs: 2000 });
    for (const status of [400, 401, 403, 404]) {
      expect(retryDecision(status, 0, null)).toEqual({ retry: false, delayMs: 0 });
    }
  });

  it("repete falha transitória e então retorna sucesso", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"id":1}', { status: 200, headers: { "content-type": "application/json" } }));
    const sleepMock = vi.fn(async () => undefined);
    const client = new MeliClient({ fetchImpl: fetchMock, sleepImpl: sleepMock });
    const response = await client.get<{ id: number }>("/users/me");
    expect(response.data?.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  it("não repete erro 403", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"message":"forbidden"}', { status: 403 }));
    const client = new MeliClient({ fetchImpl: fetchMock, sleepImpl: async () => undefined });
    await expect(client.get("/users/me")).rejects.toBeInstanceOf(MeliApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
