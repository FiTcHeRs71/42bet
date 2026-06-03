import { afterEach, describe, expect, test, vi } from "vitest";

// Mock the server-only modules so importing the route never evaluates them
// (the real ones import "server-only" and hit the network / service_role key).
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/football-data", () => ({ fetchWorldCupMatches: vi.fn() }));

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL;
  vi.clearAllMocks();
});

describe("GET /api/cron/sync-results — auth", () => {
  test("returns 401 when the Authorization header is missing", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import("../src/app/api/cron/sync-results/route");
    const res = await GET(new Request("https://x/api/cron/sync-results"));
    expect(res.status).toBe(401);
  });

  test("returns 401 when the bearer token is wrong", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import("../src/app/api/cron/sync-results/route");
    const res = await GET(
      new Request("https://x/api/cron/sync-results", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
