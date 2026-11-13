import { afterEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { GET } from "@/app/api/health/route";

afterEach(() => {
  vi.restoreAllMocks();
  queryRaw.mockReset();
});

describe("GET /api/health", () => {
  it("returns a minimal OK response when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 without leaking connection details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    queryRaw.mockRejectedValue(
      new Error("password=secret host=internal-db connection refused"),
    );

    const response = await GET();
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).toBe(JSON.stringify({ status: "unavailable" }));
    expect(body).not.toContain("secret");
    expect(body).not.toContain("internal-db");
  });
});
