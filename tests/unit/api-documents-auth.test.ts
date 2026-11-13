import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  // Route modules import the Prisma client at module scope. A lazy adapter
  // never connects for these handler tests, but the URL must be parseable.
  process.env.DATABASE_URL ??=
    "postgresql://ida:ida@localhost:5434/ida?schema=public";
});

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listDocumentsForUser: vi.fn(),
  deleteDocumentForUser: vi.fn(),
  createDocumentWithPages: vi.fn(),
  extractPdfPages: vi.fn(),
  validatePdfUpload: vi.fn(),
}));

vi.mock("@/lib/dal", () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock("@/lib/documents/queries", () => ({
  listDocumentsForUser: mocks.listDocumentsForUser,
  deleteDocumentForUser: mocks.deleteDocumentForUser,
}));

vi.mock("@/lib/documents/create-document", () => ({
  createDocumentWithPages: mocks.createDocumentWithPages,
}));

vi.mock("@/lib/pdf/extract-text", () => ({
  extractPdfPages: mocks.extractPdfPages,
}));

vi.mock("@/lib/pdf/validation", () => ({
  validatePdfUpload: mocks.validatePdfUpload,
}));

import { GET } from "@/app/api/documents/route";
import { DELETE } from "@/app/api/documents/[id]/route";
import { AppError } from "@/lib/errors";

const anonymous = () => {
  mocks.requireApiUser.mockRejectedValue(
    new AppError("UNAUTHENTICATED", "Iniciá sesión para acceder a este recurso."),
  );
};

describe("protected document route handlers", () => {
  it("returns 401 for anonymous list requests without querying documents", async () => {
    anonymous();

    const response = await GET();
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(mocks.listDocumentsForUser).not.toHaveBeenCalled();
  });

  it("uses the session user id and lists only that user's documents", async () => {
    mocks.requireApiUser.mockResolvedValue({
      id: "session-user-a",
      email: "a@example.test",
    });
    mocks.listDocumentsForUser.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.listDocumentsForUser).toHaveBeenCalledWith("session-user-a");
  });

  it("returns the same 404 for a foreign document and a missing one", async () => {
    mocks.requireApiUser.mockResolvedValue({
      id: "session-user-a",
      email: "a@example.test",
    });
    mocks.deleteDocumentForUser.mockResolvedValue(0);

    const response = await DELETE(new Request("http://localhost/api/documents/doc-b"), {
      params: Promise.resolve({ id: "doc-b" }),
    });
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("DOCUMENT_NOT_FOUND");
    expect(mocks.deleteDocumentForUser).toHaveBeenCalledWith(
      "session-user-a",
      "doc-b",
    );
  });

  it("deletes only when the scoped delete matched the authenticated owner", async () => {
    mocks.requireApiUser.mockResolvedValue({
      id: "session-user-a",
      email: "a@example.test",
    });
    mocks.deleteDocumentForUser.mockResolvedValue(1);

    const response = await DELETE(new Request("http://localhost/api/documents/doc-a"), {
      params: Promise.resolve({ id: "doc-a" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(mocks.deleteDocumentForUser).toHaveBeenCalledWith(
      "session-user-a",
      "doc-a",
    );
  });
});
