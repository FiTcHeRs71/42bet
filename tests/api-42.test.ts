// tests/api-42.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { nextDelay } from "@/lib/api-42";

function tokenResponse(token: string) {
  return new Response(JSON.stringify({ access_token: token, expires_in: 7200 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
/** Recharge le module pour repartir d'un cache token / throttle vierge. */
async function loadFresh() {
  vi.resetModules();
  return import("@/lib/api-42");
}

beforeEach(() => {
  process.env.FT_API_UID = "uid";
  process.env.FT_API_SECRET = "secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nextDelay (pur)", () => {
  it("0 quand jamais envoyé", () => {
    expect(nextDelay(null, 1000, 500)).toBe(0);
  });
  it("0 quand l'intervalle est écoulé", () => {
    expect(nextDelay(0, 600, 500)).toBe(0);
  });
  it("le reste quand c'est trop tôt", () => {
    expect(nextDelay(1000, 1200, 500)).toBe(300);
  });
});

describe("fetch42", () => {
  it("rejette les chemins hors /v2/", async () => {
    const { fetch42 } = await loadFresh();
    await expect(fetch42("/v3/nope")).rejects.toThrow(/\/v2\//);
  });

  it("lève Api42Error sur statut non-2xx", async () => {
    const { fetch42, Api42Error } = await loadFresh();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse("t"))
        .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500)),
    );
    await expect(fetch42("/v2/coalitions")).rejects.toBeInstanceOf(Api42Error);
  });

  it("envoie le bearer token et renvoie le JSON parsé", async () => {
    const { fetch42 } = await loadFresh();
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-xyz"))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Order" }]));
    vi.stubGlobal("fetch", f);
    const data = await fetch42<{ id: number; name: string }[]>(
      "/v2/users/42/coalitions",
    );
    expect(data).toEqual([{ id: 1, name: "Order" }]);
    const headers = (f.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer tok-xyz");
  });

  it("réutilise le token caché sur plusieurs appels", async () => {
    const { fetch42 } = await loadFresh();
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("t1"))
      .mockImplementation(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", f);
    await fetch42("/v2/coalitions");
    await fetch42("/v2/coalitions");
    const tokenCalls = f.mock.calls.filter((c) =>
      String(c[0]).includes("/oauth/token"),
    );
    expect(tokenCalls).toHaveLength(1);
  });
});
