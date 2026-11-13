import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabasePoolMax, getUploadLimits } from "@/lib/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getUploadLimits", () => {
  it("keeps the development default at 10 MB outside Vercel", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("MAX_PDF_SIZE_MB", undefined);

    const limits = getUploadLimits();

    expect(limits.maxSizeMb).toBe(10);
    expect(limits.maxSizeBytes).toBe(10 * 1024 * 1024);
    expect(limits.maxPages).toBe(50);
  });

  it("honors an explicit development limit", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("MAX_PDF_SIZE_MB", "12");

    expect(getUploadLimits().maxSizeMb).toBe(12);
  });

  it("defaults to 4 MB on Vercel because of the request body limit", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MAX_PDF_SIZE_MB", undefined);

    const limits = getUploadLimits();

    expect(limits.maxSizeMb).toBe(4);
    expect(limits.maxSizeBytes).toBe(4 * 1024 * 1024);
  });

  it("clamps a larger configured limit on Vercel instead of accepting it silently", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MAX_PDF_SIZE_MB", "10");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getUploadLimits().maxSizeMb).toBe(4);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("MAX_PDF_SIZE_MB"),
    );
  });

  it("honors a smaller explicit limit on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("MAX_PDF_SIZE_MB", "2");

    expect(getUploadLimits().maxSizeMb).toBe(2);
  });
});

describe("getDatabasePoolMax", () => {
  it("uses a small pool by default on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_POOL_MAX", undefined);

    expect(getDatabasePoolMax()).toBe(1);
  });

  it("keeps a larger development default", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("DATABASE_POOL_MAX", undefined);

    expect(getDatabasePoolMax()).toBe(5);
  });

  it("accepts an explicit value inside the allowed range", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_POOL_MAX", "3");

    expect(getDatabasePoolMax()).toBe(3);
  });

  it("ignores an out-of-range value", () => {
    vi.stubEnv("DATABASE_POOL_MAX", "999");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getDatabasePoolMax()).toBe(5);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("DATABASE_POOL_MAX"),
    );
  });
});
